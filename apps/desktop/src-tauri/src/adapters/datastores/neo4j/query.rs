use serde_json::{json, Value};

use super::super::super::*;
use super::connection::{neo4j_run_cypher, neo4j_statement_body};
use super::Neo4jAdapter;

type NormalizedNeo4jResult = (Vec<String>, Vec<Vec<String>>, Option<(Value, Value)>);

pub(super) async fn execute_neo4j_query(
    adapter: &Neo4jAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let query_text = selected_query(request).trim();
    if query_text.is_empty() {
        return Err(CommandError::new(
            "neo4j-query-missing",
            "No Cypher query was provided.",
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let statement = match execute_mode(request) {
        "explain" => format!("EXPLAIN {query_text}"),
        "profile" => format!("PROFILE {query_text}"),
        _ => query_text.into(),
    };
    let value = neo4j_run_cypher(connection, &statement).await?;
    let (columns, rows, graph) = normalize_neo4j_result(&value, row_limit);
    let row_count = rows.len() as u32;
    let mut payloads = Vec::new();
    if let Some((nodes, edges)) = graph {
        payloads.push(payload_graph(nodes, edges));
    }
    payloads.extend([
        payload_table(columns, rows),
        payload_json(value.clone()),
        payload_raw(neo4j_statement_body(&statement)),
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
        summary: format!("Neo4j Cypher returned {row_count} row(s)."),
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

pub(crate) fn normalize_neo4j_result(value: &Value, row_limit: u32) -> NormalizedNeo4jResult {
    let result = value
        .get("results")
        .and_then(Value::as_array)
        .and_then(|results| results.first());
    let columns = result
        .and_then(|result| result.get("columns"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    for item in result
        .and_then(|result| result.get("data"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if rows.len() < row_limit as usize {
            let row = item
                .get("row")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(neo4j_value_to_string)
                .collect::<Vec<_>>();
            rows.push(row);
        }

        if let Some(graph) = item.get("graph") {
            nodes.extend(
                graph
                    .get("nodes")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .cloned(),
            );
            edges.extend(
                graph
                    .get("relationships")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .cloned(),
            );
        }
    }

    let graph = if nodes.is_empty() && edges.is_empty() {
        None
    } else {
        Some((json!(nodes), json!(edges)))
    };

    (columns, rows, graph)
}

fn neo4j_value_to_string(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::normalize_neo4j_result;

    #[test]
    fn neo4j_result_normalizes_table_and_graph_payloads() {
        let value = json!({
            "results": [{
                "columns": ["n"],
                "data": [{
                    "row": [{ "name": "Ada" }],
                    "graph": {
                        "nodes": [{ "id": "1", "labels": ["Person"] }],
                        "relationships": []
                    }
                }]
            }],
            "errors": []
        });

        let (columns, rows, graph) = normalize_neo4j_result(&value, 25);
        let (nodes, edges) = graph.expect("graph payload");

        assert_eq!(columns, vec!["n"]);
        assert_eq!(rows.len(), 1);
        assert_eq!(nodes.as_array().unwrap().len(), 1);
        assert_eq!(edges.as_array().unwrap().len(), 0);
    }

    #[test]
    fn neo4j_result_respects_row_limit() {
        let value = json!({
            "results": [{
                "columns": ["n"],
                "data": [{ "row": [1] }, { "row": [2] }]
            }],
            "errors": []
        });

        let (_columns, rows, _graph) = normalize_neo4j_result(&value, 1);
        assert_eq!(rows.len(), 1);
    }
}
