use super::super::super::*;

pub(super) fn opentsdb_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-opentsdb",
        "opentsdb",
        "timeseries",
        "OpenTSDB adapter",
        "beta",
        "opentsdb",
        TIMESERIES_CAPABILITIES,
    )
}

pub(super) fn opentsdb_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: false,
        supports_live_metadata: true,
        editor_language: "json".into(),
        default_row_limit: 500,
    }
}
