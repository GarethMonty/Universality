use sqlx::{Column, Row, TypeInfo};

use super::super::super::*;

pub(super) fn stringify_sqlite_cell(row: &sqlx::sqlite::SqliteRow, index: usize) -> String {
    stringify_sqlx_common(
        [
            row.try_get::<Option<String>, _>(index).ok().flatten(),
            row.try_get::<Option<bool>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<i64>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<i32>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<f64>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            None,
            row.try_get::<Option<Vec<u8>>, _>(index)
                .ok()
                .flatten()
                .map(|item| format!("<{} bytes>", item.len())),
        ],
        format!("<{}>", row.columns()[index].type_info().name()),
    )
}

pub(super) fn sqlite_dsn(connection: &ResolvedConnectionProfile) -> String {
    connection.connection_string.clone().unwrap_or_else(|| {
        let path = connection
            .database
            .clone()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| connection.host.clone());

        if path.starts_with("sqlite:") {
            path
        } else if path.contains(':') || path.starts_with('\\') || path.starts_with('/') {
            format!("sqlite:///{}", path.replace('\\', "/"))
        } else {
            format!("sqlite://{path}")
        }
    })
}

pub(super) async fn test_sqlite_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_dsn(connection))
        .await?;
    let _: i64 = sqlx::query_scalar("select 1").fetch_one(&pool).await?;
    pool.close().await;

    Ok(ConnectionTestResult {
        ok: true,
        engine: connection.engine.clone(),
        message: format!("Connection test succeeded for {}.", connection.name),
        warnings: Vec::new(),
        resolved_host: connection.host.clone(),
        resolved_database: connection.database.clone(),
        duration_ms: Some(duration_ms(started)),
    })
}
