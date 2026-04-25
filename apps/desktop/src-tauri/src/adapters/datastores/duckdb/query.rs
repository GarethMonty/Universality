use serde_json::json;

use super::super::super::*;
use super::connection::{duckdb_error, duckdb_value_to_string, open_duckdb_connection};
use super::DuckDbAdapter;

pub(super) async fn execute_duckdb_query(
    adapter: &DuckDbAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let statement = selected_query(request).trim();
    if statement.is_empty() {
        return Err(CommandError::new(
            "duckdb-query-missing",
            "No DuckDB SQL statement was provided.",
        ));
    }
    if connection.read_only && is_mutating_sql(statement) {
        return Err(CommandError::new(
            "duckdb-read-only",
            "DuckDB profile is read-only; write, DDL, import, export, and admin statements are blocked before execution.",
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let sql = duckdb_statement_for_mode(statement, execute_mode(request));
    let db = open_duckdb_connection(connection)?;
    let payloads = match query_table(&db, &sql, row_limit) {
        Ok((columns, rows)) => {
            let mut payloads = vec![
                payload_table(columns, rows.clone()),
                payload_json(json!({
                    "engine": "duckdb",
                    "rowCount": rows.len(),
                    "rowLimit": row_limit,
                })),
                payload_raw(sql.clone()),
            ];
            if matches!(execute_mode(request), "explain" | "profile") {
                payloads.insert(
                    0,
                    payload_plan(
                        "text",
                        json!(rows),
                        if execute_mode(request) == "profile" {
                            "DuckDB EXPLAIN ANALYZE profile returned."
                        } else {
                            "DuckDB EXPLAIN plan returned."
                        },
                    ),
                );
            }
            payloads
        }
        Err(error) if is_non_query_error(&error.message) => {
            db.execute_batch(&sql).map_err(duckdb_error)?;
            vec![
                payload_json(json!({ "engine": "duckdb", "statementExecuted": true })),
                payload_raw(sql.clone()),
            ]
        }
        Err(error) => return Err(error),
    };
    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();
    let buffered_rows = payloads
        .iter()
        .find(|payload| {
            payload.get("renderer").and_then(serde_json::Value::as_str) == Some("table")
        })
        .and_then(|payload| payload.get("rows").and_then(serde_json::Value::as_array))
        .map(Vec::len)
        .unwrap_or_default();

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("DuckDB statement returned {buffered_rows} row(s)."),
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

pub(crate) fn query_table(
    db: &duckdb::Connection,
    sql: &str,
    row_limit: u32,
) -> Result<(Vec<String>, Vec<Vec<String>>), CommandError> {
    let mut stmt = db.prepare(sql).map_err(duckdb_error)?;
    let mut rows = stmt.query([]).map_err(duckdb_error)?;
    let columns = rows
        .as_ref()
        .map(|statement| statement.column_names())
        .unwrap_or_default();
    let column_count = rows
        .as_ref()
        .map(|statement| statement.column_count())
        .unwrap_or_default();
    let mut output = Vec::new();
    while let Some(row) = rows.next().map_err(duckdb_error)? {
        if output.len() >= row_limit as usize {
            break;
        }
        let mut cells = Vec::with_capacity(column_count);
        for index in 0..column_count {
            let value = row.get_ref(index).map_err(duckdb_error)?;
            cells.push(duckdb_value_to_string(value));
        }
        output.push(cells);
    }
    Ok((columns, output))
}

pub(crate) fn duckdb_statement_for_mode(statement: &str, mode: &str) -> String {
    let statement = statement.trim().trim_end_matches(';');
    match mode {
        "explain" if !statement.to_ascii_lowercase().starts_with("explain") => {
            format!("EXPLAIN {statement}")
        }
        "profile"
            if !statement
                .to_ascii_lowercase()
                .starts_with("explain analyze") =>
        {
            format!("EXPLAIN ANALYZE {statement}")
        }
        _ => statement.into(),
    }
}

pub(crate) fn is_mutating_sql(statement: &str) -> bool {
    let first = statement
        .trim_start()
        .split(|ch: char| ch.is_whitespace() || ch == '(')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        first.as_str(),
        "attach"
            | "copy"
            | "create"
            | "delete"
            | "detach"
            | "drop"
            | "export"
            | "import"
            | "insert"
            | "install"
            | "load"
            | "replace"
            | "update"
            | "vacuum"
    )
}

fn is_non_query_error(message: &str) -> bool {
    message.contains("No arrow data available")
        || message.contains("not a query")
        || message.contains("does not return rows")
}

#[cfg(test)]
mod tests {
    use duckdb::Connection;

    use super::{duckdb_statement_for_mode, is_mutating_sql, query_table};

    #[test]
    fn duckdb_modes_generate_explain_statements() {
        assert_eq!(
            duckdb_statement_for_mode("select 1;", "explain"),
            "EXPLAIN select 1"
        );
        assert_eq!(
            duckdb_statement_for_mode("select 1", "profile"),
            "EXPLAIN ANALYZE select 1"
        );
    }

    #[test]
    fn duckdb_read_only_guard_detects_mutations() {
        assert!(is_mutating_sql("create table t(i int)"));
        assert!(is_mutating_sql("COPY t TO 'file.parquet'"));
        assert!(!is_mutating_sql("select * from t"));
    }

    #[test]
    fn duckdb_query_table_reads_rows() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "create table t(i integer, name varchar); insert into t values (1, 'Ada');",
        )
        .unwrap();
        let (columns, rows) = query_table(&db, "select i, name from t", 10).unwrap();

        assert_eq!(columns, vec!["i", "name"]);
        assert_eq!(rows, vec![vec!["1", "Ada"]]);
    }
}
