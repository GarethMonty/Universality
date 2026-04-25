use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use super::super::super::*;

pub(super) async fn clickhouse_query(
    connection: &ResolvedConnectionProfile,
    query: &str,
) -> Result<String, CommandError> {
    let host = connection.host.trim();
    let port = connection.port.unwrap_or(8123);
    let database = connection
        .database
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("default");
    let path = format!("/?database={database}");
    let auth_header = match (&connection.username, &connection.password) {
        (Some(username), Some(password)) => Some(format!(
            "X-ClickHouse-User: {username}\r\nX-ClickHouse-Key: {password}\r\n"
        )),
        (Some(username), None) => Some(format!("X-ClickHouse-User: {username}\r\n")),
        _ => None,
    };
    let body = query.as_bytes();
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: text/plain; charset=utf-8\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        auth_header.unwrap_or_default(),
        body.len(),
        query
    );
    let mut stream = TcpStream::connect((host, port)).await?;
    stream.write_all(request.as_bytes()).await?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await?;
    let raw = String::from_utf8_lossy(&response).to_string();
    let (_headers, body) = raw.split_once("\r\n\r\n").unwrap_or(("", &raw));

    if raw.starts_with("HTTP/1.1 2") || raw.starts_with("HTTP/1.0 2") {
        Ok(body.to_string())
    } else {
        Err(CommandError::new(
            "clickhouse-http-error",
            body.lines().next().unwrap_or("ClickHouse request failed."),
        ))
    }
}

pub(super) async fn test_clickhouse_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    let response = clickhouse_query(connection, "SELECT 1 FORMAT TSV").await?;
    Ok(ConnectionTestResult {
        ok: response.trim() == "1",
        engine: connection.engine.clone(),
        message: format!(
            "ClickHouse HTTP connection test succeeded for {}.",
            connection.name
        ),
        warnings: Vec::new(),
        resolved_host: connection.host.clone(),
        resolved_database: connection.database.clone(),
        duration_ms: Some(duration_ms(started)),
    })
}
