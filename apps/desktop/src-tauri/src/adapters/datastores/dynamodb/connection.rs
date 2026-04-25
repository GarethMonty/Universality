use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use super::super::super::*;

pub(super) const API_PREFIX: &str = "DynamoDB_20120810.";

pub(super) struct DynamoDbResponse {
    pub(super) body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct DynamoDbEndpoint {
    host: String,
    port: u16,
    prefix: String,
}

pub(super) async fn test_dynamodb_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    let _ = dynamodb_call(connection, "ListTables", &json!({})).await?;

    Ok(ConnectionTestResult {
        ok: true,
        engine: connection.engine.clone(),
        message: format!(
            "DynamoDB JSON API connection test succeeded for {}.",
            connection.name
        ),
        warnings: vec![
            "DynamoDB adapter supports unsigned local/reverse-proxied endpoints today; AWS SigV4/IAM is surfaced as a guarded cloud-IAM path for the next live-cloud pass."
                .into(),
        ],
        resolved_host: connection.host.clone(),
        resolved_database: connection.database.clone(),
        duration_ms: Some(duration_ms(started)),
    })
}

pub(super) async fn dynamodb_call(
    connection: &ResolvedConnectionProfile,
    operation: &str,
    body: &Value,
) -> Result<Value, CommandError> {
    let body = serde_json::to_string(body).unwrap_or_else(|_| "{}".into());
    let response = dynamodb_post_json(connection, operation, &body).await?;
    parse_dynamodb_json(&response.body)
}

async fn dynamodb_post_json(
    connection: &ResolvedConnectionProfile,
    operation: &str,
    body: &str,
) -> Result<DynamoDbResponse, CommandError> {
    let endpoint = DynamoDbEndpoint::from_connection(connection)?;
    let path = endpoint.path("/");
    let target = format!("{API_PREFIX}{operation}");
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {}:{}\r\nAccept: application/x-amz-json-1.0\r\nContent-Type: application/x-amz-json-1.0\r\nX-Amz-Target: {target}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        endpoint.host,
        endpoint.port,
        body.len(),
        body
    );
    let mut stream = TcpStream::connect((endpoint.host.as_str(), endpoint.port)).await?;
    stream.write_all(request.as_bytes()).await?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await?;
    let raw = String::from_utf8_lossy(&response).to_string();
    let (headers, body) = raw.split_once("\r\n\r\n").unwrap_or(("", &raw));
    let status_code = headers
        .lines()
        .next()
        .and_then(|status| status.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(0);

    if (200..300).contains(&status_code) {
        Ok(DynamoDbResponse {
            body: body.to_string(),
        })
    } else {
        Err(CommandError::new(
            "dynamodb-http-error",
            body.lines()
                .next()
                .filter(|line| !line.trim().is_empty())
                .unwrap_or("DynamoDB JSON API request failed."),
        ))
    }
}

impl DynamoDbEndpoint {
    fn from_connection(connection: &ResolvedConnectionProfile) -> Result<Self, CommandError> {
        if let Some(connection_string) = connection.connection_string.as_deref() {
            return Self::from_url(connection_string);
        }

        let host = connection.host.trim();
        if host.is_empty() {
            return Err(CommandError::new(
                "dynamodb-endpoint-missing",
                "DynamoDB requires a host or http:// connection string.",
            ));
        }

        Ok(Self {
            host: host.into(),
            port: connection.port.unwrap_or(8000),
            prefix: connection
                .database
                .as_deref()
                .filter(|value| value.starts_with('/'))
                .unwrap_or("")
                .trim_end_matches('/')
                .into(),
        })
    }

    fn from_url(url: &str) -> Result<Self, CommandError> {
        let without_scheme = url.strip_prefix("http://").ok_or_else(|| {
            CommandError::new(
                "dynamodb-unsupported-url",
                "DynamoDB adapter currently supports plain http:// endpoints.",
            )
        })?;
        let (authority, path) = without_scheme
            .split_once('/')
            .unwrap_or((without_scheme, ""));
        let (host, port) = authority
            .rsplit_once(':')
            .and_then(|(host, port)| port.parse::<u16>().ok().map(|port| (host, port)))
            .unwrap_or((authority, 8000));

        if host.trim().is_empty() {
            return Err(CommandError::new(
                "dynamodb-endpoint-missing",
                "DynamoDB connection string did not include a host.",
            ));
        }

        Ok(Self {
            host: host.into(),
            port,
            prefix: if path.is_empty() {
                String::new()
            } else {
                format!("/{}", path.trim_end_matches('/'))
            },
        })
    }

    fn path(&self, path: &str) -> String {
        format!(
            "{}{}",
            self.prefix,
            if path.starts_with('/') {
                path.to_string()
            } else {
                format!("/{path}")
            }
        )
    }
}

pub(super) fn parse_dynamodb_json(body: &str) -> Result<Value, CommandError> {
    serde_json::from_str(body).map_err(|error| {
        CommandError::new(
            "dynamodb-json-invalid",
            format!("DynamoDB returned invalid JSON: {error}"),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::DynamoDbEndpoint;

    #[test]
    fn dynamodb_endpoint_parses_prefixed_http_url() {
        let endpoint = DynamoDbEndpoint::from_url("http://localhost:18000/dynamo").unwrap();
        assert_eq!(endpoint.host, "localhost");
        assert_eq!(endpoint.port, 18000);
        assert_eq!(endpoint.path("/"), "/dynamo/");
    }
}
