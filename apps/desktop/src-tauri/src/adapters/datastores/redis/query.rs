use std::collections::BTreeMap;

use redis::AsyncCommands;
use serde_json::{json, Value};

use super::super::super::*;
use super::commands::{is_redis_write_command, is_supported_redis_read_command};
use super::connection::redis_connection;
use super::RedisAdapter;

pub(super) async fn execute_redis_query(
    adapter: &RedisAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let line = selected_query(request)
        .lines()
        .find(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            CommandError::new("redis-command-missing", "No Redis command was provided.")
        })?;
    let parts = line.split_whitespace().collect::<Vec<&str>>();

    if parts.is_empty() {
        return Err(CommandError::new(
            "redis-command-missing",
            "No Redis command was provided.",
        ));
    }

    let upper = parts[0].to_uppercase();
    if is_redis_write_command(&upper) {
        return Err(CommandError::new(
            "redis-write-preview-only",
            "Redis write and destructive commands are planned as guarded operations in this milestone; live execution is read/diagnostic only.",
        ));
    }
    if !is_supported_redis_read_command(&upper, parts.len()) {
        return Err(CommandError::new(
            "redis-command-unsupported",
            "This milestone supports read-oriented Redis commands such as SCAN, HGETALL, GET, TYPE, TTL, and PING.",
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let mut redis = redis_connection(connection).await?;
    let (payloads, summary) = match upper.as_str() {
        "PING" => {
            let result: String = redis::cmd("PING").query_async(&mut redis).await?;
            (
                vec![
                    payload_raw(result.clone()),
                    payload_json(json!({ "response": result })),
                ],
                "Redis ping succeeded.".to_string(),
            )
        }
        "SCAN" => {
            let pattern = parts
                .windows(2)
                .find(|window| window[0].eq_ignore_ascii_case("MATCH"))
                .map(|window| window[1])
                .unwrap_or("*");
            let count = parts
                .windows(2)
                .find(|window| window[0].eq_ignore_ascii_case("COUNT"))
                .and_then(|window| window[1].parse::<u32>().ok())
                .unwrap_or(row_limit)
                .clamp(1, MAX_PAGE_SIZE);
            let (_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(0)
                .arg("MATCH")
                .arg(pattern)
                .arg("COUNT")
                .arg(count)
                .query_async(&mut redis)
                .await?;

            (
                vec![
                    payload_table(
                        vec!["key".into()],
                        keys.iter().map(|key| vec![key.clone()]).collect(),
                    ),
                    payload_json(json!({ "keys": keys })),
                    payload_raw(line.to_string()),
                ],
                format!("Redis scan returned {} key(s).", keys.len()),
            )
        }
        "HGETALL" if parts.len() > 1 => {
            let key = parts[1];
            let values = redis::cmd("HGETALL")
                .arg(key)
                .query_async::<Vec<String>>(&mut redis)
                .await?;
            let ttl: i64 = redis::cmd("TTL")
                .arg(key)
                .query_async(&mut redis)
                .await
                .unwrap_or(-1);
            let mut entries = BTreeMap::new();
            for chunk in values.chunks(2) {
                if let [field, value] = chunk {
                    entries.insert((*field).to_string(), (*value).to_string());
                }
            }

            (
                vec![
                    payload_keyvalue(entries, Some(ttl.to_string()), None),
                    payload_json(json!({ "key": key, "fields": values })),
                    payload_raw(line.to_string()),
                ],
                format!("Redis hash {} loaded successfully.", key),
            )
        }
        "GET" if parts.len() > 1 => {
            let key = parts[1];
            let value: Option<String> = redis.get(key).await.ok();
            let mut entries = BTreeMap::new();
            entries.insert("value".into(), value.clone().unwrap_or_default());

            (
                vec![
                    payload_keyvalue(entries, None, None),
                    payload_json(json!({ "key": key, "value": value })),
                    payload_raw(line.to_string()),
                ],
                format!("Redis value {} loaded successfully.", key),
            )
        }
        "TYPE" if parts.len() > 1 => {
            let key = parts[1];
            let key_type: String = redis::cmd("TYPE").arg(key).query_async(&mut redis).await?;
            let mut entries = BTreeMap::new();
            entries.insert("type".into(), key_type.clone());

            (
                vec![
                    payload_keyvalue(entries, None, None),
                    payload_json(json!({ "key": key, "type": key_type })),
                    payload_raw(line.to_string()),
                ],
                format!("Redis type for {} resolved successfully.", key),
            )
        }
        "TTL" if parts.len() > 1 => {
            let key = parts[1];
            let ttl: i64 = redis::cmd("TTL").arg(key).query_async(&mut redis).await?;
            let mut entries = BTreeMap::new();
            entries.insert("ttl".into(), ttl.to_string());

            (
                vec![
                    payload_keyvalue(entries, Some(ttl.to_string()), None),
                    payload_json(json!({ "key": key, "ttl": ttl })),
                    payload_raw(line.to_string()),
                ],
                format!("Redis TTL for {} resolved successfully.", key),
            )
        }
        _ => unreachable!("redis command support is validated before connecting"),
    };

    let default_renderer = payloads
        .first()
        .and_then(|payload| payload.get("renderer"))
        .and_then(Value::as_str)
        .unwrap_or("raw")
        .to_string();
    let renderer_modes_owned = payloads
        .iter()
        .filter_map(|payload| payload.get("renderer").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<Vec<String>>();
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary,
        default_renderer: &default_renderer,
        renderer_modes,
        payloads,
        notices,
        duration_ms: duration_ms(started),
        row_limit: Some(row_limit),
        truncated: false,
        explain_payload: None,
    }))
}
