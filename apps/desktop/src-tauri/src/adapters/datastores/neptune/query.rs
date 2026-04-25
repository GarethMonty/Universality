use serde_json::{json, Value};

use super::super::super::*;
use super::connection::{
    neptune_gremlin_body, neptune_post_form, neptune_post_json, parse_neptune_json,
    percent_encode_form,
};
use super::NeptuneAdapter;

type NormalizedGraphResult = (Vec<Vec<String>>, Option<(Value, Value)>);

pub(super) async fn execute_neptune_query(
    adapter: &NeptuneAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let query_text = selected_query(request).trim();
    if query_text.is_empty() {
        return Err(CommandError::new(
            "neptune-query-missing",
            "No Neptune graph query was provided.",
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let (value, raw_request, columns, rows, graph) =
        execute_by_language(connection, request, query_text, row_limit).await?;
    let row_count = rows.len() as u32;
    let mut payloads = Vec::new();
    if let Some((nodes, edges)) = graph {
        payloads.push(payload_graph(nodes, edges));
    }
    payloads.extend([
        payload_table(columns, rows),
        payload_json(value.clone()),
        payload_raw(raw_request),
    ]);
    let explain_payload = if matches!(execute_mode(request), "explain" | "profile") {
        Some(value.clone())
    } else {
        None
    };
    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("Amazon Neptune query returned {row_count} row(s)."),
        default_renderer: &default_renderer,
        renderer_modes,
        payloads,
        notices,
        duration_ms: duration_ms(started),
        row_limit: Some(row_limit),
        truncated: false,
        explain_payload,
    }))
}

async fn execute_by_language(
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    query_text: &str,
    row_limit: u32,
) -> Result<
    (
        Value,
        String,
        Vec<String>,
        Vec<Vec<String>>,
        Option<(Value, Value)>,
    ),
    CommandError,
> {
    match request.language.as_str() {
        "sparql" => {
            let body = format!("query={}", percent_encode_form(query_text));
            let response = neptune_post_form(
                connection,
                "/sparql",
                &body,
                "application/sparql-results+json, application/json",
            )
            .await?;
            let value = parse_neptune_json(&response.body)?;
            let (columns, rows) = normalize_sparql_result(&value, row_limit);
            Ok((value, body, columns, rows, None))
        }
        "opencypher" | "cypher" => {
            let body = format!("query={}", percent_encode_form(query_text));
            let response =
                neptune_post_form(connection, "/openCypher", &body, "application/json").await?;
            let value = parse_neptune_json(&response.body)?;
            let (columns, rows) = normalize_json_rows(&value, row_limit);
            Ok((value, body, columns, rows, None))
        }
        _ => {
            let gremlin = decorate_gremlin_for_mode(query_text, execute_mode(request));
            let body = neptune_gremlin_body(&gremlin);
            let response = neptune_post_json(connection, "/gremlin", &body).await?;
            let value = parse_neptune_json(&response.body)?;
            let (rows, graph) = normalize_gremlin_result(&value, row_limit);
            Ok((value, body, vec!["value".into()], rows, graph))
        }
    }
}

pub(crate) fn decorate_gremlin_for_mode(query: &str, mode: &str) -> String {
    let trimmed = query.trim().trim_end_matches(';');
    match mode {
        "explain" if trimmed.starts_with("g.") && !trimmed.ends_with(".explain()") => {
            format!("{trimmed}.explain()")
        }
        "profile" if trimmed.starts_with("g.") && !trimmed.ends_with(".profile()") => {
            format!("{trimmed}.profile()")
        }
        _ => trimmed.into(),
    }
}

pub(crate) fn normalize_gremlin_result(value: &Value, row_limit: u32) -> NormalizedGraphResult {
    let data = gremlin_data(value);
    let rows = data
        .iter()
        .take(row_limit as usize)
        .map(|item| vec![json_value_to_string(item)])
        .collect::<Vec<_>>();
    let graph = graph_payload_from_values(&data);
    (rows, graph)
}

pub(crate) fn normalize_sparql_result(
    value: &Value,
    row_limit: u32,
) -> (Vec<String>, Vec<Vec<String>>) {
    let columns = value
        .pointer("/head/vars")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<Vec<_>>();
    let rows = value
        .pointer("/results/bindings")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(row_limit as usize)
        .map(|binding| {
            columns
                .iter()
                .map(|column| {
                    binding
                        .get(column)
                        .and_then(|item| item.get("value"))
                        .map(json_value_to_string)
                        .unwrap_or_default()
                })
                .collect()
        })
        .collect();
    (columns, rows)
}

pub(crate) fn normalize_json_rows(
    value: &Value,
    row_limit: u32,
) -> (Vec<String>, Vec<Vec<String>>) {
    let rows_value = value
        .get("results")
        .or_else(|| value.get("resultsList"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    let rows_array = rows_value.as_array().cloned().unwrap_or_default();
    let mut columns = rows_array
        .iter()
        .find_map(Value::as_object)
        .map(|object| object.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_else(|| vec!["value".into()]);
    columns.sort();
    let rows = rows_array
        .iter()
        .take(row_limit as usize)
        .map(|item| {
            if let Some(object) = item.as_object() {
                columns
                    .iter()
                    .map(|column| {
                        object
                            .get(column)
                            .map(json_value_to_string)
                            .unwrap_or_default()
                    })
                    .collect()
            } else {
                vec![json_value_to_string(item)]
            }
        })
        .collect();
    (columns, rows)
}

fn gremlin_data(value: &Value) -> Vec<Value> {
    let data = value
        .pointer("/result/data")
        .cloned()
        .unwrap_or_else(|| json!([]));
    if let Some(items) = data.as_array() {
        return items.clone();
    }
    vec![data]
}

fn graph_payload_from_values(values: &[Value]) -> Option<(Value, Value)> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    for value in values {
        collect_graph_items(value, &mut nodes, &mut edges);
    }

    if nodes.is_empty() && edges.is_empty() {
        None
    } else {
        Some((json!(nodes), json!(edges)))
    }
}

fn collect_graph_items(value: &Value, nodes: &mut Vec<Value>, edges: &mut Vec<Value>) {
    if looks_like_edge(value) {
        edges.push(value.clone());
        return;
    }
    if looks_like_vertex(value) {
        nodes.push(value.clone());
        return;
    }
    match value {
        Value::Array(items) => {
            for item in items {
                collect_graph_items(item, nodes, edges);
            }
        }
        Value::Object(map) => {
            for item in map.values() {
                collect_graph_items(item, nodes, edges);
            }
        }
        _ => {}
    }
}

fn looks_like_vertex(value: &Value) -> bool {
    let object = match value.as_object() {
        Some(object) => object,
        None => return false,
    };
    object.contains_key("id")
        && object.contains_key("label")
        && (object.contains_key("properties")
            || object.get("@type").and_then(Value::as_str) == Some("g:Vertex"))
}

fn looks_like_edge(value: &Value) -> bool {
    let object = match value.as_object() {
        Some(object) => object,
        None => return false,
    };
    object.contains_key("id")
        && object.contains_key("label")
        && (object.contains_key("inV")
            || object.contains_key("outV")
            || object.get("@type").and_then(Value::as_str) == Some("g:Edge"))
}

fn json_value_to_string(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        decorate_gremlin_for_mode, normalize_gremlin_result, normalize_json_rows,
        normalize_sparql_result,
    };

    #[test]
    fn neptune_decorates_gremlin_profile_mode() {
        assert_eq!(
            decorate_gremlin_for_mode("g.V().limit(1)", "profile"),
            "g.V().limit(1).profile()"
        );
    }

    #[test]
    fn neptune_gremlin_result_extracts_graph_payload() {
        let value = json!({
            "result": {
                "data": [
                    { "id": 1, "label": "person", "properties": { "name": "Ada" } },
                    { "id": 2, "label": "knows", "outV": 1, "inV": 3 }
                ]
            }
        });
        let (rows, graph) = normalize_gremlin_result(&value, 25);
        let (nodes, edges) = graph.expect("graph payload");

        assert_eq!(rows.len(), 2);
        assert_eq!(nodes.as_array().unwrap().len(), 1);
        assert_eq!(edges.as_array().unwrap().len(), 1);
    }

    #[test]
    fn neptune_sparql_result_normalizes_bindings() {
        let value = json!({
            "head": { "vars": ["s", "p"] },
            "results": {
                "bindings": [{
                    "s": { "type": "uri", "value": "urn:1" },
                    "p": { "type": "literal", "value": "name" }
                }]
            }
        });
        let (columns, rows) = normalize_sparql_result(&value, 100);

        assert_eq!(columns, vec!["s", "p"]);
        assert_eq!(rows, vec![vec!["urn:1", "name"]]);
    }

    #[test]
    fn neptune_json_rows_use_object_keys() {
        let value = json!({
            "results": [{ "name": "Ada", "age": 42 }]
        });
        let (columns, rows) = normalize_json_rows(&value, 100);

        assert_eq!(columns, vec!["age", "name"]);
        assert_eq!(rows[0], vec!["42", "Ada"]);
    }
}
