use futures_util::TryStreamExt;
use serde_json::json;
use sqlx::{Column, Row};

use super::super::*;
use super::PostgresAdapter;

pub(super) async fn execute_postgres_query(
    adapter: &PostgresAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let statement = selected_query(request);
    let query = if execute_mode(request) == "explain" {
        format!("EXPLAIN {statement}")
    } else {
        statement.to_string()
    };
    let row_limit = request
        .row_limit
        .unwrap_or(adapter.execution_capabilities().default_row_limit);
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(&postgres_dsn(connection))
        .await?;
    let mut stream = sqlx::query(&query).fetch(&pool);
    let mut rows = Vec::new();
    while let Some(row) = stream.try_next().await? {
        rows.push(row);
        if rows.len() > row_limit as usize {
            break;
        }
    }
    drop(stream);
    let columns = rows
        .first()
        .map(|row| {
            row.columns()
                .iter()
                .map(|column| column.name().to_string())
                .collect()
        })
        .unwrap_or_else(Vec::new);
    let total_rows = rows.len();
    let tabular_rows = rows
        .iter()
        .take(row_limit as usize)
        .map(|row| {
            (0..row.columns().len())
                .map(|index| stringify_pg_cell(row, index))
                .collect()
        })
        .collect::<Vec<Vec<String>>>();
    pool.close().await;
    let table_payload = payload_table(columns.clone(), tabular_rows);
    let explain_payload = if execute_mode(request) == "explain" {
        let explain_text = if columns.is_empty() {
            "Explain plan returned no rows.".to_string()
        } else {
            rows.iter()
                .flat_map(|row| (0..row.columns().len()).map(|index| stringify_pg_cell(row, index)))
                .collect::<Vec<String>>()
                .join("\n")
        };
        Some(payload_raw(explain_text))
    } else {
        None
    };

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("{total_rows} row(s) returned from {}.", connection.name),
        default_renderer: if execute_mode(request) == "explain" {
            "raw"
        } else {
            "table"
        },
        renderer_modes: if execute_mode(request) == "explain" {
            vec!["raw", "table", "json"]
        } else {
            vec!["table", "json", "raw"]
        },
        payloads: vec![
            if let Some(payload) = explain_payload.clone() {
                payload
            } else {
                table_payload.clone()
            },
            payload_json(json!({
                "engine": connection.engine,
                "rowCount": total_rows,
                "rowLimit": row_limit,
            })),
            if execute_mode(request) == "explain" {
                table_payload
            } else {
                payload_raw(statement.to_string())
            },
        ],
        notices: sql_history_notice(notices),
        duration_ms: duration_ms(started),
        row_limit: Some(row_limit),
        truncated: total_rows > row_limit as usize,
        explain_payload,
    }))
}
