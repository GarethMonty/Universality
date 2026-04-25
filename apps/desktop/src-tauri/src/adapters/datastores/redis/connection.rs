use super::super::super::*;

pub(super) async fn redis_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<redis::aio::MultiplexedConnection, CommandError> {
    let uri = connection.connection_string.clone().unwrap_or_else(|| {
        let auth = match (&connection.username, &connection.password) {
            (Some(username), Some(password)) => format!("{username}:{password}@"),
            (_, Some(password)) => format!(":{password}@"),
            _ => String::new(),
        };
        let db = connection
            .database
            .clone()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "0".into());

        format!(
            "redis://{}{host}:{port}/{db}",
            auth,
            host = connection.host,
            port = connection.port.unwrap_or(6379)
        )
    });

    let client = redis::Client::open(uri)?;
    Ok(client.get_multiplexed_async_connection().await?)
}

pub(super) async fn test_redis_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    let mut redis = redis_connection(connection).await?;
    let _: String = redis::cmd("PING").query_async(&mut redis).await?;

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
