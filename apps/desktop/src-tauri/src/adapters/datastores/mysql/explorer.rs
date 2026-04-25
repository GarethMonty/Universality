use serde_json::json;
use sqlx::Row;

use super::super::super::*;
use super::connection::mysql_dsn;

pub(super) async fn list_mysql_explorer_nodes(
    engine: &str,
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let pool = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(1)
        .connect(&mysql_dsn(connection))
        .await?;
    let active_schema = request
        .scope
        .as_deref()
        .and_then(|scope| scope.strip_prefix("schema:"))
        .map(str::to_string)
        .or_else(|| connection.database.clone())
        .unwrap_or_else(|| "mysql".into());
    let nodes: Vec<ExplorerNode> = if request.scope.is_some() {
        let limit = bounded_page_size(request.limit.or(Some(100)));
        let query = format!(
            "select table_name, table_type from information_schema.tables where table_schema = '{}' order by table_name limit {}",
            sql_literal(&active_schema),
            limit,
        );
        sqlx::query(&query)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| {
                let table_name = row.get::<String, _>("table_name");
                ExplorerNode {
                    id: format!("{active_schema}.{table_name}"),
                    family: "sql".into(),
                    label: table_name.clone(),
                    kind: row.get::<String, _>("table_type").to_lowercase(),
                    detail: "Columns and row estimates".into(),
                    scope: Some(format!("table:{active_schema}.{table_name}")),
                    path: Some(vec![connection.name.clone(), active_schema.clone()]),
                    query_template: Some(mysql_select_template(&active_schema, &table_name)),
                    expandable: Some(true),
                }
            })
            .collect()
    } else {
        vec![ExplorerNode {
            id: format!("schema-{active_schema}"),
            family: "sql".into(),
            label: active_schema.clone(),
            kind: "schema".into(),
            detail: format!("{engine} default schema"),
            scope: Some(format!("schema:{active_schema}")),
            path: Some(vec![connection.name.clone()]),
            query_template: Some(format!(
                "select table_name from information_schema.tables where table_schema = '{}' order by table_name;",
                sql_literal(&active_schema)
            )),
            expandable: Some(true),
        }]
    };
    pool.close().await;

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: sql_capabilities(false, false),
        nodes,
    })
}

pub(super) fn inspect_mysql_explorer_node(
    engine: &str,
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .split_once('.')
        .map(|(schema, table)| mysql_select_template(schema, table))
        .unwrap_or_else(|| "select 1;".into());

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Inspection ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "nodeId": request.node_id,
            "engine": engine,
        })),
    }
}

pub(crate) fn mysql_select_template(schema: &str, table: &str) -> String {
    format!(
        "select * from {}.{} limit 100;",
        mysql_quote_identifier(schema),
        mysql_quote_identifier(table)
    )
}

fn mysql_quote_identifier(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}

#[cfg(test)]
mod tests {
    use super::mysql_select_template;

    #[test]
    fn mysql_select_template_qualifies_and_escapes_identifiers() {
        assert_eq!(
            mysql_select_template("sales", "orders"),
            "select * from `sales`.`orders` limit 100;"
        );
        assert_eq!(
            mysql_select_template("odd`schema", "odd`table"),
            "select * from `odd``schema`.`odd``table` limit 100;"
        );
    }
}
