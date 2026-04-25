use super::super::super::*;

pub(super) fn janusgraph_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-janusgraph",
        "janusgraph",
        "graph",
        "JanusGraph adapter",
        "beta",
        "gremlin",
        GRAPH_CAPABILITIES,
    )
}

pub(super) fn janusgraph_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "gremlin".into(),
        default_row_limit: 500,
    }
}
