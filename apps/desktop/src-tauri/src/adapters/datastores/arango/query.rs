use serde_json::{json, Value};

use super::super::super::*;
use super::connection::arango_post_json;
use super::ArangoDbAdapter;

pub(super) async fn execute_arango_query(
    adapter: &ArangoDbAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let query_text = selected_query(request).trim();
    if query_text.is_empty() {
        return Err(CommandError::new(
            "arango-query-missing",
            "No AQL query was provided.",
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let body = arango_cursor_body(query_text, row_limit);
    let (payloads, row_count, explain_payload) = if execute_mode(request) == "explain" {
        let explain_body = arango_explain_body(query_text);
        let response = arango_post_json(connection, "/_api/explain", &explain_body).await?;
        let value = parse_arango_json(&response.body)?;
        (
            vec![
                payload_plan("json", value.clone(), "ArangoDB AQL explain plan returned."),
                payload_json(value.clone()),
                payload_raw(explain_body),
            ],
            1,
            Some(value),
        )
    } else {
        let response = arango_post_json(connection, "/_api/cursor", &body).await?;
        let value = parse_arango_json(&response.body)?;
        let result = value.get("result").cloned().unwrap_or_else(|| json!([]));
        let (table_rows, graph_payload) = normalize_arango_result(&result);
        let row_count = table_rows.len() as u32;
        let mut payloads = vec![
            payload_document(result.clone()),
            payload_table(vec!["document".into()], table_rows),
            payload_json(value),
            payload_raw(body),
        ];
        if let Some((nodes, edges)) = graph_payload {
            payloads.insert(0, payload_graph(nodes, edges));
        }
        (payloads, row_count, None)
    };

    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("ArangoDB AQL returned {row_count} row(s)."),
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

fn parse_arango_json(body: &str) -> Result<Value, CommandError> {
    serde_json::from_str(body).map_err(|error| {
        CommandError::new(
            "arango-json-invalid",
            format!("ArangoDB returned invalid JSON: {error}"),
        )
    })
}

pub(crate) fn arango_cursor_body(query_text: &str, row_limit: u32) -> String {
    serde_json::to_string(&json!({
        "query": query_text,
        "count": true,
        "batchSize": row_limit,
        "options": {
            "fullCount": true
        }
    }))
    .unwrap_or_default()
}

pub(crate) fn arango_explain_body(query_text: &str) -> String {
    serde_json::to_string(&json!({
        "query": query_text,
        "options": {
            "allPlans": false
        }
    }))
    .unwrap_or_default()
}

pub(crate) fn normalize_arango_result(
    result: &Value,
) -> (Vec<Vec<String>>, Option<(Value, Value)>) {
    let rows = result
        .as_array()
        .into_iter()
        .flatten()
        .map(|item| vec![item.to_string()])
        .collect::<Vec<_>>();
    let graph = arango_graph_payload(result);
    (rows, graph)
}

fn arango_graph_payload(result: &Value) -> Option<(Value, Value)> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    for item in result.as_array()? {
        if let Some(vertices) = item.get("vertices").and_then(Value::as_array) {
            nodes.extend(vertices.iter().cloned());
        }
        if let Some(path_edges) = item.get("edges").and_then(Value::as_array) {
            edges.extend(path_edges.iter().cloned());
        }
        if item.get("_from").is_some() && item.get("_to").is_some() {
            edges.push(item.clone());
        } else if item.get("_id").is_some() {
            nodes.push(item.clone());
        }
    }

    if nodes.is_empty() && edges.is_empty() {
        None
    } else {
        Some((Value::Array(nodes), Value::Array(edges)))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{arango_cursor_body, normalize_arango_result};

    #[test]
    fn arango_cursor_body_sets_query_and_batch_size() {
        let body = arango_cursor_body("FOR doc IN users RETURN doc", 25);
        let value: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(value["query"], "FOR doc IN users RETURN doc");
        assert_eq!(value["batchSize"], 25);
    }

    #[test]
    fn arango_result_extracts_graph_nodes_and_edges() {
        let result = json!([
            { "_id": "users/1", "name": "Ada" },
            { "_id": "follows/1", "_from": "users/1", "_to": "users/2" }
        ]);
        let (rows, graph) = normalize_arango_result(&result);
        let (nodes, edges) = graph.expect("graph payload");

        assert_eq!(rows.len(), 2);
        assert_eq!(nodes.as_array().unwrap().len(), 1);
        assert_eq!(edges.as_array().unwrap().len(), 1);
    }
}
