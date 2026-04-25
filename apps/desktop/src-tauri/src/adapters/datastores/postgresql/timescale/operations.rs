use std::collections::BTreeMap;

use serde_json::Value;

use super::super::*;

pub(super) fn timescale_operation_plan(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    operation_id: &str,
    object_name: Option<&str>,
    parameters: Option<&BTreeMap<String, Value>>,
) -> OperationPlan {
    let mut plan =
        default_operation_plan(connection, manifest, operation_id, object_name, parameters);

    if operation_id.ends_with("timescale.hypertables") {
        plan.generated_request = "select * from timescaledb_information.hypertables order by hypertable_schema, hypertable_name;".into();
        plan.summary = "Prepared TimescaleDB hypertable metadata inspection.".into();
    } else if operation_id.ends_with("timescale.continuous-aggregates") {
        plan.generated_request = "select * from timescaledb_information.continuous_aggregates order by view_schema, view_name;".into();
        plan.summary = "Prepared TimescaleDB continuous aggregate inspection.".into();
    }

    plan
}
