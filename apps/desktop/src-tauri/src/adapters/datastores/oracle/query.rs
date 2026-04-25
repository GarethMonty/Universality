use serde_json::{json, Value};

use super::super::super::*;
use super::connection::{oracle_request_payload, oracle_service_name};
use super::OracleAdapter;

pub(super) async fn execute_oracle_query(
    adapter: &OracleAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    mut notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let statement = selected_query(request).trim();
    if statement.is_empty() {
        return Err(CommandError::new(
            "oracle-query-missing",
            "No Oracle SQL/PLSQL statement was provided.",
        ));
    }
    if !is_read_only_oracle_statement(statement) {
        return Err(CommandError::new(
            "oracle-write-preview-only",
            "Oracle DDL, DML, PL/SQL mutation, and admin statements are operation-plan preview only in this adapter phase.",
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let explain = matches!(execute_mode(request), "explain" | "profile" | "plan");
    let request_payload = oracle_request_payload(connection, statement, row_limit, explain);
    notices.push(QueryExecutionNotice {
        code: "oracle-contract".into(),
        level: "info".into(),
        message:
            "Oracle SQL/PLSQL was normalized as a guarded driver request payload pending native OCI/thin execution."
                .into(),
    });

    let response = preview_oracle_response(connection, statement, row_limit, explain);
    let (columns, rows) = normalize_oracle_response(&response, row_limit);
    let row_count = rows.len() as u32;
    let profile = payload_profile(
        "Oracle DBMS_XPLAN/profile placeholder.",
        json!({
            "service": oracle_service_name(connection),
            "explainPlan": explain,
            "dictionaryViews": ["ALL_TABLES", "ALL_TAB_COLUMNS", "ALL_INDEXES", "V$SESSION"],
            "live": false
        }),
    );
    let payloads = vec![
        payload_table(columns, rows),
        payload_json(response.clone()),
        payload_plan(
            "json",
            request_payload.clone(),
            "Oracle driver request payload with EXPLAIN PLAN/DBMS_XPLAN guardrails.",
        ),
        profile,
        payload_metrics(json!([
            {
                "name": "oracle.contract.ready",
                "value": 1,
                "unit": "flag",
                "labels": { "service": oracle_service_name(connection) }
            }
        ])),
        payload_raw(serde_json::to_string_pretty(&request_payload).unwrap_or_default()),
    ];
    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("Oracle contract adapter normalized {row_count} row(s)."),
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

pub(crate) fn preview_oracle_response(
    connection: &ResolvedConnectionProfile,
    statement: &str,
    row_limit: u32,
    explain: bool,
) -> Value {
    json!({
        "columns": ["service", "status", "row_limit", "explain"],
        "rows": [[
            oracle_service_name(connection),
            "driver-request-built",
            row_limit.to_string(),
            explain.to_string()
        ]],
        "statement": statement
    })
}

pub(crate) fn normalize_oracle_response(
    response: &Value,
    row_limit: u32,
) -> (Vec<String>, Vec<Vec<String>>) {
    let columns = response
        .get("columns")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<Vec<_>>();
    let columns = if columns.is_empty() {
        vec!["status".into()]
    } else {
        columns
    };
    let rows = response
        .get("rows")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(row_limit as usize)
        .map(|row| {
            row.as_array()
                .into_iter()
                .flatten()
                .map(oracle_value_to_string)
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    if rows.is_empty() {
        (columns, vec![vec!["requestBuilt".into()]])
    } else {
        (columns, rows)
    }
}

pub(crate) fn is_read_only_oracle_statement(statement: &str) -> bool {
    let normalized = statement.trim_start().to_lowercase();
    normalized.starts_with("select")
        || normalized.starts_with("with")
        || normalized.starts_with("explain plan")
        || normalized.starts_with("desc")
        || normalized.starts_with("describe")
        || normalized.starts_with("show")
}

fn oracle_value_to_string(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        is_read_only_oracle_statement, normalize_oracle_response, preview_oracle_response,
    };
    use crate::domain::models::ResolvedConnectionProfile;

    fn connection() -> ResolvedConnectionProfile {
        ResolvedConnectionProfile {
            id: "conn-oracle".into(),
            name: "Oracle".into(),
            engine: "oracle".into(),
            family: "sql".into(),
            host: "dbhost".into(),
            port: None,
            database: Some("FREEPDB1".into()),
            username: Some("APP".into()),
            password: None,
            connection_string: None,
            read_only: true,
        }
    }

    #[test]
    fn oracle_preview_response_normalizes_rows() {
        let response = preview_oracle_response(&connection(), "select * from dual", 25, true);
        let (columns, rows) = normalize_oracle_response(&response, 25);

        assert_eq!(columns, vec!["service", "status", "row_limit", "explain"]);
        assert_eq!(rows[0][1], "driver-request-built");
    }

    #[test]
    fn oracle_response_respects_row_limit() {
        let response = json!({ "columns": ["id"], "rows": [["1"], ["2"]] });
        let (_, rows) = normalize_oracle_response(&response, 1);

        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn oracle_read_only_guard_detects_mutations() {
        assert!(is_read_only_oracle_statement("select * from dual"));
        assert!(is_read_only_oracle_statement("with q as (select 1 from dual) select * from q"));
        assert!(!is_read_only_oracle_statement("insert into t values (1)"));
        assert!(!is_read_only_oracle_statement("begin delete from t; end;"));
    }
}
