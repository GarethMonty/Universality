use serde_json::{json, Value};

use super::super::super::*;
use super::connection::janusgraph_run_gremlin;
use super::explorer::gremlin_values;

pub(super) async fn collect_janusgraph_diagnostics(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> Result<AdapterDiagnostics, CommandError> {
    let mut diagnostics = default_adapter_diagnostics(connection, manifest, scope);
    let ping = optional_janusgraph_query(connection, "g.V().limit(1).count()").await;
    let vertex_labels = optional_janusgraph_query(
        connection,
        "mgmt = graph.openManagement(); labels = mgmt.getVertexLabels().collect{ it.name() }; mgmt.rollback(); labels",
    )
    .await;

    diagnostics.metrics.push(payload_metrics(json!([
        {
            "name": "janusgraph.gremlin.reachable",
            "value": if ping.is_some() { 1 } else { 0 },
            "unit": "flag",
            "labels": { "source": "/gremlin" }
        },
        {
            "name": "janusgraph.vertex_labels.count",
            "value": gremlin_values(vertex_labels.as_ref().unwrap_or(&json!({}))).len(),
            "unit": "labels",
            "labels": { "source": "management API" }
        }
    ])));
    diagnostics.query_history.push(payload_json(json!({
        "engine": "janusgraph",
        "templates": [
            "g.V().limit(100)",
            "g.E().limit(100)",
            "g.V().hasLabel(\"label\").valueMap(true).limit(100)",
            "g.V().limit(100).profile()"
        ],
        "ping": ping,
    })));
    diagnostics.warnings.push(
        "Gremlin traversals can fan out across the graph; keep limits, labels, and traversal depth explicit before using results in dashboards."
            .into(),
    );
    Ok(diagnostics)
}

async fn optional_janusgraph_query(
    connection: &ResolvedConnectionProfile,
    query: &str,
) -> Option<Value> {
    janusgraph_run_gremlin(connection, query).await.ok()
}
