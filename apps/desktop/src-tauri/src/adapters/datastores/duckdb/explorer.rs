use serde_json::json;

use super::super::super::*;
use super::catalog::duckdb_execution_capabilities;
use super::connection::{duckdb_error, duckdb_quote_identifier, open_duckdb_connection};
use super::query::query_table;

pub(super) async fn list_duckdb_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let db = open_duckdb_connection(connection)?;
    let nodes = match request.scope.as_deref() {
        Some(scope) if scope.starts_with("duckdb:table:") => {
            let table = scope.trim_start_matches("duckdb:table:");
            column_nodes(connection, &db, table)?
        }
        Some("duckdb:extensions") => extension_nodes(connection, &db)?,
        Some(_) => Vec::new(),
        None => root_nodes(connection, &db, request.limit)?,
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} DuckDB explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: duckdb_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_duckdb_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .strip_prefix("duckdb-table:")
        .map(duckdb_select_template)
        .unwrap_or_else(|| match request.node_id.as_str() {
            "duckdb-extensions" => "select * from duckdb_extensions();".into(),
            _ => "select * from information_schema.tables limit 100;".into(),
        });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "DuckDB inspection query ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "nodeId": request.node_id,
            "engine": "duckdb",
        })),
    }
}

fn root_nodes(
    connection: &ResolvedConnectionProfile,
    db: &duckdb::Connection,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let limit = bounded_page_size(limit.or(Some(100)));
    let sql = format!(
        "select table_schema, table_name, table_type from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') order by table_schema, table_name limit {limit}"
    );
    let (_columns, rows) = query_table(db, &sql, limit)?;
    let mut nodes = rows
        .into_iter()
        .filter_map(|row| {
            let schema = row.first()?.clone();
            let table = row.get(1)?.clone();
            let table_type = row.get(2).cloned().unwrap_or_else(|| "BASE TABLE".into());
            Some(ExplorerNode {
                id: format!("duckdb-table:{schema}.{table}"),
                family: "embedded-olap".into(),
                label: format!("{schema}.{table}"),
                kind: "table".into(),
                detail: table_type,
                scope: Some(format!("duckdb:table:{schema}.{table}")),
                path: Some(vec![connection.name.clone(), "Tables".into()]),
                query_template: Some(duckdb_select_template(&format!("{schema}.{table}"))),
                expandable: Some(true),
            })
        })
        .collect::<Vec<_>>();
    nodes.push(ExplorerNode {
        id: "duckdb-extensions".into(),
        family: "embedded-olap".into(),
        label: "Extensions".into(),
        kind: "extensions".into(),
        detail: "Installed and available DuckDB extensions".into(),
        scope: Some("duckdb:extensions".into()),
        path: Some(vec![connection.name.clone()]),
        query_template: Some("select * from duckdb_extensions();".into()),
        expandable: Some(true),
    });
    Ok(nodes)
}

fn column_nodes(
    connection: &ResolvedConnectionProfile,
    db: &duckdb::Connection,
    scoped_table: &str,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let (schema, table) = scoped_table
        .split_once('.')
        .unwrap_or(("main", scoped_table));
    let sql = format!(
        "select column_name, data_type from information_schema.columns where table_schema = '{}' and table_name = '{}' order by ordinal_position",
        sql_literal(schema),
        sql_literal(table)
    );
    let (_columns, rows) = query_table(db, &sql, 500)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let name = row.first()?.clone();
            let data_type = row.get(1).cloned().unwrap_or_default();
            Some(ExplorerNode {
                id: format!("duckdb-column:{scoped_table}.{name}"),
                family: "embedded-olap".into(),
                label: name,
                kind: "column".into(),
                detail: data_type,
                scope: None,
                path: Some(vec![connection.name.clone(), scoped_table.into()]),
                query_template: Some(duckdb_select_template(scoped_table)),
                expandable: Some(false),
            })
        })
        .collect())
}

fn extension_nodes(
    connection: &ResolvedConnectionProfile,
    db: &duckdb::Connection,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let mut stmt = db
        .prepare("select extension_name, installed, loaded from duckdb_extensions() order by extension_name limit 100")
        .map_err(duckdb_error)?;
    let mut rows = stmt.query([]).map_err(duckdb_error)?;
    let mut nodes = Vec::new();
    while let Some(row) = rows.next().map_err(duckdb_error)? {
        let name: String = row.get(0).map_err(duckdb_error)?;
        let installed: bool = row.get(1).unwrap_or(false);
        let loaded: bool = row.get(2).unwrap_or(false);
        nodes.push(ExplorerNode {
            id: format!("duckdb-extension:{name}"),
            family: "embedded-olap".into(),
            label: name,
            kind: "extension".into(),
            detail: format!("installed={installed}, loaded={loaded}"),
            scope: None,
            path: Some(vec![connection.name.clone(), "Extensions".into()]),
            query_template: Some("select * from duckdb_extensions();".into()),
            expandable: Some(false),
        });
    }
    Ok(nodes)
}

pub(crate) fn duckdb_select_template(scoped_table: &str) -> String {
    let quoted = scoped_table
        .split('.')
        .map(duckdb_quote_identifier)
        .collect::<Vec<_>>()
        .join(".");
    format!("select * from {quoted} limit 100;")
}

#[cfg(test)]
mod tests {
    use super::duckdb_select_template;

    #[test]
    fn duckdb_select_template_quotes_schema_and_table() {
        assert_eq!(
            duckdb_select_template("main.orders"),
            "select * from \"main\".\"orders\" limit 100;"
        );
    }
}
