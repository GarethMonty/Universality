use super::super::super::*;

pub(super) fn arango_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-arango",
        "arango",
        "graph",
        "ArangoDB adapter",
        "beta",
        "aql",
        GRAPH_CAPABILITIES,
    )
}

pub(super) fn arango_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "aql".into(),
        default_row_limit: 100,
    }
}
