use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use super::super::super::*;

pub(super) struct BigQueryResponse {
    pub(super) body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct BigQueryEndpoint {
    host: String,
    port: u16,
    prefix: String,
}

pub(super) async fn test_bigquery_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    if has_live_auth(connection) && has_http_endpoint(connection) {
        let project = bigquery_project_id(connection);
        let _ = bigquery_get(
            connection,
            &format!("/bigquery/v2/projects/{project}/datasets?maxResults=1"),
        )
        .await?;
    }

    Ok(ConnectionTestResult {
        ok: true,
        engine: connection.engine.clone(),
        message: if has_live_auth(connection) && has_http_endpoint(connection) {
            format!("BigQuery REST connection test succeeded for {}.", connection.name)
        } else {
            format!(
                "BigQuery adapter accepted {} as a cloud-contract profile; add a bearer token and HTTP test endpoint for live REST validation.",
                connection.name
            )
        },
        warnings: vec![
            "BigQuery live calls require Google OAuth/ADC credentials; this adapter builds REST requests and dry-run/cost payloads without requiring ORM credentials."
                .into(),
        ],
        resolved_host: connection.host.clone(),
        resolved_database: connection.database.clone(),
        duration_ms: Some(duration_ms(started)),
    })
}

pub(super) async fn bigquery_get(
    connection: &ResolvedConnectionProfile,
    path: &str,
) -> Result<BigQueryResponse, CommandError> {
    bigquery_request(connection, "GET", path, None).await
}

pub(super) async fn bigquery_post_json(
    connection: &ResolvedConnectionProfile,
    path: &str,
    body: &str,
) -> Result<BigQueryResponse, CommandError> {
    bigquery_request(connection, "POST", path, Some(body)).await
}

async fn bigquery_request(
    connection: &ResolvedConnectionProfile,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<BigQueryResponse, CommandError> {
    let endpoint = BigQueryEndpoint::from_connection(connection)?;
    let path = endpoint.path(path);
    let body = body.unwrap_or("");
    let auth_header = connection
        .password
        .as_deref()
        .filter(|token| !token.trim().is_empty())
        .map(|token| format!("Authorization: Bearer {token}\r\n"))
        .unwrap_or_default();
    let content_headers = if method == "POST" {
        format!(
            "Content-Type: application/json\r\nContent-Length: {}\r\n",
            body.len()
        )
    } else {
        String::new()
    };
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {}:{}\r\nAccept: application/json\r\n{}{}Connection: close\r\n\r\n{}",
        endpoint.host, endpoint.port, auth_header, content_headers, body
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
        Ok(BigQueryResponse {
            body: body.to_string(),
        })
    } else {
        Err(CommandError::new(
            "bigquery-http-error",
            body.lines()
                .next()
                .filter(|line| !line.trim().is_empty())
                .unwrap_or("BigQuery REST request failed."),
        ))
    }
}

impl BigQueryEndpoint {
    fn from_connection(connection: &ResolvedConnectionProfile) -> Result<Self, CommandError> {
        if let Some(connection_string) = connection.connection_string.as_deref() {
            return Self::from_url(connection_string);
        }

        let host = connection.host.trim();
        if host.is_empty() {
            return Err(CommandError::new(
                "bigquery-endpoint-missing",
                "BigQuery requires a project id, host, or http:// connection string.",
            ));
        }

        Ok(Self {
            host: host.into(),
            port: connection.port.unwrap_or(80),
            prefix: String::new(),
        })
    }

    fn from_url(url: &str) -> Result<Self, CommandError> {
        let without_scheme = url.strip_prefix("http://").ok_or_else(|| {
            CommandError::new(
                "bigquery-unsupported-url",
                "BigQuery adapter currently supports plain http:// endpoints for local/proxy contract tests; production Google APIs require OAuth over HTTPS.",
            )
        })?;
        let (authority, path) = without_scheme
            .split_once('/')
            .unwrap_or((without_scheme, ""));
        let (host, port) = authority
            .rsplit_once(':')
            .and_then(|(host, port)| port.parse::<u16>().ok().map(|port| (host, port)))
            .unwrap_or((authority, 80));

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

pub(super) fn has_live_auth(connection: &ResolvedConnectionProfile) -> bool {
    connection
        .password
        .as_deref()
        .is_some_and(|token| !token.trim().is_empty())
}

pub(super) fn has_http_endpoint(connection: &ResolvedConnectionProfile) -> bool {
    connection
        .connection_string
        .as_deref()
        .is_some_and(|value| value.starts_with("http://"))
}

pub(super) fn bigquery_project_id(connection: &ResolvedConnectionProfile) -> String {
    connection
        .username
        .as_deref()
        .or(connection.database.as_deref())
        .or_else(|| {
            let host = connection.host.trim();
            (!host.is_empty() && host != "127.0.0.1" && host != "localhost").then_some(host)
        })
        .unwrap_or("datapadplusplus-project")
        .to_string()
}

pub(super) fn bigquery_dataset_id(connection: &ResolvedConnectionProfile) -> String {
    connection
        .database
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("datapadplusplus")
        .to_string()
}

pub(super) fn bigquery_query_body(query: &str, row_limit: u32, dry_run: bool) -> Value {
    json!({
        "query": query,
        "useLegacySql": false,
        "dryRun": dry_run,
        "maxResults": row_limit,
    })
}

pub(super) fn parse_bigquery_json(body: &str) -> Result<Value, CommandError> {
    serde_json::from_str(body).map_err(|error| {
        CommandError::new(
            "bigquery-json-invalid",
            format!("BigQuery returned invalid JSON: {error}"),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::{bigquery_query_body, BigQueryEndpoint};

    #[test]
    fn bigquery_endpoint_parses_prefixed_http_url() {
        let endpoint = BigQueryEndpoint::from_url("http://localhost:19050/bq").unwrap();
        assert_eq!(endpoint.host, "localhost");
        assert_eq!(endpoint.port, 19050);
        assert_eq!(
            endpoint.path("/bigquery/v2/projects/p/datasets"),
            "/bq/bigquery/v2/projects/p/datasets"
        );
    }

    #[test]
    fn bigquery_query_body_uses_google_sql_and_dry_run() {
        let body = bigquery_query_body("select 1", 25, true);
        assert_eq!(body["query"], "select 1");
        assert_eq!(body["useLegacySql"], false);
        assert_eq!(body["dryRun"], true);
        assert_eq!(body["maxResults"], 25);
    }
}
