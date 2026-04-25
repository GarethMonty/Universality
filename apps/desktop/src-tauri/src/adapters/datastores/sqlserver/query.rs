use serde_json::json;
use tiberius::ColumnData;

use super::super::super::*;
use super::connection::sqlserver_client;
use super::SqlServerAdapter;

fn stringify_tiberius_cell(data: &ColumnData<'_>) -> String {
    match data {
        ColumnData::Bit(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::U8(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::I16(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::I32(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::I64(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::F32(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::F64(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::String(value) => value
            .as_ref()
            .map(|item| item.to_string())
            .unwrap_or_else(|| "null".into()),
        ColumnData::Guid(value) => value
            .as_ref()
            .map(|item| item.to_string())
            .unwrap_or_else(|| "null".into()),
        ColumnData::Binary(value) => value
            .as_ref()
            .map(|item| format!("<{} bytes>", item.len()))
            .unwrap_or_else(|| "null".into()),
        ColumnData::Numeric(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::Xml(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::DateTime(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::SmallDateTime(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::Time(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::Date(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::DateTime2(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::DateTimeOffset(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
    }
}

pub(super) async fn execute_sqlserver_query(
    adapter: &SqlServerAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let statement = selected_query(request);
    let query = if execute_mode(request) == "explain" {
        format!("SET SHOWPLAN_TEXT ON; {statement}; SET SHOWPLAN_TEXT OFF;")
    } else {
        statement.to_string()
    };
    let row_limit = request
        .row_limit
        .unwrap_or(adapter.execution_capabilities().default_row_limit);
    let mut client = sqlserver_client(connection).await?;
    let results = client.simple_query(query).await?.into_results().await?;
    let first_result = results.into_iter().next().unwrap_or_default();
    let columns = first_result
        .first()
        .map(|row| {
            row.columns()
                .iter()
                .map(|column| column.name().to_string())
                .collect()
        })
        .unwrap_or_else(Vec::new);
    let total_rows = first_result.len();
    let tabular_rows = first_result
        .iter()
        .take(row_limit as usize)
        .map(|row| {
            row.cells()
                .map(|(_, value)| stringify_tiberius_cell(value))
                .collect()
        })
        .collect::<Vec<Vec<String>>>();

    let primary_payload = if execute_mode(request) == "explain" {
        payload_raw(
            tabular_rows
                .iter()
                .flat_map(|row| row.iter().cloned())
                .collect::<Vec<String>>()
                .join("\n"),
        )
    } else if columns.is_empty() {
        payload_raw("Statement executed successfully.".into())
    } else {
        payload_table(columns.clone(), tabular_rows)
    };
    let explain_payload = if execute_mode(request) == "explain" {
        Some(primary_payload.clone())
    } else {
        None
    };

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("{total_rows} row(s) returned from {}.", connection.name),
        default_renderer: if execute_mode(request) == "explain" {
            "raw"
        } else {
            "table"
        },
        renderer_modes: if execute_mode(request) == "explain" {
            vec!["raw", "table", "json"]
        } else {
            vec!["table", "json", "raw"]
        },
        payloads: vec![
            primary_payload,
            payload_json(json!({
                "engine": connection.engine,
                "rowCount": total_rows,
                "rowLimit": row_limit,
            })),
            payload_raw(statement.to_string()),
        ],
        notices,
        duration_ms: duration_ms(started),
        row_limit: Some(row_limit),
        truncated: total_rows > row_limit as usize,
        explain_payload,
    }))
}
