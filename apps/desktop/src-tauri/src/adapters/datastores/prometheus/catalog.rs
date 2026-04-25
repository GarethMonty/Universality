use super::super::super::*;

pub(super) fn prometheus_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-prometheus",
        "prometheus",
        "timeseries",
        "Prometheus adapter",
        "beta",
        "promql",
        TIMESERIES_CAPABILITIES,
    )
}

pub(super) fn prometheus_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: false,
        supports_live_metadata: true,
        editor_language: "promql".into(),
        default_row_limit: 500,
    }
}
