use serde_json::json;

use super::super::*;

pub(super) fn timescale_adapter_diagnostics(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> AdapterDiagnostics {
    let mut diagnostics = default_adapter_diagnostics(connection, manifest, scope);
    diagnostics.metrics.push(payload_metrics(json!([
        { "name": "timescale.hypertables.surface", "value": 1, "unit": "available", "labels": { "source": "timescaledb_information.hypertables" } },
        { "name": "timescale.chunks.surface", "value": 1, "unit": "available", "labels": { "source": "timescaledb_information.chunks" } }
    ])));
    diagnostics.query_history.push(payload_json(json!({
        "templates": [
            "select * from timescaledb_information.hypertables",
            "select * from timescaledb_information.chunks",
            "select time_bucket('1 hour', time_column), count(*) from hypertable group by 1"
        ]
    })));
    diagnostics
}
