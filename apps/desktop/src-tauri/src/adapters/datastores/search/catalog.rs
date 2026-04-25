use super::super::super::*;
use super::SearchEngine;

pub(super) fn search_manifest(engine: SearchEngine) -> AdapterManifest {
    manifest_with_maturity(
        &format!("adapter-{}", engine.engine),
        engine.engine,
        "search",
        engine.label,
        "beta",
        "query-dsl",
        SEARCH_CAPABILITIES,
    )
}

pub(super) fn search_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "json".into(),
        default_row_limit: 100,
    }
}
