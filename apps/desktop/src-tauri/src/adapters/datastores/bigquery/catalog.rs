use super::super::super::*;

pub(super) fn bigquery_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-bigquery",
        "bigquery",
        "warehouse",
        "BigQuery adapter",
        "beta",
        "google-sql",
        CLOUD_WAREHOUSE_CAPABILITIES,
    )
}

pub(super) fn bigquery_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: true,
        supports_live_metadata: true,
        editor_language: "google-sql".into(),
        default_row_limit: 1_000,
    }
}
