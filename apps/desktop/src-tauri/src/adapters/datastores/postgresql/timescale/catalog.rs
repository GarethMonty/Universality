use super::super::*;

pub(super) fn timescale_manifest() -> AdapterManifest {
    manifest_with_maturity(
        "adapter-timescaledb",
        "timescaledb",
        "timeseries",
        "TimescaleDB adapter",
        "beta",
        "sql",
        TIMESERIES_SQL_CAPABILITIES,
    )
}

pub(super) fn timescale_operation_manifests(
    manifest: &AdapterManifest,
) -> Vec<DatastoreOperationManifest> {
    let mut operations = operation_manifests_for_manifest(manifest);
    operations.extend([
        operation_manifest(
            manifest,
            "timescale.hypertables",
            "Browse Hypertables",
            "table",
            "read",
            &["supports_schema_browser", "supports_time_series_charting"],
            &["table", "schema", "json"],
            "Read TimescaleDB hypertables, chunks, compression, and retention metadata.",
            false,
        ),
        operation_manifest(
            manifest,
            "timescale.continuous-aggregates",
            "Browse Continuous Aggregates",
            "table",
            "read",
            &["supports_schema_browser"],
            &["table", "schema", "json"],
            "Read continuous aggregate metadata and refresh policy surfaces.",
            false,
        ),
    ]);
    operations
}
