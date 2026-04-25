use serde_json::json;

use super::super::super::*;
use super::catalog::clickhouse_execution_capabilities;
use super::connection::clickhouse_query;

pub(super) fn clickhouse_tsv_nodes(
    connection: &ResolvedConnectionProfile,
    family: &str,
    kind: &str,
    path: Vec<String>,
    raw: &str,
    map_line: impl Fn(&str) -> Option<ExplorerNode>,
) -> Vec<ExplorerNode> {
    raw.lines()
        .filter_map(|line| {
            let mut node = map_line(line)?;
            node.family = family.into();
            node.kind = kind.into();
            if node.path.is_none() {
                let mut node_path = vec![connection.name.clone()];
                node_path.extend(path.clone());
                node.path = Some(node_path);
            }
            Some(node)
        })
        .collect()
}

pub(super) async fn list_clickhouse_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = if let Some(scope) = request.scope.as_deref() {
        if let Some(database) = scope.strip_prefix("clickhouse:database:") {
            let query = format!(
                "SELECT name, engine FROM system.tables WHERE database = '{}' ORDER BY name FORMAT TSV",
                sql_literal(database)
            );
            let raw = clickhouse_query(connection, &query).await?;
            clickhouse_tsv_nodes(
                connection,
                "warehouse",
                "table",
                vec![database.into()],
                &raw,
                |line| {
                    let mut parts = line.split('\t');
                    let name = parts.next()?.to_string();
                    let engine = parts.next().unwrap_or("table").to_string();
                    Some(ExplorerNode {
                        id: format!("{database}.{name}"),
                        family: String::new(),
                        label: name.clone(),
                        kind: String::new(),
                        detail: engine,
                        scope: Some(format!("clickhouse:table:{database}.{name}")),
                        path: None,
                        query_template: Some(format!("SELECT * FROM {database}.{name} LIMIT 100")),
                        expandable: Some(true),
                    })
                },
            )
        } else if let Some(table) = scope.strip_prefix("clickhouse:table:") {
            let (database, table_name) = table.split_once('.').unwrap_or(("default", table));
            let query = format!(
                "SELECT name, type, default_kind FROM system.columns WHERE database = '{}' AND table = '{}' ORDER BY position FORMAT TSV",
                sql_literal(database),
                sql_literal(table_name)
            );
            let raw = clickhouse_query(connection, &query).await?;
            clickhouse_tsv_nodes(
                connection,
                "warehouse",
                "column",
                vec![database.into(), table_name.into()],
                &raw,
                |line| {
                    let mut parts = line.split('\t');
                    let name = parts.next()?.to_string();
                    let data_type = parts.next().unwrap_or("unknown").to_string();
                    let default_kind = parts.next().unwrap_or_default();
                    Some(ExplorerNode {
                        id: format!("{table}:{name}"),
                        family: String::new(),
                        label: name,
                        kind: String::new(),
                        detail: if default_kind.is_empty() {
                            data_type
                        } else {
                            format!("{data_type} ({default_kind})")
                        },
                        scope: None,
                        path: None,
                        query_template: None,
                        expandable: Some(false),
                    })
                },
            )
        } else {
            Vec::new()
        }
    } else {
        let raw = clickhouse_query(connection, "SHOW DATABASES FORMAT TSV").await?;
        clickhouse_tsv_nodes(
            connection,
            "warehouse",
            "database",
            Vec::new(),
            &raw,
            |line| {
                let database = line.trim();
                if database.is_empty() {
                    return None;
                }
                Some(ExplorerNode {
                    id: format!("clickhouse-database-{database}"),
                    family: String::new(),
                    label: database.into(),
                    kind: String::new(),
                    detail: "ClickHouse database".into(),
                    scope: Some(format!("clickhouse:database:{database}")),
                    path: None,
                    query_template: Some(format!(
                        "SELECT name, engine FROM system.tables WHERE database = '{database}' ORDER BY name"
                    )),
                    expandable: Some(true),
                })
            },
        )
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} ClickHouse explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: clickhouse_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_clickhouse_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = if request.node_id.contains('.') {
        format!("SELECT * FROM {} LIMIT 100 FORMAT JSON", request.node_id)
    } else {
        "SELECT database, name, engine FROM system.tables ORDER BY database, name FORMAT JSON"
            .into()
    };
    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "ClickHouse inspection query ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "clickhouse",
            "nodeId": request.node_id,
            "diagnostics": ["EXPLAIN", "system.query_log", "system.metrics"]
        })),
    }
}
