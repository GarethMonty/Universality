use crate::domain::models::{
    AdapterManifest, DatastoreOperationManifest, PermissionInspection, PermissionUnavailableAction,
    ResolvedConnectionProfile,
};

use super::manifest::manifest_has;

pub(crate) fn default_permission_inspection(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    operations: &[DatastoreOperationManifest],
) -> PermissionInspection {
    let mut unavailable_actions = Vec::new();

    for operation in operations {
        if connection.read_only
            && matches!(operation.risk.as_str(), "write" | "destructive" | "costly")
        {
            unavailable_actions.push(PermissionUnavailableAction {
                operation_id: operation.id.clone(),
                reason: "Connection profile is read-only.".into(),
            });
        } else if manifest.maturity == "beta"
            && matches!(operation.risk.as_str(), "write" | "destructive")
        {
            unavailable_actions.push(PermissionUnavailableAction {
                operation_id: operation.id.clone(),
                reason: "Beta adapter exposes guarded plans before live mutation execution.".into(),
            });
        }
    }

    let mut warnings = Vec::new();
    if manifest_has(manifest, "supports_cloud_iam") {
        warnings.push("Cloud IAM signals are surfaced when the profile includes a cloud principal or SDK identity.".into());
    }
    if manifest.maturity == "beta" {
        warnings.push(
            "Permission inspection is adapter-scoped until the live engine probe is implemented."
                .into(),
        );
    }

    PermissionInspection {
        engine: manifest.engine.clone(),
        principal: connection.username.clone(),
        effective_roles: if connection.read_only {
            vec!["read-only-profile".into()]
        } else {
            vec!["profile-default".into()]
        },
        effective_privileges: if connection.read_only {
            vec!["metadata:read".into(), "query:read".into()]
        } else {
            vec![
                "metadata:read".into(),
                "query:read".into(),
                "operation:plan".into(),
            ]
        },
        iam_signals: if manifest_has(manifest, "supports_cloud_iam") {
            vec!["cloud-iam-supported".into()]
        } else {
            Vec::new()
        },
        unavailable_actions,
        warnings,
    }
}
