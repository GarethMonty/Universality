use futures_util::TryStreamExt;
use mongodb::bson::{doc, Document};
use serde_json::json;

use super::super::super::*;
use super::catalog::mongodb_execution_capabilities;
use super::connection::{mongodb_client, mongodb_database_name};

pub(super) async fn list_mongodb_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let client = mongodb_client(connection).await?;
    let database_name = mongodb_database_name(connection);
    let database = client.database(&database_name);
    let limit = bounded_page_size(request.limit.or(Some(100))) as usize;
    let nodes = if let Some(scope) = &request.scope {
        if let Some(collection_name) = scope.strip_prefix("collection:") {
            let collection = database.collection::<Document>(collection_name);
            let index_names = collection.list_index_names().await?;

            vec![
                ExplorerNode {
                    id: format!("{collection_name}:indexes"),
                    family: "document".into(),
                    label: "Indexes".into(),
                    kind: "indexes".into(),
                    detail: format!("{} index(es)", index_names.len()),
                    scope: None,
                    path: Some(vec![connection.name.clone(), collection_name.to_string()]),
                    query_template: Some(mongodb_find_query_template(
                        connection,
                        collection_name,
                        50,
                    )),
                    expandable: Some(false),
                },
                ExplorerNode {
                    id: format!("{collection_name}:sample"),
                    family: "document".into(),
                    label: "Sample documents".into(),
                    kind: "sample-documents".into(),
                    detail: "Quick preview of collection contents".into(),
                    scope: None,
                    path: Some(vec![connection.name.clone(), collection_name.to_string()]),
                    query_template: Some(format!(
                        "{{\n  \"collection\": \"{collection_name}\",\n  \"pipeline\": [\n    {{ \"$match\": {{}} }},\n    {{ \"$limit\": 20 }}\n  ]\n}}"
                    )),
                    expandable: Some(false),
                },
            ]
        } else {
            Vec::new()
        }
    } else {
        database
            .list_collection_names()
            .await?
            .into_iter()
            .take(limit)
            .map(|collection_name| mongodb_collection_node(connection, &collection_name))
            .collect()
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
        capabilities: mongodb_execution_capabilities(),
        nodes,
    })
}

pub(super) async fn inspect_mongodb_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> Result<ExplorerInspectResponse, CommandError> {
    let client = mongodb_client(connection).await?;
    let database_name = mongodb_database_name(connection);
    let database = client.database(&database_name);
    let collection_name = request
        .node_id
        .split(':')
        .next()
        .unwrap_or(request.node_id.as_str());
    let collection = database.collection::<Document>(collection_name);
    let sample_documents = collection
        .find(doc! {})
        .limit(3)
        .await?
        .try_collect::<Vec<Document>>()
        .await?;
    let index_names = collection.list_index_names().await?;

    Ok(ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Inspection ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(mongodb_find_query_template(connection, collection_name, 50)),
        payload: Some(json!({
            "collection": collection_name,
            "indexes": index_names,
            "sampleDocuments": sample_documents,
        })),
    })
}

pub(crate) fn mongodb_collection_node(
    connection: &ResolvedConnectionProfile,
    collection_name: &str,
) -> ExplorerNode {
    ExplorerNode {
        id: collection_name.into(),
        family: "document".into(),
        label: collection_name.into(),
        kind: "collection".into(),
        detail: "Documents, indexes, and samples".into(),
        scope: Some(format!("collection:{collection_name}")),
        path: Some(vec![connection.name.clone()]),
        query_template: Some(mongodb_find_query_template(connection, collection_name, 50)),
        expandable: Some(true),
    }
}

fn mongodb_find_query_template(
    connection: &ResolvedConnectionProfile,
    collection_name: &str,
    limit: u32,
) -> String {
    let mut query = json!({
        "collection": collection_name,
        "filter": {},
        "limit": limit,
    });
    let database = mongodb_database_name(connection);

    if !database.trim().is_empty() && database != "admin" {
        query["database"] = json!(database);
    }

    serde_json::to_string_pretty(&query).unwrap_or_else(|_| {
        format!(
            "{{\n  \"collection\": \"{collection_name}\",\n  \"filter\": {{}},\n  \"limit\": {limit}\n}}"
        )
    })
}

#[cfg(test)]
mod tests {
    use super::mongodb_collection_node;
    use crate::domain::models::ResolvedConnectionProfile;

    #[test]
    fn mongodb_collection_nodes_have_collection_scoped_queries() {
        let connection = ResolvedConnectionProfile {
            id: "conn-mongo".into(),
            name: "Mongo".into(),
            engine: "mongodb".into(),
            family: "document".into(),
            host: "127.0.0.1".into(),
            port: None,
            database: Some("catalog".into()),
            username: None,
            password: None,
            connection_string: None,
            read_only: true,
        };
        let node = mongodb_collection_node(&connection, "products");
        assert_eq!(node.scope.as_deref(), Some("collection:products"));
        assert_eq!(node.expandable, Some(true));
        assert!(node
            .query_template
            .as_deref()
            .unwrap_or_default()
            .contains("\"collection\": \"products\""));
    }
}
