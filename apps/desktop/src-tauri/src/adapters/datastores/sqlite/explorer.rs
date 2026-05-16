use serde_json::json;
use sqlx::Row;

use super::super::super::*;
use super::connection::sqlite_pool;

pub(super) async fn list_sqlite_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let pool = sqlite_pool(connection).await?;
    let nodes = if let Some(scope) = &request.scope {
        if let Some(table) = scope.strip_prefix("table:") {
            let query = format!("pragma table_info('{}')", sql_literal(table));
            sqlx::query(&query)
                .fetch_all(&pool)
                .await?
                .into_iter()
                .map(|row| ExplorerNode {
                    id: format!("{table}:{}", row.get::<String, _>("name")),
                    family: "sql".into(),
                    label: row.get::<String, _>("name"),
                    kind: "column".into(),
                    detail: row.get::<String, _>("type"),
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
        let limit = bounded_page_size(request.limit.or(Some(100)));
        let query = format!(
            "select name, type from sqlite_master where type in ('table', 'view') and name not like 'sqlite_%' order by name limit {limit}"
        );
        sqlx::query(&query)
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| {
                let name = row.get::<String, _>("name");
                ExplorerNode {
                    id: name.clone(),
                    family: "sql".into(),
                    label: name.clone(),
                    kind: row.get::<String, _>("type"),
                    detail: "SQLite object".into(),
                    scope: Some(format!("table:{name}")),
                    path: Some(vec![connection.name.clone()]),
                    query_template: Some(sqlite_select_template(&name)),
                    expandable: Some(true),
                }
            })
            .collect()
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

pub(super) fn inspect_sqlite_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Inspection ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(sqlite_select_template(&request.node_id)),
        payload: Some(json!({
            "nodeId": request.node_id,
            "engine": connection.engine,
        })),
    }
}

pub(crate) fn sqlite_select_template(table: &str) -> String {
    format!(
        "select * from {}.{} limit 100;",
        sqlite_quote_identifier("main"),
        sqlite_quote_identifier(table)
    )
}

fn sqlite_quote_identifier(identifier: &str) -> String {
    format!("[{}]", identifier.replace(']', "]]"))
}

#[cfg(test)]
mod tests {
    use super::sqlite_select_template;

    #[test]
    fn sqlite_select_template_escapes_identifiers() {
        assert_eq!(
            sqlite_select_template("accounts"),
            "select * from [main].[accounts] limit 100;"
        );
        assert_eq!(
            sqlite_select_template("odd]table"),
            "select * from [main].[odd]]table] limit 100;"
        );
    }
}
