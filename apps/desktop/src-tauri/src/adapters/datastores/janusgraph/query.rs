use serde_json::{json, Value};

use super::super::super::*;
use super::connection::{janusgraph_gremlin_body, janusgraph_run_gremlin};
use super::JanusGraphAdapter;

type NormalizedJanusGraphResult = (Vec<Vec<String>>, Option<(Value, Value)>);

pub(super) async fn execute_janusgraph_query(
    adapter: &JanusGraphAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let query_text = selected_query(request).trim();
    if query_text.is_empty() {
        return Err(CommandError::new(
            "janusgraph-query-missing",
            "No Gremlin query was provided.",
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let gremlin = decorate_gremlin_for_mode(query_text, execute_mode(request));
    let value = janusgraph_run_gremlin(connection, &gremlin).await?;
    let (rows, graph) = normalize_janusgraph_result(&value, row_limit);
    let row_count = rows.len() as u32;
    let mut payloads = Vec::new();
    if let Some((nodes, edges)) = graph {
        payloads.push(payload_graph(nodes, edges));
    }
    payloads.extend([
        payload_table(vec!["value".into()], rows),
        payload_json(value.clone()),
        payload_raw(janusgraph_gremlin_body(connection, &gremlin)?),
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
        summary: format!("JanusGraph Gremlin returned {row_count} result item(s)."),
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

pub(crate) fn normalize_janusgraph_result(
    value: &Value,
    row_limit: u32,
) -> NormalizedJanusGraphResult {
    let data = gremlin_data(value);
    let rows = data
        .iter()
        .take(row_limit as usize)
        .map(|item| vec![gremlin_value_to_string(item)])
        .collect::<Vec<_>>();
    let graph = graph_payload_from_gremlin_values(&data);
    (rows, graph)
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

fn graph_payload_from_gremlin_values(values: &[Value]) -> Option<(Value, Value)> {
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

fn gremlin_value_to_string(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{decorate_gremlin_for_mode, normalize_janusgraph_result};

    #[test]
    fn janusgraph_decorates_explain_and_profile_traversals() {
        assert_eq!(
            decorate_gremlin_for_mode("g.V().limit(1);", "explain"),
            "g.V().limit(1).explain()"
        );
        assert_eq!(
            decorate_gremlin_for_mode("g.V().limit(1)", "profile"),
            "g.V().limit(1).profile()"
        );
    }

    #[test]
    fn janusgraph_result_normalizes_rows_and_graph_items() {
        let value = json!({
            "status": { "code": 200 },
            "result": {
                "data": [
                    { "id": 1, "label": "person", "properties": { "name": "Ada" } },
                    { "id": 2, "label": "knows", "outV": 1, "inV": 3 }
                ]
            }
        });
        let (rows, graph) = normalize_janusgraph_result(&value, 25);
        let (nodes, edges) = graph.expect("graph payload");

        assert_eq!(rows.len(), 2);
        assert_eq!(nodes.as_array().unwrap().len(), 1);
        assert_eq!(edges.as_array().unwrap().len(), 1);
    }

    #[test]
    fn janusgraph_result_respects_row_limit() {
        let value = json!({
            "status": { "code": 200 },
            "result": { "data": [1, 2] }
        });
        let (rows, _graph) = normalize_janusgraph_result(&value, 1);

        assert_eq!(rows.len(), 1);
    }
}
