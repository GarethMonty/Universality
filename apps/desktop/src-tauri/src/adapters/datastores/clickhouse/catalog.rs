use super::super::super::*;

pub(super) fn clickhouse_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-clickhouse",
        "clickhouse",
        "warehouse",
        "ClickHouse adapter",
        "beta",
        "clickhouse-sql",
        WAREHOUSE_CAPABILITIES,
    )
}

pub(super) fn clickhouse_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "sql".into(),
        default_row_limit: 1000,
    }
}
