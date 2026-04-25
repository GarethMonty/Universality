use serde_json::{json, Value};

use super::super::super::*;
use super::catalog::cosmosdb_execution_capabilities;
use super::connection::{cosmosdb_default_database, cosmosdb_get, parse_cosmosdb_json};

pub(super) async fn list_cosmosdb_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("cosmosdb:databases") => database_nodes(connection, request.limit).await?,
        Some(scope) if scope.starts_with("cosmosdb:database:") => {
            container_nodes(connection, scope, request.limit).await?
        }
        Some("cosmosdb:diagnostics") => diagnostics_nodes(connection),
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} Cosmos DB explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: cosmosdb_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_cosmosdb_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .strip_prefix("cosmosdb-container:")
        .and_then(|rest| rest.split_once(':'))
        .map(|(database, container)| query_documents_template(database, container))
        .unwrap_or_else(|| match request.node_id.as_str() {
            "cosmosdb-databases" => json!({ "operation": "ListDatabases" }).to_string(),
            "cosmosdb-diagnostics" => json!({ "operation": "ListDatabases" }).to_string(),
            _ => json!({
                "operation": "QueryDocuments",
                "database": cosmosdb_default_database(connection),
                "container": "container",
                "query": "SELECT * FROM c"
            })
            .to_string(),
        });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Cosmos DB SQL API request template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "cosmosdb",
            "nodeId": request.node_id,
            "api": ["ListDatabases", "ListContainers", "ReadContainer", "QueryDocuments", "ReadDocument"]
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "cosmosdb-databases",
            "Databases",
            "databases",
            "Cosmos DB SQL API databases and containers",
            "cosmosdb:databases",
            json!({ "operation": "ListDatabases" }).to_string(),
        ),
        (
            "cosmosdb-diagnostics",
            "Diagnostics",
            "diagnostics",
            "RU charge, indexing policy, and endpoint diagnostics",
            "cosmosdb:diagnostics",
            json!({ "operation": "ListDatabases" }).to_string(),
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, scope, query)| ExplorerNode {
        id: id.into(),
        family: "document".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: Some(scope.into()),
        path: Some(vec![connection.name.clone(), "Cosmos DB".into()]),
        query_template: Some(query),
        expandable: Some(true),
    })
    .collect()
}

async fn database_nodes(
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let response = cosmosdb_get(connection, "/dbs").await?;
    let value = parse_cosmosdb_json(&response.body)?;
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    Ok(value
        .get("Databases")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(|item| item.get("id").and_then(Value::as_str))
        .map(|database| ExplorerNode {
            id: format!("cosmosdb-database:{database}"),
            family: "document".into(),
            label: database.into(),
            kind: "database".into(),
            detail: "Cosmos DB database".into(),
            scope: Some(format!("cosmosdb:database:{database}")),
            path: Some(vec![connection.name.clone(), "Databases".into()]),
            query_template: Some(
                json!({ "operation": "ListContainers", "database": database }).to_string(),
            ),
            expandable: Some(true),
        })
        .collect())
}

async fn container_nodes(
    connection: &ResolvedConnectionProfile,
    scope: &str,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let database = scope.trim_start_matches("cosmosdb:database:");
    let response = cosmosdb_get(connection, &format!("/dbs/{database}/colls")).await?;
    let value = parse_cosmosdb_json(&response.body)?;
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    Ok(value
        .get("DocumentCollections")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(|item| item.get("id").and_then(Value::as_str))
        .map(|container| ExplorerNode {
            id: format!("cosmosdb-container:{database}:{container}"),
            family: "document".into(),
            label: container.into(),
            kind: "container".into(),
            detail: "Cosmos DB container".into(),
            scope: None,
            path: Some(vec![
                connection.name.clone(),
                database.into(),
                "Containers".into(),
            ]),
            query_template: Some(query_documents_template(database, container)),
            expandable: Some(false),
        })
        .collect())
}

fn diagnostics_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    vec![ExplorerNode {
        id: "cosmosdb-list-databases-diagnostic".into(),
        family: "document".into(),
        label: "List Databases".into(),
        kind: "diagnostic".into(),
        detail: "Baseline endpoint and authorization check".into(),
        scope: None,
        path: Some(vec![connection.name.clone(), "Diagnostics".into()]),
        query_template: Some(json!({ "operation": "ListDatabases" }).to_string()),
        expandable: Some(false),
    }]
}

fn query_documents_template(database: &str, container: &str) -> String {
    json!({
        "operation": "QueryDocuments",
        "database": database,
        "container": container,
        "query": "SELECT * FROM c"
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::query_documents_template;

    #[test]
    fn cosmosdb_query_template_targets_database_and_container() {
        let value: serde_json::Value =
            serde_json::from_str(&query_documents_template("app", "orders")).unwrap();
        assert_eq!(value["operation"], "QueryDocuments");
        assert_eq!(value["database"], "app");
        assert_eq!(value["container"], "orders");
    }
}
