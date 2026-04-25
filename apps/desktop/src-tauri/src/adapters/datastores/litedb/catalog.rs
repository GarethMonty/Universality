use super::super::super::*;

const LITEDB_CAPABILITIES: &[&str] = &[
    "supports_document_view",
    "supports_schema_browser",
    "supports_result_snapshots",
    "supports_visual_query_builder",
    "supports_index_management",
    "supports_admin_operations",
    "supports_explain_plan",
    "supports_plan_visualization",
    "supports_query_profile",
    "supports_metrics_collection",
    "supports_import_export",
    "supports_structure_visualization",
];

pub(super) fn litedb_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-litedb",
        "litedb",
        "document",
        "LiteDB adapter",
        "beta",
        "json",
        LITEDB_CAPABILITIES,
    )
}

pub(super) fn litedb_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "json".into(),
        default_row_limit: 500,
    }
}
