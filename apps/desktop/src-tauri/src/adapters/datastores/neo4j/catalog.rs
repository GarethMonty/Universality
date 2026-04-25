use super::super::super::*;

pub(super) fn neo4j_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-neo4j",
        "neo4j",
        "graph",
        "Neo4j adapter",
        "beta",
        "cypher",
        GRAPH_CAPABILITIES,
    )
}

pub(super) fn neo4j_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "cypher".into(),
        default_row_limit: 500,
    }
}
