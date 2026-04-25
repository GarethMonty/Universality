use std::collections::BTreeMap;

use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use super::super::super::*;

pub(super) async fn memcached_request(
    connection: &ResolvedConnectionProfile,
    request: &str,
) -> Result<String, CommandError> {
    let address = format!("{}:{}", connection.host, connection.port.unwrap_or(11211));
    let mut stream = TcpStream::connect(address).await?;
    stream.write_all(request.as_bytes()).await?;
    stream.shutdown().await?;
    let mut response = String::new();
    stream.read_to_string(&mut response).await?;
    Ok(response)
}

pub(super) fn memcached_stats_payload(raw: &str) -> (Vec<Value>, BTreeMap<String, String>) {
    let mut rows = Vec::new();
    let mut entries = BTreeMap::new();
    for line in raw.lines() {
        let parts = line.splitn(3, ' ').collect::<Vec<&str>>();
        if parts.len() == 3 && parts[0] == "STAT" {
            rows.push(vec![parts[1].to_string(), parts[2].to_string()]);
            entries.insert(parts[1].to_string(), parts[2].to_string());
        }
    }

    (
        vec![
            payload_table(vec!["metric".into(), "value".into()], rows),
            payload_metrics(json!(entries
                .iter()
                .map(|(name, value)| json!({
                    "name": format!("memcached.{name}"),
                    "value": value.parse::<f64>().unwrap_or_default(),
                    "unit": "raw",
                    "labels": { "source": "stats" }
                }))
                .collect::<Vec<Value>>())),
            payload_json(json!({ "stats": entries })),
            payload_raw(raw.trim().to_string()),
        ],
        entries,
    )
}
