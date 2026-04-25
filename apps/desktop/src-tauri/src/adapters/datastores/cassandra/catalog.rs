use super::super::super::*;

pub(super) fn cassandra_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-cassandra",
        "cassandra",
        "widecolumn",
        "Cassandra adapter",
        "beta",
        "cql",
        WIDECOLUMN_CAPABILITIES,
    )
}

pub(super) fn cassandra_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: false,
        supports_live_metadata: true,
        editor_language: "cql".into(),
        default_row_limit: 500,
    }
}
