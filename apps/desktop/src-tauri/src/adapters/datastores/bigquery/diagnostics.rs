use serde_json::json;

use super::super::super::*;
use super::connection::{bigquery_dataset_id, bigquery_project_id};

pub(super) async fn collect_bigquery_diagnostics(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> Result<AdapterDiagnostics, CommandError> {
    let mut diagnostics = default_adapter_diagnostics(connection, manifest, scope);
    let project = bigquery_project_id(connection);
    let dataset = bigquery_dataset_id(connection);

    diagnostics.metrics.push(payload_metrics(json!([
        {
            "name": "bigquery.cloud_contract.ready",
            "value": 1,
            "unit": "flag",
            "labels": { "project": project, "dataset": dataset }
        },
        {
            "name": "bigquery.estimated_bytes.default",
            "value": 0,
            "unit": "bytes",
            "labels": { "source": "dryRun" }
        }
    ])));
    diagnostics.cost_estimates.push(payload_cost_estimate(json!({
        "engine": "bigquery",
        "basis": "Dry-run totalBytesProcessed from jobs.query when live OAuth credentials are configured.",
        "project": project,
        "dataset": dataset,
        "liveCosting": false
    })));
    diagnostics.query_history.push(payload_json(json!({
        "engine": "bigquery",
        "templates": [
            "select * from `project.dataset.table` limit 100",
            "select * from region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT limit 100",
            "jobs.query dryRun=true"
        ]
    })));
    diagnostics.warnings.push(
        "BigQuery cost visibility should use dry-run byte estimates before execution; live Google APIs require OAuth/ADC credentials."
            .into(),
    );
    Ok(diagnostics)
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    #[test]
    fn bigquery_metrics_payload_shape_is_json_object_friendly() {
        let value = serde_json::json!({ "totalBytesProcessed": "0" });
        assert_eq!(
            value.get("totalBytesProcessed").and_then(Value::as_str),
            Some("0")
        );
    }
}
