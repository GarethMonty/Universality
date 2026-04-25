use serde_json::json;

use super::super::super::*;
use super::catalog::oracle_execution_capabilities;
use super::connection::oracle_service_name;

pub(super) async fn list_oracle_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("oracle:schemas") => schema_nodes(connection),
        Some(scope) if scope.starts_with("oracle:schema:") => schema_child_nodes(connection, scope),
        Some("oracle:security") => security_nodes(connection),
        Some("oracle:diagnostics") => diagnostics_nodes(connection),
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} Oracle explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: oracle_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_oracle_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .strip_prefix("oracle-table:")
        .and_then(|rest| rest.split_once(':'))
        .map(|(schema, table)| oracle_table_query(schema, table))
        .unwrap_or_else(|| match request.node_id.as_str() {
            "oracle-schemas" => "select username from all_users order by username".into(),
            "oracle-security" => "select * from session_privs".into(),
            "oracle-diagnostics" => "select * from v$session where rownum <= 100".into(),
            _ => "select * from all_tables where rownum <= 100".into(),
        });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Oracle SQL template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "oracle",
            "nodeId": request.node_id,
            "service": oracle_service_name(connection),
            "dictionaryViews": ["ALL_TABLES", "ALL_TAB_COLUMNS", "ALL_INDEXES", "ALL_OBJECTS"]
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "oracle-schemas",
            "Schemas",
            "schemas",
            "Schemas, tables, views, indexes, sequences, and packages",
            "oracle:schemas",
            "select username from all_users order by username",
        ),
        (
            "oracle-security",
            "Security",
            "security",
            "Roles, privileges, grants, and effective permissions",
            "oracle:security",
            "select * from session_privs",
        ),
        (
            "oracle-diagnostics",
            "Diagnostics",
            "diagnostics",
            "Sessions, waits, plans, and DBMS_XPLAN templates",
            "oracle:diagnostics",
            "select * from v$session where rownum <= 100",
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, scope, query)| ExplorerNode {
        id: id.into(),
        family: "sql".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: Some(scope.into()),
        path: Some(vec![connection.name.clone(), "Oracle".into()]),
        query_template: Some(query.into()),
        expandable: Some(true),
    })
    .collect()
}

fn schema_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    let schema = connection
        .username
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("APP");
    vec![ExplorerNode {
        id: format!("oracle-schema:{schema}"),
        family: "sql".into(),
        label: schema.into(),
        kind: "schema".into(),
        detail: "Configured schema placeholder".into(),
        scope: Some(format!("oracle:schema:{schema}")),
        path: Some(vec![connection.name.clone(), "Schemas".into()]),
        query_template: Some(format!(
            "select table_name from all_tables where owner = '{}'",
            sql_literal(schema)
        )),
        expandable: Some(true),
    }]
}

fn schema_child_nodes(connection: &ResolvedConnectionProfile, scope: &str) -> Vec<ExplorerNode> {
    let schema = scope.trim_start_matches("oracle:schema:");
    [
        (
            format!("oracle-table:{schema}:TABLE"),
            "Tables",
            "tables",
            "Base tables and row/query templates",
            oracle_table_query(schema, "TABLE"),
        ),
        (
            format!("oracle-views:{schema}"),
            "Views",
            "views",
            "Views and saved query projections",
            format!(
                "select view_name from all_views where owner = '{}'",
                sql_literal(schema)
            ),
        ),
        (
            format!("oracle-indexes:{schema}"),
            "Indexes",
            "indexes",
            "Indexes, uniqueness, and storage metadata",
            format!(
                "select * from all_indexes where owner = '{}'",
                sql_literal(schema)
            ),
        ),
        (
            format!("oracle-packages:{schema}"),
            "Packages",
            "packages",
            "PL/SQL package and procedure metadata",
            format!(
                "select * from all_objects where owner = '{}' and object_type in ('PACKAGE','PROCEDURE','FUNCTION')",
                sql_literal(schema)
            ),
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, query)| ExplorerNode {
        id,
        family: "sql".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: None,
        path: Some(vec![connection.name.clone(), schema.into()]),
        query_template: Some(query),
        expandable: Some(false),
    })
    .collect()
}

fn security_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    vec![ExplorerNode {
        id: "oracle-session-privileges".into(),
        family: "sql".into(),
        label: "Session Privileges".into(),
        kind: "permissions".into(),
        detail: "Effective privileges for current user/session".into(),
        scope: None,
        path: Some(vec![connection.name.clone(), "Security".into()]),
        query_template: Some("select * from session_privs".into()),
        expandable: Some(false),
    }]
}

fn diagnostics_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    vec![ExplorerNode {
        id: "oracle-session-waits".into(),
        family: "sql".into(),
        label: "Sessions And Waits".into(),
        kind: "diagnostics".into(),
        detail: "V$SESSION and DBMS_XPLAN diagnostic templates".into(),
        scope: None,
        path: Some(vec![connection.name.clone(), "Diagnostics".into()]),
        query_template: Some(
            "select * from v$session where rownum <= 100; select * from table(dbms_xplan.display);"
                .into(),
        ),
        expandable: Some(false),
    }]
}

pub(crate) fn oracle_table_query(schema: &str, table: &str) -> String {
    format!(
        "select * from {}.{} where rownum <= 100",
        quote_identifier(schema),
        quote_identifier(table)
    )
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

#[cfg(test)]
mod tests {
    use super::oracle_table_query;

    #[test]
    fn oracle_table_query_quotes_schema_and_table() {
        assert_eq!(
            oracle_table_query("APP", "ORDERS"),
            "select * from \"APP\".\"ORDERS\" where rownum <= 100"
        );
    }
}
