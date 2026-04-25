use std::time::Instant;

use super::super::super::*;
use super::spec::BetaAdapterSpec;

pub(super) fn beta_connection_test_result(
    spec: &BetaAdapterSpec,
    connection: &ResolvedConnectionProfile,
    started: Instant,
) -> ConnectionTestResult {
    let has_endpoint = !connection.host.trim().is_empty()
        || connection
            .connection_string
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        || matches!(spec.family, "embedded-olap")
        || spec.engine == "litedb";

    ConnectionTestResult {
        ok: has_endpoint,
        engine: connection.engine.clone(),
        message: if has_endpoint {
            format!(
                "{} beta adapter accepted the profile. Live protocol validation is guarded behind the engine-specific driver implementation.",
                spec.label
            )
        } else {
            format!(
                "{} beta adapter requires an endpoint, connection string, local file, or cloud identity before live validation.",
                spec.label
            )
        },
        warnings: vec![
            "Beta adapters expose metadata, query normalization, diagnostics, permissions, and guarded operation plans before risky mutations are enabled.".into(),
        ],
        resolved_host: connection.host.clone(),
        resolved_database: connection.database.clone(),
        duration_ms: Some(duration_ms(started)),
    }
}
