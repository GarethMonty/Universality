use super::super::super::*;

pub(super) fn duckdb_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-duckdb",
        "duckdb",
        "embedded-olap",
        "DuckDB adapter",
        "beta",
        "sql",
        EMBEDDED_OLAP_CAPABILITIES,
    )
}

pub(super) fn duckdb_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "sql".into(),
        default_row_limit: 500,
    }
}
