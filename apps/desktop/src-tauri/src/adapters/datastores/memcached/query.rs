use std::{collections::BTreeMap, time::Instant};

use serde_json::json;

use super::super::super::*;
use super::protocol::{memcached_request, memcached_stats_payload};
use super::MemcachedAdapter;

pub(super) async fn execute_memcached_query(
    adapter: &MemcachedAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    mut notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let line = selected_query(request)
        .lines()
        .find(|value| !value.trim().is_empty())
        .map(str::trim)
        .ok_or_else(|| {
            CommandError::new(
                "memcached-command-missing",
                "No Memcached command was provided.",
            )
        })?;
    let parts = line.split_whitespace().collect::<Vec<&str>>();
    let command = parts
        .first()
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if matches!(
        command.as_str(),
        "set"
            | "add"
            | "replace"
            | "append"
            | "prepend"
            | "cas"
            | "delete"
            | "incr"
            | "decr"
            | "flush_all"
    ) {
        return Err(CommandError::new(
            "memcached-write-preview-only",
            "Memcached write and destructive commands are planned as guarded operations in this milestone; live execution is read/diagnostic only.",
        ));
    }

    let request_text = format!("{line}\r\nquit\r\n");
    let raw = memcached_request(connection, &request_text).await?;
    let (payloads, summary) = match command.as_str() {
        "stats" => {
            let (payloads, entries) = memcached_stats_payload(&raw);
            (
                payloads,
                format!("Memcached stats returned {} metric(s).", entries.len()),
            )
        }
        "version" => (
            vec![
                payload_raw(raw.trim().to_string()),
                payload_json(
                    json!({ "version": raw.trim().strip_prefix("VERSION ").unwrap_or(raw.trim()) }),
                ),
            ],
            "Memcached version loaded successfully.".into(),
        ),
        "get" | "gets" if parts.len() > 1 => {
            let key = parts[1];
            let mut entries = BTreeMap::new();
            let value = raw
                .lines()
                .skip_while(|line| !line.starts_with("VALUE "))
                .nth(1)
                .unwrap_or_default()
                .to_string();
            entries.insert(key.into(), value.clone());
            (
                vec![
                    payload_keyvalue(entries, None, None),
                    payload_json(json!({ "key": key, "value": value })),
                    payload_raw(raw.trim().to_string()),
                ],
                format!("Memcached key {key} loaded successfully."),
            )
        }
        _ => {
            notices.push(QueryExecutionNotice {
                code: "memcached-read-surface".into(),
                level: "info".into(),
                message: "This adapter supports stats, version, get, and gets live; mutations remain operation-plan preview only.".into(),
            });
            (
                vec![payload_raw(raw.trim().to_string())],
                "Memcached command returned raw text protocol output.".into(),
            )
        }
    };
    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
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
        row_limit: Some(adapter.execution_capabilities().default_row_limit),
        truncated: false,
        explain_payload: None,
    }))
}
