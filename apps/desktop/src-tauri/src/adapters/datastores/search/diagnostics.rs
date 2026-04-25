use serde_json::{json, Value};

use super::super::super::*;
use super::connection::search_get;
use super::SearchEngine;

pub(super) async fn collect_search_diagnostics(
    engine: SearchEngine,
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> Result<AdapterDiagnostics, CommandError> {
    let mut diagnostics = default_adapter_diagnostics(connection, manifest, scope);
    let health = optional_search_json(connection, "/_cluster/health").await;
    let stats = optional_search_json(connection, "/_cluster/stats").await;

    diagnostics.metrics.push(payload_metrics(json!([
        {
            "name": "search.cluster.reachable",
            "value": if health.is_some() { 1 } else { 0 },
            "unit": "flag",
            "labels": { "engine": engine.engine, "source": "/_cluster/health" }
        },
        {
            "name": "search.indices.count",
            "value": index_count(stats.as_ref()),
            "unit": "indices",
            "labels": { "engine": engine.engine, "source": "/_cluster/stats" }
        }
    ])));
    diagnostics.query_history.push(payload_json(json!({
        "engine": engine.engine,
        "templates": [
            "{ \"index\": \"logs-*\", \"body\": { \"query\": { \"match_all\": {} }, \"size\": 100 } }",
            "GET /_cat/indices?format=json",
            "GET /_cluster/health"
        ],
        "health": health,
    })));
    diagnostics.warnings.push(
        "Search queries and aggregations can scan many shards; use index patterns, time filters, and size limits for dashboard workloads."
            .into(),
    );
    Ok(diagnostics)
}

async fn optional_search_json(connection: &ResolvedConnectionProfile, path: &str) -> Option<Value> {
    let response = search_get(connection, path).await.ok()?;
    serde_json::from_str(&response.body).ok()
}

fn index_count(value: Option<&Value>) -> u64 {
    value
        .and_then(|value| value.pointer("/indices/count"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::index_count;

    #[test]
    fn search_index_count_reads_cluster_stats_shape() {
        let stats = json!({ "indices": { "count": 12 } });
        assert_eq!(index_count(Some(&stats)), 12);
        assert_eq!(index_count(None), 0);
    }
}
