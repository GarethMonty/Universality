use serde_json::json;

use super::super::super::*;
use super::connection::sqlserver_client;
use super::SqlServerAdapter;

pub(super) async fn list_sqlserver_explorer_nodes(
    adapter: &SqlServerAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let mut client = sqlserver_client(connection).await?;
    let nodes = if let Some(scope) = &request.scope {
        if let Some(schema) = scope.strip_prefix("schema:") {
            let query = format!(
                    "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '{}' ORDER BY table_name",
                    sql_literal(schema)
                );
            client
                .simple_query(query)
                .await?
                .into_first_result()
                .await?
                .into_iter()
                .map(|row| {
                    let table_name = row
                        .get::<&str, _>("table_name")
                        .unwrap_or_default()
                        .to_string();

                    ExplorerNode {
                        id: format!("{schema}.{table_name}"),
                        family: "sql".into(),
                        label: table_name.clone(),
                        kind: row
                            .get::<&str, _>("table_type")
                            .unwrap_or("table")
                            .to_lowercase(),
                        detail: "Columns, indexes, and row estimates".into(),
                        scope: Some(format!("table:{schema}.{table_name}")),
                        path: Some(vec![connection.name.clone(), schema.to_string()]),
                        query_template: Some(format!(
                            "select top 100 * from {schema}.{table_name};"
                        )),
                        expandable: Some(true),
                    }
                })
                .collect()
        } else if let Some(table) = scope.strip_prefix("table:") {
            let (schema, table_name) = table.split_once('.').unwrap_or(("dbo", table));
            let query = format!(
                    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = '{}' AND table_name = '{}' ORDER BY ordinal_position",
                    sql_literal(schema),
                    sql_literal(table_name)
                );
            client
                .simple_query(query)
                .await?
                .into_first_result()
                .await?
                .into_iter()
                .map(|row| ExplorerNode {
                    id: format!(
                        "{table}:{}",
                        row.get::<&str, _>("column_name").unwrap_or_default()
                    ),
                    family: "sql".into(),
                    label: row.get::<&str, _>("column_name").unwrap_or_default().into(),
                    kind: "column".into(),
                    detail: row.get::<&str, _>("data_type").unwrap_or_default().into(),
                    scope: None,
                    path: Some(vec![connection.name.clone(), table.to_string()]),
                    query_template: None,
                    expandable: Some(false),
                })
                .collect()
        } else {
            Vec::new()
        }
    } else {
        client
                .simple_query("SELECT schema_name FROM information_schema.schemata ORDER BY schema_name")
                .await?
                .into_first_result()
                .await?
                .into_iter()
                .map(|row| {
                    let schema = row
                        .get::<&str, _>("schema_name")
                        .unwrap_or_default()
                        .to_string();

                    ExplorerNode {
                        id: format!("schema-{schema}"),
                        family: "sql".into(),
                        label: schema.clone(),
                        kind: "schema".into(),
                        detail: "SQL Server schema".into(),
                        scope: Some(format!("schema:{schema}")),
                        path: Some(vec![connection.name.clone()]),
                        query_template: Some(format!(
                            "select table_name from information_schema.tables where table_schema = '{schema}' order by table_name;"
                        )),
                        expandable: Some(true),
                    }
                })
                .collect()
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: adapter.execution_capabilities(),
        nodes,
    })
}

pub(super) async fn inspect_sqlserver_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> Result<ExplorerInspectResponse, CommandError> {
    Ok(ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Inspection ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(if request.node_id.contains('.') {
            format!("select top 100 * from {};", request.node_id)
        } else {
            "select 1;".into()
        }),
        payload: Some(json!({
            "nodeId": request.node_id,
            "engine": connection.engine,
        })),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn inspect_sqlserver_explorer_node_uses_select_1_for_unresolved_nodes() {
        let connection = ResolvedConnectionProfile {
            id: "conn".into(),
            name: "SQL Server".into(),
            engine: "sqlserver".into(),
            family: "sql".into(),
            host: "localhost".into(),
            port: Some(1433),
            database: Some("master".into()),
            username: None,
            password: None,
            connection_string: None,
            read_only: false,
        };
        let response = inspect_sqlserver_explorer_node(
            &connection,
            &ExplorerInspectRequest {
                connection_id: "conn".into(),
                environment_id: "env".into(),
                node_id: "orders".into(),
            },
        )
        .await
        .expect("inspection response");

        assert_eq!(response.query_template.as_deref(), Some("select 1;"));
    }

    #[tokio::test]
    async fn inspect_sqlserver_explorer_node_keeps_explicit_table_when_available() {
        let connection = ResolvedConnectionProfile {
            id: "conn".into(),
            name: "SQL Server".into(),
            engine: "sqlserver".into(),
            family: "sql".into(),
            host: "localhost".into(),
            port: Some(1433),
            database: Some("master".into()),
            username: None,
            password: None,
            connection_string: None,
            read_only: false,
        };
        let response = inspect_sqlserver_explorer_node(
            &connection,
            &ExplorerInspectRequest {
                connection_id: "conn".into(),
                environment_id: "env".into(),
                node_id: "dbo.orders".into(),
            },
        )
        .await
        .expect("inspection response");

        assert_eq!(
            response.query_template.as_deref(),
            Some("select top 100 * from dbo.orders;")
        );
    }
}
