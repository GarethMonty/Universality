use serde_json::json;

use super::super::super::*;
use super::catalog::memcached_execution_capabilities;
use super::protocol::memcached_request;

pub(super) async fn list_memcached_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = if let Some(scope) = request.scope.as_deref() {
        let command = match scope {
            "memcached:stats" => "stats\r\nquit\r\n",
            "memcached:slabs" => "stats slabs\r\nquit\r\n",
            "memcached:items" => "stats items\r\nquit\r\n",
            "memcached:settings" => "stats settings\r\nquit\r\n",
            _ => "stats\r\nquit\r\n",
        };
        let raw = memcached_request(connection, command).await?;
        raw.lines()
            .filter_map(|line| {
                let parts = line.splitn(3, ' ').collect::<Vec<&str>>();
                if parts.len() == 3 && parts[0] == "STAT" {
                    Some(ExplorerNode {
                        id: format!("memcached:{}:{}", scope, parts[1]),
                        family: "keyvalue".into(),
                        label: parts[1].into(),
                        kind: "metric".into(),
                        detail: parts[2].into(),
                        scope: None,
                        path: Some(vec![
                            connection.name.clone(),
                            scope.replace("memcached:", ""),
                        ]),
                        query_template: Some(command.trim().replace("\r\nquit", "")),
                        expandable: Some(false),
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<ExplorerNode>>()
    } else {
        root_memcached_nodes(connection)
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} Memcached explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: memcached_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_memcached_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .split(':')
        .nth(1)
        .map(|section| match section {
            "stats" => "stats",
            "slabs" => "stats slabs",
            "items" => "stats items",
            "settings" => "stats settings",
            _ => "stats",
        })
        .unwrap_or("stats");
    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Memcached diagnostic command ready for {}.",
            request.node_id
        ),
        query_template: Some(query_template.into()),
        payload: Some(json!({
            "engine": connection.engine,
            "nodeId": request.node_id,
            "textProtocol": query_template,
            "keyEnumeration": "Memcached does not expose safe native key listing; use explicit get/gets commands for known keys."
        })),
    }
}

fn root_memcached_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    vec![
        ExplorerNode {
            id: "memcached-stats".into(),
            family: "keyvalue".into(),
            label: "Stats".into(),
            kind: "stats".into(),
            detail: "Server counters, memory, evictions, and hit rates".into(),
            scope: Some("memcached:stats".into()),
            path: Some(vec![connection.name.clone()]),
            query_template: Some("stats".into()),
            expandable: Some(true),
        },
        ExplorerNode {
            id: "memcached-slabs".into(),
            family: "keyvalue".into(),
            label: "Slabs".into(),
            kind: "slabs".into(),
            detail: "Slab class allocation diagnostics".into(),
            scope: Some("memcached:slabs".into()),
            path: Some(vec![connection.name.clone()]),
            query_template: Some("stats slabs".into()),
            expandable: Some(true),
        },
        ExplorerNode {
            id: "memcached-items".into(),
            family: "keyvalue".into(),
            label: "Items".into(),
            kind: "items".into(),
            detail: "Item age, eviction, and crawler diagnostics".into(),
            scope: Some("memcached:items".into()),
            path: Some(vec![connection.name.clone()]),
            query_template: Some("stats items".into()),
            expandable: Some(true),
        },
        ExplorerNode {
            id: "memcached-settings".into(),
            family: "keyvalue".into(),
            label: "Settings".into(),
            kind: "settings".into(),
            detail: "Runtime settings visible through text protocol stats".into(),
            scope: Some("memcached:settings".into()),
            path: Some(vec![connection.name.clone()]),
            query_template: Some("stats settings".into()),
            expandable: Some(true),
        },
    ]
}
