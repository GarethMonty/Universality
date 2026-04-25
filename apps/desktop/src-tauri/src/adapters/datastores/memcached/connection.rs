use super::super::super::*;
use super::protocol::memcached_request;

pub(super) async fn test_memcached_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    let response = memcached_request(connection, "version\r\nquit\r\n").await?;
    let ok = response.starts_with("VERSION");
    Ok(ConnectionTestResult {
        ok,
        engine: connection.engine.clone(),
        message: if ok {
            format!(
                "Memcached connection test succeeded for {}.",
                connection.name
            )
        } else {
            "Memcached endpoint responded, but did not return a VERSION banner.".into()
        },
        warnings: if ok {
            Vec::new()
        } else {
            vec![response
                .lines()
                .next()
                .unwrap_or("Unexpected response")
                .into()]
        },
        resolved_host: connection.host.clone(),
        resolved_database: connection.database.clone(),
        duration_ms: Some(duration_ms(started)),
    })
}
