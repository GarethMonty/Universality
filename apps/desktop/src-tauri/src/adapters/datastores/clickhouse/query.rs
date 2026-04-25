use std::time::Instant;

use serde_json::json;

use super::super::super::*;
use super::connection::clickhouse_query;
use super::payloads::clickhouse_json_payloads;
use super::ClickHouseAdapter;

pub(super) async fn execute_clickhouse_query(
    adapter: &ClickHouseAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let statement = selected_query(request).trim();
    if statement.is_empty() {
        return Err(CommandError::new(
            "clickhouse-query-missing",
            "No ClickHouse SQL was provided.",
        ));
    }
    let query = if execute_mode(request) == "explain" {
        format!("EXPLAIN {statement}")
    } else if statement.to_ascii_lowercase().contains(" format ") {
        statement.to_string()
    } else {
        format!("{statement} FORMAT JSON")
    };
    let raw = clickhouse_query(connection, &query).await?;
    let (payloads, row_count) = if execute_mode(request) == "explain" {
        (
            vec![
                payload_plan(
                    "text",
                    json!({ "plan": raw.lines().collect::<Vec<&str>>() }),
                    "ClickHouse EXPLAIN plan returned successfully.",
                ),
                payload_raw(raw.trim().to_string()),
            ],
            raw.lines().count() as u32,
        )
    } else {
        clickhouse_json_payloads(&raw)
    };
    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("ClickHouse query returned {row_count} row(s)."),
        default_renderer: &default_renderer,
        renderer_modes,
        payloads,
        notices,
        duration_ms: duration_ms(started),
        row_limit: Some(
            request
                .row_limit
                .unwrap_or(adapter.execution_capabilities().default_row_limit),
        ),
        truncated: false,
        explain_payload: None,
    }))
}
