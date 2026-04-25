use serde_json::{json, Value};

use super::super::super::*;
use super::catalog::neo4j_execution_capabilities;
use super::connection::neo4j_run_cypher;

pub(super) async fn list_neo4j_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("neo4j:labels") => {
            query_value_nodes(
                connection,
                request.limit,
                "CALL db.labels() YIELD label RETURN label ORDER BY label",
                "label",
            )
            .await?
        }
        Some("neo4j:relationships") => {
            query_value_nodes(
                connection,
                request.limit,
                "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType",
                "relationship",
            )
            .await?
        }
        Some("neo4j:indexes") => {
            query_value_nodes(
                connection,
                request.limit,
                "SHOW INDEXES YIELD name RETURN name ORDER BY name",
                "index",
            )
            .await?
        }
        Some("neo4j:constraints") => {
            query_value_nodes(
                connection,
                request.limit,
                "SHOW CONSTRAINTS YIELD name RETURN name ORDER BY name",
                "constraint",
            )
            .await?
        }
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} Neo4j explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: neo4j_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_neo4j_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .strip_prefix("neo4j-label:")
        .map(|label| format!("MATCH (n:{}) RETURN n LIMIT 100", quote_cypher_identifier(label)))
        .or_else(|| {
            request.node_id.strip_prefix("neo4j-relationship:").map(|rel| {
                format!(
                    "MATCH p=()-[r:{}]->() RETURN p LIMIT 100",
                    quote_cypher_identifier(rel)
                )
            })
        })
        .unwrap_or_else(|| match request.node_id.as_str() {
            "neo4j-labels" => "CALL db.labels() YIELD label RETURN label ORDER BY label".into(),
            "neo4j-relationships" => {
                "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType".into()
            }
            "neo4j-indexes" => "SHOW INDEXES YIELD name, type, entityType RETURN name, type, entityType ORDER BY name".into(),
            "neo4j-constraints" => "SHOW CONSTRAINTS YIELD name, type RETURN name, type ORDER BY name".into(),
            _ => "MATCH (n) RETURN n LIMIT 100".into(),
        });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Cypher template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "neo4j",
            "nodeId": request.node_id,
            "api": ["/db/{database}/tx/commit"]
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "neo4j-labels",
            "Labels",
            "labels",
            "Node labels and label-scoped match templates",
            "neo4j:labels",
            "CALL db.labels() YIELD label RETURN label ORDER BY label",
        ),
        (
            "neo4j-relationships",
            "Relationships",
            "relationships",
            "Relationship types and path query templates",
            "neo4j:relationships",
            "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType",
        ),
        (
            "neo4j-indexes",
            "Indexes",
            "indexes",
            "Schema indexes",
            "neo4j:indexes",
            "SHOW INDEXES YIELD name, type, entityType RETURN name, type, entityType ORDER BY name",
        ),
        (
            "neo4j-constraints",
            "Constraints",
            "constraints",
            "Schema constraints",
            "neo4j:constraints",
            "SHOW CONSTRAINTS YIELD name, type RETURN name, type ORDER BY name",
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
        path: Some(vec![connection.name.clone(), "Neo4j".into()]),
        query_template: Some(query.into()),
        expandable: Some(true),
    })
    .collect()
}

async fn query_value_nodes(
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
    query: &str,
    kind: &str,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let value = neo4j_run_cypher(connection, query).await?;
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    Ok(first_column_values(&value)
        .into_iter()
        .take(limit)
        .map(|label| {
            let node_id = match kind {
                "label" => format!("neo4j-label:{label}"),
                "relationship" => format!("neo4j-relationship:{label}"),
                _ => format!("neo4j-{kind}:{label}"),
            };
            ExplorerNode {
                id: node_id,
                family: "graph".into(),
                label: label.clone(),
                kind: kind.into(),
                detail: format!("Neo4j {kind}"),
                scope: None,
                path: Some(vec![connection.name.clone(), kind.into()]),
                query_template: Some(match kind {
                    "label" => format!(
                        "MATCH (n:{}) RETURN n LIMIT 100",
                        quote_cypher_identifier(&label)
                    ),
                    "relationship" => format!(
                        "MATCH p=()-[r:{}]->() RETURN p LIMIT 100",
                        quote_cypher_identifier(&label)
                    ),
                    _ => query.into(),
                }),
                expandable: Some(false),
            }
        })
        .collect())
}

pub(crate) fn first_column_values(value: &Value) -> Vec<String> {
    value
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|result| {
            result
                .get("data")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(|item| {
            item.get("row")
                .and_then(Value::as_array)
                .and_then(|row| row.first())
        })
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| value.to_string())
        })
        .collect()
}

pub(crate) fn quote_cypher_identifier(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{first_column_values, quote_cypher_identifier};

    #[test]
    fn neo4j_first_column_values_reads_http_result_rows() {
        let value = json!({
            "results": [{
                "columns": ["label"],
                "data": [{ "row": ["Person"] }, { "row": ["Order"] }]
            }],
            "errors": []
        });

        assert_eq!(first_column_values(&value), vec!["Person", "Order"]);
    }

    #[test]
    fn neo4j_identifier_quote_escapes_backticks() {
        assert_eq!(quote_cypher_identifier("Odd`Label"), "`Odd``Label`");
    }
}
