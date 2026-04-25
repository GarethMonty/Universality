use serde_json::{json, Value};

use super::super::super::*;
use super::catalog::search_execution_capabilities;
use super::connection::search_get;
use super::SearchEngine;

pub(super) async fn list_search_explorer_nodes(
    engine: SearchEngine,
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("search:indices") => index_nodes(engine, connection, request.limit).await?,
        Some("search:data-streams") => data_stream_nodes(engine, connection, request.limit).await?,
        Some("search:aliases") => alias_nodes(engine, connection, request.limit).await?,
        Some("search:cluster") => cluster_nodes(engine, connection).await?,
        Some(_) => Vec::new(),
        None => root_nodes(engine, connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} {} explorer node(s) for {}.",
            nodes.len(),
            engine.label,
            connection.name
        ),
        capabilities: search_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_search_explorer_node(
    engine: SearchEngine,
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let index = request
        .node_id
        .strip_prefix("search-index:")
        .or_else(|| request.node_id.strip_prefix("search-data-stream:"))
        .unwrap_or("_all");
    let query_template = search_query_template(index);

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "{} search template ready for {} on {}.",
            engine.label, request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": engine.engine,
            "nodeId": request.node_id,
            "api": ["/_search", "/_cat/indices", "/_data_stream", "/_cat/aliases", "/_cluster/health"]
        })),
    }
}

fn root_nodes(engine: SearchEngine, connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "search-indices",
            "Indices",
            "indices",
            "Search indices, mappings, shards, and document counts",
            "search:indices",
        ),
        (
            "search-data-streams",
            "Data streams",
            "data-streams",
            "Time-oriented data streams and backing indices",
            "search:data-streams",
        ),
        (
            "search-aliases",
            "Aliases",
            "aliases",
            "Index aliases and routing surfaces",
            "search:aliases",
        ),
        (
            "search-cluster",
            "Cluster",
            "cluster",
            "Cluster health, node, shard, and segment diagnostics",
            "search:cluster",
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, scope)| ExplorerNode {
        id: format!("{}:{id}", engine.engine),
        family: "search".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: Some(scope.into()),
        path: Some(vec![connection.name.clone(), engine.label.into()]),
        query_template: Some(search_query_template("_all")),
        expandable: Some(true),
    })
    .collect()
}

async fn index_nodes(
    engine: SearchEngine,
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    let value = search_json(connection, "/_cat/indices?format=json").await?;
    Ok(value
        .as_array()
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(|item| item.get("index").and_then(Value::as_str))
        .map(|index| ExplorerNode {
            id: format!("search-index:{index}"),
            family: "search".into(),
            label: index.into(),
            kind: "index".into(),
            detail: format!("{} index", engine.label),
            scope: None,
            path: Some(vec![connection.name.clone(), "Indices".into()]),
            query_template: Some(search_query_template(index)),
            expandable: Some(false),
        })
        .collect())
}

async fn data_stream_nodes(
    _engine: SearchEngine,
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    let value = search_json(connection, "/_data_stream").await?;
    Ok(value
        .get("data_streams")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(|item| item.get("name").and_then(Value::as_str))
        .map(|name| ExplorerNode {
            id: format!("search-data-stream:{name}"),
            family: "search".into(),
            label: name.into(),
            kind: "data-stream".into(),
            detail: "Search data stream".into(),
            scope: None,
            path: Some(vec![connection.name.clone(), "Data streams".into()]),
            query_template: Some(search_query_template(name)),
            expandable: Some(false),
        })
        .collect())
}

async fn alias_nodes(
    _engine: SearchEngine,
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    let value = search_json(connection, "/_cat/aliases?format=json").await?;
    Ok(value
        .as_array()
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(|item| item.get("alias").and_then(Value::as_str))
        .map(|alias| ExplorerNode {
            id: format!("search-alias:{alias}"),
            family: "search".into(),
            label: alias.into(),
            kind: "alias".into(),
            detail: "Search alias".into(),
            scope: None,
            path: Some(vec![connection.name.clone(), "Aliases".into()]),
            query_template: Some(search_query_template(alias)),
            expandable: Some(false),
        })
        .collect())
}

async fn cluster_nodes(
    engine: SearchEngine,
    connection: &ResolvedConnectionProfile,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let value = search_json(connection, "/_cluster/health").await?;
    let status = value
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    Ok(vec![ExplorerNode {
        id: format!("{}:cluster-health", engine.engine),
        family: "search".into(),
        label: "Cluster health".into(),
        kind: "cluster-health".into(),
        detail: format!("Status: {status}"),
        scope: None,
        path: Some(vec![connection.name.clone(), "Cluster".into()]),
        query_template: Some("GET /_cluster/health".into()),
        expandable: Some(false),
    }])
}

async fn search_json(
    connection: &ResolvedConnectionProfile,
    path: &str,
) -> Result<Value, CommandError> {
    let response = search_get(connection, path).await?;
    serde_json::from_str(&response.body).map_err(|error| {
        CommandError::new(
            "search-json-invalid",
            format!("Search engine returned invalid JSON: {error}"),
        )
    })
}

pub(crate) fn search_query_template(index: &str) -> String {
    serde_json::to_string_pretty(&json!({
        "index": index,
        "body": {
            "query": { "match_all": {} },
            "size": 100
        }
    }))
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::search_query_template;

    #[test]
    fn search_query_template_wraps_index_and_body() {
        let template = search_query_template("logs-*");
        assert!(template.contains("\"index\": \"logs-*\""));
        assert!(template.contains("\"match_all\""));
    }
}
