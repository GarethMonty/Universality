use super::super::super::*;

pub(super) fn oracle_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-oracle",
        "oracle",
        "sql",
        "Oracle adapter",
        "beta",
        "sql",
        SQL_PLANNED_CAPABILITIES,
    )
}

pub(super) fn oracle_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "sql".into(),
        default_row_limit: 500,
    }
}
