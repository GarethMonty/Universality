use super::super::*;

pub(super) async fn test_timescale_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(&postgres_dsn(connection))
        .await?;
    let extension: Option<String> =
        sqlx::query_scalar("select extversion from pg_extension where extname = 'timescaledb'")
            .fetch_optional(&pool)
            .await?;
    let _: i64 = sqlx::query_scalar("select 1::bigint")
        .fetch_one(&pool)
        .await?;
    pool.close().await;

    Ok(ConnectionTestResult {
        ok: true,
        engine: connection.engine.clone(),
        message: format!(
            "TimescaleDB connection test succeeded for {}.",
            connection.name
        ),
        warnings: if extension.is_some() {
            Vec::new()
        } else {
            vec!["Connected through PostgreSQL wire protocol, but the timescaledb extension was not visible in pg_extension.".into()]
        },
        resolved_host: connection.host.clone(),
        resolved_database: connection.database.clone(),
        duration_ms: Some(duration_ms(started)),
    })
}
