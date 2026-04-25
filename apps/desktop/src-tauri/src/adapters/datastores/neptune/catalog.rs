use super::super::super::*;

pub(super) fn neptune_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-neptune",
        "neptune",
        "graph",
        "Amazon Neptune adapter",
        "beta",
        "gremlin",
        CLOUD_GRAPH_CAPABILITIES,
    )
}

pub(super) fn neptune_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "gremlin".into(),
        default_row_limit: 500,
    }
}
