use serde_json::Value;

use super::super::super::*;
use super::protocol::{memcached_request, memcached_stats_payload};

pub(super) async fn collect_memcached_diagnostics(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> Result<AdapterDiagnostics, CommandError> {
    let mut diagnostics = default_adapter_diagnostics(connection, manifest, scope);
    if let Ok(raw) = memcached_request(connection, "stats\r\nquit\r\n").await {
        let (payloads, _) = memcached_stats_payload(&raw);
        diagnostics.metrics.extend(
            payloads.into_iter().filter(|payload| {
                payload.get("renderer").and_then(Value::as_str) == Some("metrics")
            }),
        );
        diagnostics.query_history.push(payload_raw("stats".into()));
    }
    diagnostics.warnings.push(
        "Memcached has no portable native key browser; Universality exposes known-key reads and server diagnostics."
            .into(),
    );
    Ok(diagnostics)
}
