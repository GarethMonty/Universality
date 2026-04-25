use futures_util::TryStreamExt;
use serde_json::json;
use sqlx::{Column, Row};

use super::super::super::*;
use super::connection::{sqlite_dsn, stringify_sqlite_cell};
use super::SqliteAdapter;

pub(super) async fn execute_sqlite_query(
    adapter: &SqliteAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let statement = selected_query(request);
    let row_limit = request
        .row_limit
        .unwrap_or(adapter.execution_capabilities().default_row_limit);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_dsn(connection))
        .await?;
    let mut stream = sqlx::query(statement).fetch(&pool);
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
                .map(|index| stringify_sqlite_cell(row, index))
                .collect()
        })
        .collect::<Vec<Vec<String>>>();
    pool.close().await;

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("{total_rows} row(s) returned from {}.", connection.name),
        default_renderer: "table",
        renderer_modes: vec!["table", "json", "raw"],
        payloads: vec![
            payload_table(columns, tabular_rows),
            payload_json(json!({
                "engine": connection.engine,
                "rowCount": total_rows,
                "rowLimit": row_limit,
            })),
            payload_raw(statement.to_string()),
        ],
        notices,
        duration_ms: duration_ms(started),
        row_limit: Some(row_limit),
        truncated: total_rows > row_limit as usize,
        explain_payload: None,
    }))
}
