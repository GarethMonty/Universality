use serde_json::{json, Value};

use super::super::super::*;
use super::catalog::arango_execution_capabilities;
use super::connection::arango_get;

pub(super) async fn list_arango_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("arango:collections") => collection_nodes(connection, request.limit).await?,
        Some("arango:graphs") => graph_nodes(connection, request.limit).await?,
        Some(scope) if scope.starts_with("arango:collection:") => {
            collection_child_nodes(connection, scope).await?
        }
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} ArangoDB explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: arango_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_arango_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .strip_prefix("arango-collection:")
        .map(arango_collection_query)
        .or_else(|| {
            request
                .node_id
                .strip_prefix("arango-graph:")
                .map(arango_graph_query)
        })
        .unwrap_or_else(|| "FOR doc IN collections RETURN doc".into());

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "ArangoDB AQL template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "arango",
            "nodeId": request.node_id,
            "api": ["/_api/cursor", "/_api/explain", "/_api/collection", "/_api/gharial"]
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "arango-collections",
            "Collections",
            "collections",
            "Document and edge collections",
            "arango:collections",
            "FOR doc IN collection LIMIT 100 RETURN doc",
        ),
        (
            "arango-graphs",
            "Graphs",
            "graphs",
            "Named graph definitions and edge relations",
            "arango:graphs",
            "FOR v, e, p IN 1..2 OUTBOUND @start GRAPH @graph RETURN p",
        ),
        (
            "arango-security",
            "Security",
            "security",
            "Users, permissions, and database access surfaces",
            "arango:security",
            "RETURN CURRENT_USER()",
        ),
        (
            "arango-diagnostics",
            "Diagnostics",
            "diagnostics",
            "AQL explain/profile and server status surfaces",
            "arango:diagnostics",
            "RETURN VERSION()",
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, scope, query)| ExplorerNode {
        id: id.into(),
        family: "graph".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: Some(scope.into()),
        path: Some(vec![connection.name.clone(), "ArangoDB".into()]),
        query_template: Some(query.into()),
        expandable: Some(true),
    })
    .collect()
}

async fn collection_nodes(
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let value = arango_json(connection, "/_api/collection").await?;
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    Ok(value
        .get("result")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(|item| item.get("name").and_then(Value::as_str))
        .map(|name| ExplorerNode {
            id: format!("arango-collection:{name}"),
            family: "graph".into(),
            label: name.into(),
            kind: "collection".into(),
            detail: "ArangoDB collection".into(),
            scope: Some(format!("arango:collection:{name}")),
            path: Some(vec![connection.name.clone(), "Collections".into()]),
            query_template: Some(arango_collection_query(name)),
            expandable: Some(true),
        })
        .collect())
}

async fn collection_child_nodes(
    connection: &ResolvedConnectionProfile,
    scope: &str,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let collection = scope.trim_start_matches("arango:collection:");
    let value = arango_json(connection, &format!("/_api/index?collection={collection}")).await?;
    Ok(value
        .get("indexes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("name").and_then(Value::as_str))
        .map(|name| ExplorerNode {
            id: format!("arango-index:{collection}:{name}"),
            family: "graph".into(),
            label: name.into(),
            kind: "index".into(),
            detail: "ArangoDB index".into(),
            scope: None,
            path: Some(vec![
                connection.name.clone(),
                "Collections".into(),
                collection.into(),
            ]),
            query_template: Some(arango_collection_query(collection)),
            expandable: Some(false),
        })
        .collect())
}

async fn graph_nodes(
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let value = arango_json(connection, "/_api/gharial").await?;
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    Ok(value
        .get("graphs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(|item| item.get("_key").and_then(Value::as_str))
        .map(|name| ExplorerNode {
            id: format!("arango-graph:{name}"),
            family: "graph".into(),
            label: name.into(),
            kind: "graph".into(),
            detail: "ArangoDB named graph".into(),
            scope: None,
            path: Some(vec![connection.name.clone(), "Graphs".into()]),
            query_template: Some(arango_graph_query(name)),
            expandable: Some(false),
        })
        .collect())
}

async fn arango_json(
    connection: &ResolvedConnectionProfile,
    path: &str,
) -> Result<Value, CommandError> {
    let response = arango_get(connection, path).await?;
    serde_json::from_str(&response.body).map_err(|error| {
        CommandError::new(
            "arango-json-invalid",
            format!("ArangoDB returned invalid JSON: {error}"),
        )
    })
}

pub(crate) fn arango_collection_query(collection: &str) -> String {
    format!(
        "FOR doc IN {} LIMIT 100 RETURN doc",
        quote_aql_identifier(collection)
    )
}

pub(crate) fn arango_graph_query(graph: &str) -> String {
    format!(
        "FOR v, e, p IN 1..2 ANY @start GRAPH {} RETURN p",
        quote_aql_string(graph)
    )
}

fn quote_aql_identifier(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}

fn quote_aql_string(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\\\""))
}

#[cfg(test)]
mod tests {
    use super::{arango_collection_query, arango_graph_query};

    #[test]
    fn arango_collection_query_quotes_identifier() {
        assert_eq!(
            arango_collection_query("odd`collection"),
            "FOR doc IN `odd``collection` LIMIT 100 RETURN doc"
        );
    }

    #[test]
    fn arango_graph_query_quotes_graph_name() {
        assert_eq!(
            arango_graph_query("social"),
            "FOR v, e, p IN 1..2 ANY @start GRAPH \"social\" RETURN p"
        );
    }
}
