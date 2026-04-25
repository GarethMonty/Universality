use super::super::super::*;

pub(super) fn influxdb_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-influxdb",
        "influxdb",
        "timeseries",
        "InfluxDB adapter",
        "beta",
        "influxql",
        TIMESERIES_CAPABILITIES,
    )
}

pub(super) fn influxdb_execution_capabilities() -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel: false,
        can_explain: false,
        supports_live_metadata: true,
        editor_language: "influxql".into(),
        default_row_limit: 500,
    }
}
