use super::super::super::*;

pub(super) fn snowflake_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-snowflake",
        "snowflake",
        "warehouse",
        "Snowflake adapter",
        "beta",
        "snowflake-sql",
        CLOUD_WAREHOUSE_CAPABILITIES,
    )
}

pub(super) fn snowflake_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "snowflake-sql".into(),
        default_row_limit: 1_000,
    }
}
