use serde_json::{json, Value};

use super::super::super::*;
use super::connection::{influxdb_database, influxdb_get, influxdb_query_path};
use super::InfluxDbAdapter;

pub(super) async fn execute_influxdb_query(
    adapter: &InfluxDbAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let query_text = selected_query(request).trim();
    if query_text.is_empty() {
        return Err(CommandError::new(
            "influxdb-query-missing",
            "No InfluxQL query was provided.",
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let database = influxdb_database(connection);
    let response = influxdb_get(connection, &influxdb_query_path(&database, query_text)).await?;
    let value = parse_influxdb_json(&response.body)?;
    let (columns, rows, series) = normalize_influxdb_query_result(&value, row_limit);
    let row_count = rows.len() as u32;
    let payloads = vec![
        payload_table(columns, rows),
        payload_series(series),
        payload_json(value),
        payload_raw(query_text.into()),
    ];
    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("InfluxDB query returned {row_count} sample row(s)."),
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

pub(crate) fn parse_influxdb_json(body: &str) -> Result<Value, CommandError> {
    serde_json::from_str(body).map_err(|error| {
        CommandError::new(
            "influxdb-json-invalid",
            format!("InfluxDB returned invalid JSON: {error}"),
        )
    })
}

pub(crate) fn normalize_influxdb_query_result(
    value: &Value,
    row_limit: u32,
) -> (Vec<String>, Vec<Vec<String>>, Value) {
    let mut sample_columns = Vec::<String>::new();
    let mut rows = Vec::<Vec<String>>::new();
    let mut normalized_series = Vec::<Value>::new();

    for series in value
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|result| {
            result
                .get("series")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
    {
        let name = series
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("series")
            .to_string();
        let tags = series.get("tags").cloned().unwrap_or_else(|| json!({}));
        let columns = series
            .get("columns")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect::<Vec<_>>();
        for column in &columns {
            if !sample_columns.contains(column) {
                sample_columns.push(column.clone());
            }
        }

        let values = series
            .get("values")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for value_row in &values {
            if rows.len() >= row_limit as usize {
                break;
            }
            let values = value_row.as_array().cloned().unwrap_or_default();
            let mut row = vec![name.clone(), tags.to_string()];
            for column in &sample_columns {
                let value = columns
                    .iter()
                    .position(|item| item == column)
                    .and_then(|index| values.get(index))
                    .map(influxdb_value_to_string)
                    .unwrap_or_default();
                row.push(value);
            }
            rows.push(row);
        }

        normalized_series.push(json!({
            "name": name,
            "tags": tags,
            "columns": columns,
            "values": values,
        }));
    }

    let mut table_columns = vec!["measurement".into(), "tags".into()];
    table_columns.extend(sample_columns);
    (table_columns, rows, Value::Array(normalized_series))
}

fn influxdb_value_to_string(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::normalize_influxdb_query_result;

    #[test]
    fn influxdb_result_normalizes_series_to_table_rows() {
        let value = json!({
            "results": [{
                "series": [{
                    "name": "cpu",
                    "tags": { "host": "app-1" },
                    "columns": ["time", "usage_user"],
                    "values": [["2026-04-25T10:00:00Z", 42.5]]
                }]
            }]
        });
        let (columns, rows, series) = normalize_influxdb_query_result(&value, 100);

        assert_eq!(columns, vec!["measurement", "tags", "time", "usage_user"]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0][0], "cpu");
        assert_eq!(rows[0][3], "42.5");
        assert_eq!(series.as_array().unwrap().len(), 1);
    }

    #[test]
    fn influxdb_result_respects_row_limit() {
        let value = json!({
            "results": [{
                "series": [{
                    "name": "cpu",
                    "columns": ["time", "value"],
                    "values": [[1, 2], [3, 4]]
                }]
            }]
        });
        let (_columns, rows, _series) = normalize_influxdb_query_result(&value, 1);

        assert_eq!(rows.len(), 1);
    }
}
