use serde_json::{json, Value};

use super::super::super::*;
use super::catalog::janusgraph_execution_capabilities;
use super::connection::janusgraph_run_gremlin;

const VERTEX_LABELS_QUERY: &str =
    "mgmt = graph.openManagement(); labels = mgmt.getVertexLabels().collect{ it.name() }; mgmt.rollback(); labels";
const EDGE_LABELS_QUERY: &str =
    "mgmt = graph.openManagement(); labels = mgmt.getRelationTypes(org.janusgraph.core.EdgeLabel.class).collect{ it.name() }; mgmt.rollback(); labels";
const PROPERTY_KEYS_QUERY: &str =
    "mgmt = graph.openManagement(); keys = mgmt.getRelationTypes(org.janusgraph.core.PropertyKey.class).collect{ it.name() }; mgmt.rollback(); keys";
const GRAPH_INDEXES_QUERY: &str =
    "mgmt = graph.openManagement(); indexes = mgmt.getGraphIndexes(org.apache.tinkerpop.gremlin.structure.Vertex.class).collect{ it.name() }; mgmt.rollback(); indexes";

pub(super) async fn list_janusgraph_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("janusgraph:vertex-labels") => {
            query_value_nodes(
                connection,
                request.limit,
                VERTEX_LABELS_QUERY,
                "vertex-label",
            )
            .await?
        }
        Some("janusgraph:edge-labels") => {
            query_value_nodes(connection, request.limit, EDGE_LABELS_QUERY, "edge-label").await?
        }
        Some("janusgraph:property-keys") => {
            query_value_nodes(
                connection,
                request.limit,
                PROPERTY_KEYS_QUERY,
                "property-key",
            )
            .await?
        }
        Some("janusgraph:indexes") => {
            query_value_nodes(connection, request.limit, GRAPH_INDEXES_QUERY, "index").await?
        }
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} JanusGraph explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: janusgraph_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_janusgraph_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .strip_prefix("janusgraph-vertex-label:")
        .map(|label| format!("g.V().hasLabel({}).limit(100)", quote_gremlin_string(label)))
        .or_else(|| {
            request
                .node_id
                .strip_prefix("janusgraph-edge-label:")
                .map(|label| format!("g.E().hasLabel({}).limit(100)", quote_gremlin_string(label)))
        })
        .unwrap_or_else(|| match request.node_id.as_str() {
            "janusgraph-vertex-labels" => VERTEX_LABELS_QUERY.into(),
            "janusgraph-edge-labels" => EDGE_LABELS_QUERY.into(),
            "janusgraph-property-keys" => PROPERTY_KEYS_QUERY.into(),
            "janusgraph-indexes" => GRAPH_INDEXES_QUERY.into(),
            _ => "g.V().limit(100)".into(),
        });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Gremlin template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "janusgraph",
            "nodeId": request.node_id,
            "api": ["/gremlin"]
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "janusgraph-vertex-labels",
            "Vertex Labels",
            "vertex-labels",
            "JanusGraph vertex label schema",
            "janusgraph:vertex-labels",
            VERTEX_LABELS_QUERY,
        ),
        (
            "janusgraph-edge-labels",
            "Edge Labels",
            "edge-labels",
            "JanusGraph edge label schema",
            "janusgraph:edge-labels",
            EDGE_LABELS_QUERY,
        ),
        (
            "janusgraph-property-keys",
            "Property Keys",
            "property-keys",
            "Property key definitions and data types",
            "janusgraph:property-keys",
            PROPERTY_KEYS_QUERY,
        ),
        (
            "janusgraph-indexes",
            "Indexes",
            "indexes",
            "Graph and mixed index names",
            "janusgraph:indexes",
            GRAPH_INDEXES_QUERY,
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
        path: Some(vec![connection.name.clone(), "JanusGraph".into()]),
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
    let value = janusgraph_run_gremlin(connection, query).await?;
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    Ok(gremlin_values(&value)
        .into_iter()
        .take(limit)
        .map(|label| {
            let id_kind = kind.replace('-', "_");
            ExplorerNode {
                id: format!("janusgraph-{kind}:{label}"),
                family: "graph".into(),
                label: label.clone(),
                kind: kind.into(),
                detail: format!("JanusGraph {kind}"),
                scope: None,
                path: Some(vec![connection.name.clone(), id_kind]),
                query_template: Some(match kind {
                    "vertex-label" => {
                        format!(
                            "g.V().hasLabel({}).limit(100)",
                            quote_gremlin_string(&label)
                        )
                    }
                    "edge-label" => {
                        format!(
                            "g.E().hasLabel({}).limit(100)",
                            quote_gremlin_string(&label)
                        )
                    }
                    _ => query.into(),
                }),
                expandable: Some(false),
            }
        })
        .collect())
}

pub(crate) fn gremlin_values(value: &Value) -> Vec<String> {
    value
        .pointer("/result/data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| value.to_string())
        })
        .collect()
}

pub(crate) fn quote_gremlin_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{gremlin_values, quote_gremlin_string};

    #[test]
    fn janusgraph_gremlin_values_reads_result_data() {
        let value = json!({
            "result": { "data": ["person", "order"] },
            "status": { "code": 200 }
        });

        assert_eq!(gremlin_values(&value), vec!["person", "order"]);
    }

    #[test]
    fn janusgraph_quote_gremlin_string_escapes_values() {
        assert_eq!(quote_gremlin_string("odd\"label"), "\"odd\\\"label\"");
    }
}
