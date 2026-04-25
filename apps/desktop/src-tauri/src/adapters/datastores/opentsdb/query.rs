use serde_json::{json, Value};

use super::super::super::*;
use super::connection::opentsdb_post_json;
use super::OpenTsdbAdapter;

pub(super) async fn execute_opentsdb_query(
    adapter: &OpenTsdbAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let query_text = selected_query(request).trim();
    if query_text.is_empty() {
        return Err(CommandError::new(
            "opentsdb-query-missing",
            "No OpenTSDB query JSON was provided.",
        ));
    }

    let body = normalize_opentsdb_query_body(query_text)?;
    let response = opentsdb_post_json(connection, "/api/query", &body).await?;
    let value: Value = serde_json::from_str(&response.body).map_err(|error| {
        CommandError::new(
            "opentsdb-json-invalid",
            format!("OpenTSDB returned invalid JSON: {error}"),
        )
    })?;
    let (rows, series) = normalize_opentsdb_response(&value);
    let row_count = rows.len() as u32;
    let payloads = vec![
        payload_table(
            vec!["metric".into(), "timestamp".into(), "value".into()],
            rows,
        ),
        payload_series(series),
        payload_json(value),
        payload_raw(body),
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
        summary: format!("OpenTSDB query returned {row_count} datapoint(s)."),
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

pub(crate) fn normalize_opentsdb_query_body(query_text: &str) -> Result<String, CommandError> {
    if query_text.trim_start().starts_with('{') {
        let value: Value = serde_json::from_str(query_text).map_err(|error| {
            CommandError::new(
                "opentsdb-query-json-invalid",
                format!("OpenTSDB query must be JSON for live execution: {error}"),
            )
        })?;
        serde_json::to_string(&value).map_err(|error| {
            CommandError::new(
                "opentsdb-query-json-invalid",
                format!("OpenTSDB query could not be normalized: {error}"),
            )
        })
    } else {
        Err(CommandError::new(
            "opentsdb-query-json-required",
            "OpenTSDB live execution expects an /api/query JSON body.",
        ))
    }
}

pub(crate) fn normalize_opentsdb_response(value: &Value) -> (Vec<Vec<String>>, Value) {
    let mut rows = Vec::new();
    let mut series = Vec::new();
    for item in value.as_array().into_iter().flatten() {
        let metric = item
            .get("metric")
            .and_then(Value::as_str)
            .unwrap_or("metric");
        let dps = item
            .get("dps")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut values = Vec::new();
        for (timestamp, sample) in dps {
            let sample_value = sample
                .as_f64()
                .map(|value| value.to_string())
                .unwrap_or_else(|| sample.to_string());
            rows.push(vec![metric.into(), timestamp.clone(), sample_value.clone()]);
            values.push(json!([timestamp, sample_value]));
        }
        series.push(json!({
            "metric": metric,
            "tags": item.get("tags").cloned().unwrap_or_else(|| json!({})),
            "values": values,
        }));
    }
    (rows, Value::Array(series))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{normalize_opentsdb_query_body, normalize_opentsdb_response};

    #[test]
    fn opentsdb_query_body_requires_json() {
        assert!(normalize_opentsdb_query_body("sys.cpu.user").is_err());
        let normalized =
            normalize_opentsdb_query_body(r#"{ "start": "1h-ago", "queries": [] }"#).unwrap();
        let value: serde_json::Value = serde_json::from_str(&normalized).unwrap();
        assert_eq!(value["start"], "1h-ago");
        assert!(value["queries"].as_array().unwrap().is_empty());
    }

    #[test]
    fn opentsdb_response_normalizes_dps_to_rows() {
        let value = json!([
            {
                "metric": "sys.cpu.user",
                "tags": { "host": "a" },
                "dps": { "1710000000": 1.5, "1710000060": 2.0 }
            }
        ]);
        let (rows, series) = normalize_opentsdb_response(&value);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0][0], "sys.cpu.user");
        assert_eq!(series.as_array().unwrap().len(), 1);
    }
}
