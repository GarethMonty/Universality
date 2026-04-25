use std::collections::BTreeMap;

use serde_json::Value;

use super::super::*;

pub(super) fn cockroach_operation_plan(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    operation_id: &str,
    object_name: Option<&str>,
    parameters: Option<&BTreeMap<String, Value>>,
) -> OperationPlan {
    let mut plan =
        default_operation_plan(connection, manifest, operation_id, object_name, parameters);

    if operation_id.ends_with("cockroach.jobs") {
        plan.generated_request = "show jobs;".into();
        plan.summary = "Prepared CockroachDB jobs inspection.".into();
        plan.required_permissions = vec!["VIEWJOB or admin-compatible visibility".into()];
    } else if operation_id.ends_with("cockroach.contention") {
        plan.generated_request =
            "show sessions; select * from crdb_internal.cluster_locks limit 100;".into();
        plan.summary = "Prepared CockroachDB contention diagnostics.".into();
        plan.estimated_scan_impact = Some(
            "Diagnostic metadata query; crdb_internal access depends on cluster version and privileges."
                .into(),
        );
    } else if operation_id.ends_with("cockroach.roles-grants") {
        plan.generated_request = "show roles; show grants;".into();
        plan.summary = "Prepared CockroachDB role and grant inspection.".into();
        plan.required_permissions = vec!["role/grant visibility for the current SQL user".into()];
    }

    plan
}
