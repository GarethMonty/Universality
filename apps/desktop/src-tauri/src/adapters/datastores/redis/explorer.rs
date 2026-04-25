use std::collections::BTreeMap;

use redis::AsyncCommands;
use serde_json::json;

use super::super::super::*;
use super::catalog::redis_execution_capabilities;
use super::connection::redis_connection;

pub(super) async fn list_redis_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let mut redis = redis_connection(connection).await?;
    let limit = bounded_page_size(request.limit.or(Some(50)));
    let pattern = request
        .scope
        .as_deref()
        .and_then(|scope| scope.strip_prefix("prefix:"))
        .map(str::to_string)
        .unwrap_or_else(|| "*".into());
    let match_pattern = redis_scan_match_pattern(&pattern);

    let (_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
        .arg(0)
        .arg("MATCH")
        .arg(match_pattern)
        .arg("COUNT")
        .arg(limit)
        .query_async(&mut redis)
        .await?;

    let nodes: Vec<ExplorerNode> = if request.scope.is_some() {
        keys.into_iter()
            .map(|key| ExplorerNode {
                id: key.clone(),
                family: "keyvalue".into(),
                label: key.clone(),
                kind: "key".into(),
                detail: "Redis key".into(),
                scope: None,
                path: Some(vec![connection.name.clone(), pattern.clone()]),
                query_template: Some(format!("HGETALL {key}")),
                expandable: Some(false),
            })
            .collect()
    } else {
        redis_prefix_nodes(connection, keys)
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: redis_execution_capabilities(),
        nodes,
    })
}

pub(super) async fn inspect_redis_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> Result<ExplorerInspectResponse, CommandError> {
    let mut redis = redis_connection(connection).await?;
    let key = request.node_id.clone();
    let key_type: String = redis::cmd("TYPE").arg(&key).query_async(&mut redis).await?;
    let ttl: i64 = redis::cmd("TTL")
        .arg(&key)
        .query_async(&mut redis)
        .await
        .unwrap_or(-1);
    let memory_usage: Option<u64> = redis::cmd("MEMORY")
        .arg("USAGE")
        .arg(&key)
        .query_async(&mut redis)
        .await
        .ok();
    let payload = if key_type == "hash" {
        let entries = redis::cmd("HGETALL")
            .arg(&key)
            .query_async::<Vec<String>>(&mut redis)
            .await
            .unwrap_or_default();
        json!({
            "key": key,
            "type": key_type,
            "ttlSeconds": ttl,
            "memoryUsage": memory_usage,
            "entries": entries,
        })
    } else {
        let value: Option<String> = redis.get(&key).await.ok();
        json!({
            "key": key,
            "type": key_type,
            "ttlSeconds": ttl,
            "memoryUsage": memory_usage,
            "value": value,
        })
    };

    Ok(ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Inspection ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(format!(
            "TYPE {}\nTTL {}\nGET {}",
            request.node_id, request.node_id, request.node_id
        )),
        payload: Some(payload),
    })
}

pub(crate) fn redis_scan_match_pattern(pattern: &str) -> String {
    if pattern == "*" || pattern.ends_with('*') {
        pattern.to_string()
    } else {
        format!("{pattern}*")
    }
}

fn redis_prefix_nodes(
    connection: &ResolvedConnectionProfile,
    keys: Vec<String>,
) -> Vec<ExplorerNode> {
    let mut grouped = BTreeMap::new();
    for key in keys {
        let prefix = key.split(':').next().unwrap_or("root").to_string();
        *grouped.entry(prefix).or_insert(0_u32) += 1;
    }

    grouped
        .into_iter()
        .map(|(prefix, count)| ExplorerNode {
            id: prefix.clone(),
            family: "keyvalue".into(),
            label: format!("{prefix}:*"),
            kind: "prefix".into(),
            detail: format!("{count} sampled key(s)"),
            scope: Some(format!("prefix:{prefix}:")),
            path: Some(vec![connection.name.clone()]),
            query_template: Some(format!("SCAN 0 MATCH {prefix}:* COUNT 50")),
            expandable: Some(true),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::redis_scan_match_pattern;

    #[test]
    fn redis_scan_match_pattern_does_not_double_root_wildcard() {
        assert_eq!(redis_scan_match_pattern("*"), "*");
        assert_eq!(redis_scan_match_pattern("orders:*"), "orders:*");
        assert_eq!(redis_scan_match_pattern("session:"), "session:*");
    }
}
