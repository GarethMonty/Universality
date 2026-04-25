use serde_json::json;

use crate::domain::models::{AdapterDiagnostics, AdapterManifest, ResolvedConnectionProfile};

use super::super::*;
use super::manifest::manifest_has;

pub(crate) fn default_adapter_diagnostics(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> AdapterDiagnostics {
    let scope = scope.unwrap_or("connection");
    let metrics = if manifest_has(manifest, "supports_metrics_collection") {
        vec![payload_metrics(json!([
            {
                "name": "adapter.capability_count",
                "value": manifest.capabilities.len(),
                "unit": "capabilities",
                "labels": { "engine": manifest.engine, "scope": scope }
            },
            {
                "name": "connection.read_only",
                "value": if connection.read_only { 1 } else { 0 },
                "unit": "flag",
                "labels": { "engine": manifest.engine }
            }
        ]))]
    } else {
        Vec::new()
    };

    let cost_estimates = if manifest_has(manifest, "supports_cost_estimation") {
        vec![payload_cost_estimate(json!({
            "engine": manifest.engine,
            "scope": scope,
            "status": "dry-run-required",
        }))]
    } else {
        Vec::new()
    };

    AdapterDiagnostics {
        engine: manifest.engine.clone(),
        plans: if manifest_has(manifest, "supports_explain_plan") {
            vec![payload_plan(
                "json",
                json!({
                    "engine": manifest.engine,
                    "scope": scope,
                    "message": "Plan collection is available through guarded explain operations."
                }),
                "Explain plan adapter surface is available.",
            )]
        } else {
            Vec::new()
        },
        profiles: if manifest_has(manifest, "supports_query_profile") {
            vec![payload_profile(
                "Query profile surface is available through guarded profile operations.",
                json!([
                    {
                        "name": "preview",
                        "durationMs": 0,
                        "rows": 0,
                        "details": { "engine": manifest.engine, "scope": scope }
                    }
                ]),
            )]
        } else {
            Vec::new()
        },
        metrics,
        query_history: vec![payload_json(json!({
            "engine": manifest.engine,
            "scope": scope,
            "message": "Query history is normalized when the engine exposes history, jobs, logs, or audit APIs."
        }))],
        cost_estimates,
        warnings: if manifest.maturity == "beta" {
            vec!["Beta diagnostics use typed request builders and normalized payloads; live probes are enabled per adapter as credentials/drivers are configured.".into()]
        } else {
            Vec::new()
        },
    }
}
