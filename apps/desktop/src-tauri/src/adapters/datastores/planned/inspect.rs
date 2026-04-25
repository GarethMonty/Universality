use serde_json::json;

use super::super::super::*;
use super::preview::default_beta_query;
use super::spec::{beta_manifest, BetaAdapterSpec};

pub(super) fn beta_inspect_response(
    spec: &BetaAdapterSpec,
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let manifest = beta_manifest(
        spec.engine,
        spec.family,
        spec.label,
        spec.default_language,
        spec.capabilities,
    );
    let operations = operation_manifests_for_manifest(&manifest);
    let permissions = default_permission_inspection(connection, &manifest, &operations);
    let diagnostics = default_adapter_diagnostics(connection, &manifest, Some(&request.node_id));

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!("{} beta surface ready for {}.", spec.label, request.node_id),
        query_template: Some(default_beta_query(spec)),
        payload: Some(json!({
            "engine": spec.engine,
            "family": spec.family,
            "maturity": "beta",
            "nodeId": request.node_id,
            "operations": operations,
            "permissions": permissions,
            "diagnostics": diagnostics,
        })),
    }
}
