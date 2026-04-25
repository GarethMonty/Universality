use serde_json::json;

use super::super::*;

pub(super) fn cockroach_permission_inspection(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    operations: &[DatastoreOperationManifest],
) -> PermissionInspection {
    let mut inspection = default_permission_inspection(connection, manifest, operations);
    inspection
        .effective_roles
        .push("SHOW ROLES probe available".into());
    inspection
        .effective_privileges
        .push("SHOW GRANTS probe available".into());
    inspection.warnings.push(
        "CockroachDB permission details depend on SHOW ROLES/SHOW GRANTS visibility for the connected SQL user."
            .into(),
    );
    inspection
}

pub(super) fn cockroach_adapter_diagnostics(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> AdapterDiagnostics {
    let mut diagnostics = default_adapter_diagnostics(connection, manifest, scope);
    diagnostics.metrics.push(payload_metrics(json!([
        {
            "name": "cockroach.jobs.surface",
            "value": 1,
            "unit": "available",
            "labels": { "source": "SHOW JOBS" }
        },
        {
            "name": "cockroach.contention.surface",
            "value": 1,
            "unit": "available",
            "labels": { "source": "SHOW SESSIONS / crdb_internal" }
        }
    ])));
    diagnostics.query_history.push(payload_json(json!({
        "engine": "cockroachdb",
        "templates": ["SHOW JOBS", "SHOW SESSIONS", "EXPLAIN ANALYZE (DISTSQL)"],
    })));
    diagnostics.warnings.push(
        "EXPLAIN ANALYZE (DISTSQL) executes the query and is always planned as a confirmed operation."
            .into(),
    );
    diagnostics
}
