use serde_json::json;

use super::super::super::*;
use super::connection::clickhouse_query;
use super::payloads::clickhouse_json_payloads;

pub(super) async fn collect_clickhouse_diagnostics(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> Result<AdapterDiagnostics, CommandError> {
    let mut diagnostics = default_adapter_diagnostics(connection, manifest, scope);
    if let Ok(raw) = clickhouse_query(
        connection,
        "SELECT metric, value FROM system.metrics ORDER BY metric FORMAT JSON",
    )
    .await
    {
        let (payloads, _) = clickhouse_json_payloads(&raw);
        diagnostics.metrics.extend(payloads);
    }
    diagnostics.query_history.push(payload_json(json!({
        "engine": "clickhouse",
        "templates": [
            "EXPLAIN SELECT ...",
            "SELECT * FROM system.query_log ORDER BY event_time DESC LIMIT 100",
            "SELECT metric, value FROM system.metrics"
        ]
    })));
    Ok(diagnostics)
}
