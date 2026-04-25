use serde_json::{json, Value};

use super::super::super::*;
use super::connection::{prometheus_get, prometheus_query_path};
use super::PrometheusAdapter;

pub(super) async fn execute_prometheus_query(
    adapter: &PrometheusAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let query_text = selected_query(request).trim();
    if query_text.is_empty() {
        return Err(CommandError::new(
            "prometheus-query-missing",
            "No PromQL query was provided.",
        ));
    }

    let response = prometheus_get(
        connection,
        &prometheus_query_path("/api/v1/query", query_text),
    )
    .await?;
    let value: Value = serde_json::from_str(&response.body).map_err(|error| {
        CommandError::new(
            "prometheus-json-invalid",
            format!("Prometheus returned invalid JSON: {error}"),
        )
    })?;
    let result_type = value
        .pointer("/data/resultType")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let result = value
        .pointer("/data/result")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let (table_rows, series) = normalize_prometheus_result(&result_type, &result);
    let row_count = table_rows.len() as u32;
    let payloads = vec![
        payload_table(
            vec!["metric".into(), "timestamp".into(), "value".into()],
            table_rows,
        ),
        payload_series(series),
        payload_json(value),
        payload_raw(query_text.into()),
    ];
    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();
    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("Prometheus {result_type} query returned {row_count} sample(s)."),
        default_renderer: &default_renderer,
        renderer_modes,
        payloads,
        notices,
        duration_ms: duration_ms(started),
        row_limit: Some(row_limit),
        truncated: false,
        explain_payload: None,
    }))
}

pub(crate) fn normalize_prometheus_result(
    result_type: &str,
    result: &Value,
) -> (Vec<Vec<String>>, Value) {
    match result_type {
        "vector" => normalize_vector(result),
        "matrix" => normalize_matrix(result),
        "scalar" | "string" => {
            let row = prometheus_sample_value(result)
                .map(|(timestamp, value)| vec![result_type.into(), timestamp, value])
                .into_iter()
                .collect::<Vec<_>>();
            (row, json!([{ "metric": {}, "values": result }]))
        }
        _ => (Vec::new(), json!([])),
    }
}

fn normalize_vector(result: &Value) -> (Vec<Vec<String>>, Value) {
    let mut rows = Vec::new();
    let mut series = Vec::new();
    for item in result.as_array().into_iter().flatten() {
        let metric = item.get("metric").cloned().unwrap_or_else(|| json!({}));
        if let Some((timestamp, value)) = item.get("value").and_then(prometheus_sample_value) {
            rows.push(vec![
                metric_label(&metric),
                timestamp.clone(),
                value.clone(),
            ]);
            series.push(json!({
                "metric": metric,
                "values": [[timestamp, value]],
            }));
        }
    }
    (rows, Value::Array(series))
}

fn normalize_matrix(result: &Value) -> (Vec<Vec<String>>, Value) {
    let mut rows = Vec::new();
    let mut series = Vec::new();
    for item in result.as_array().into_iter().flatten() {
        let metric = item.get("metric").cloned().unwrap_or_else(|| json!({}));
        let values = item
            .get("values")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for sample in &values {
            if let Some((timestamp, value)) = prometheus_sample_value(sample) {
                rows.push(vec![metric_label(&metric), timestamp, value]);
            }
        }
        series.push(json!({
            "metric": metric,
            "values": values,
        }));
    }
    (rows, Value::Array(series))
}

fn prometheus_sample_value(value: &Value) -> Option<(String, String)> {
    let parts = value.as_array()?;
    let timestamp = parts.first().map(prometheus_value_to_string)?;
    let sample = parts.get(1).map(prometheus_value_to_string)?;
    Some((timestamp, sample))
}

fn prometheus_value_to_string(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn metric_label(metric: &Value) -> String {
    metric
        .get("__name__")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| metric.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::normalize_prometheus_result;

    #[test]
    fn prometheus_vector_results_normalize_to_rows_and_series() {
        let result = json!([
            {
                "metric": { "__name__": "up", "job": "api" },
                "value": [1710000000.0, "1"]
            }
        ]);
        let (rows, series) = normalize_prometheus_result("vector", &result);

        assert_eq!(rows, vec![vec!["up", "1710000000.0", "1"]]);
        assert_eq!(series.as_array().unwrap().len(), 1);
    }

    #[test]
    fn prometheus_matrix_results_expand_samples_to_table_rows() {
        let result = json!([
            {
                "metric": { "__name__": "http_requests_total" },
                "values": [[1710000000.0, "2"], [1710000060.0, "3"]]
            }
        ]);
        let (rows, _series) = normalize_prometheus_result("matrix", &result);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0][0], "http_requests_total");
    }
}
