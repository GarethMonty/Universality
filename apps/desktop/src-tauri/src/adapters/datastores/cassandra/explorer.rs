use serde_json::json;

use super::super::super::*;
use super::catalog::cassandra_execution_capabilities;
use super::connection::cassandra_keyspace;

pub(super) async fn list_cassandra_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("cassandra:keyspaces") => keyspace_nodes(connection),
        Some(scope) if scope.starts_with("cassandra:keyspace:") => {
            keyspace_child_nodes(connection, scope)
        }
        Some("cassandra:security") => security_nodes(connection),
        Some("cassandra:diagnostics") => diagnostics_nodes(connection),
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} Cassandra explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: cassandra_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_cassandra_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let keyspace = cassandra_keyspace(connection);
    let query_template = request
        .node_id
        .strip_prefix("cassandra-table:")
        .and_then(|rest| rest.split_once(':'))
        .map(|(keyspace, table)| cassandra_table_query(keyspace, table))
        .unwrap_or_else(|| match request.node_id.as_str() {
            "cassandra-keyspaces" => "select keyspace_name from system_schema.keyspaces;".into(),
            "cassandra-security" => "list roles;".into(),
            "cassandra-diagnostics" => "select * from system.local;".into(),
            _ => format!("select * from system_schema.tables where keyspace_name = '{keyspace}';"),
        });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "Cassandra CQL template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "cassandra",
            "nodeId": request.node_id,
            "keyspace": keyspace,
            "metadata": ["system_schema.keyspaces", "system_schema.tables", "system_auth.roles"]
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "cassandra-keyspaces",
            "Keyspaces",
            "keyspaces",
            "Keyspaces, tables, types, indexes, and materialized views",
            "cassandra:keyspaces",
            "select keyspace_name from system_schema.keyspaces;",
        ),
        (
            "cassandra-security",
            "Security",
            "security",
            "Roles, grants, and permission inspection templates",
            "cassandra:security",
            "list roles;",
        ),
        (
            "cassandra-diagnostics",
            "Diagnostics",
            "diagnostics",
            "Local node, peers, tracing, compaction, and repair templates",
            "cassandra:diagnostics",
            "select * from system.local;",
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, scope, query)| ExplorerNode {
        id: id.into(),
        family: "widecolumn".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: Some(scope.into()),
        path: Some(vec![connection.name.clone(), "Cassandra".into()]),
        query_template: Some(query.into()),
        expandable: Some(true),
    })
    .collect()
}

fn keyspace_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    let keyspace = cassandra_keyspace(connection);
    vec![ExplorerNode {
        id: format!("cassandra-keyspace:{keyspace}"),
        family: "widecolumn".into(),
        label: keyspace.clone(),
        kind: "keyspace".into(),
        detail: "Configured keyspace placeholder".into(),
        scope: Some(format!("cassandra:keyspace:{keyspace}")),
        path: Some(vec![connection.name.clone(), "Keyspaces".into()]),
        query_template: Some(format!(
            "select table_name from system_schema.tables where keyspace_name = '{}';",
            sql_literal(&keyspace)
        )),
        expandable: Some(true),
    }]
}

fn keyspace_child_nodes(connection: &ResolvedConnectionProfile, scope: &str) -> Vec<ExplorerNode> {
    let keyspace = scope.trim_start_matches("cassandra:keyspace:");
    [
        (
            format!("cassandra-table:{keyspace}:table"),
            "Tables",
            "tables",
            "Partition-key-first base tables",
            cassandra_table_query(keyspace, "table"),
        ),
        (
            format!("cassandra-indexes:{keyspace}"),
            "Indexes",
            "indexes",
            "SAI/secondary indexes and index guidance",
            format!(
                "select * from system_schema.indexes where keyspace_name = '{}';",
                sql_literal(keyspace)
            ),
        ),
        (
            format!("cassandra-materialized-views:{keyspace}"),
            "Materialized Views",
            "materialized-views",
            "Materialized view metadata and refresh risk context",
            format!(
                "select * from system_schema.views where keyspace_name = '{}';",
                sql_literal(keyspace)
            ),
        ),
        (
            format!("cassandra-types:{keyspace}"),
            "Types",
            "types",
            "User-defined type metadata",
            format!(
                "select * from system_schema.types where keyspace_name = '{}';",
                sql_literal(keyspace)
            ),
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, query)| ExplorerNode {
        id,
        family: "widecolumn".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: None,
        path: Some(vec![connection.name.clone(), keyspace.into()]),
        query_template: Some(query),
        expandable: Some(false),
    })
    .collect()
}

fn security_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    vec![ExplorerNode {
        id: "cassandra-roles".into(),
        family: "widecolumn".into(),
        label: "Roles".into(),
        kind: "roles".into(),
        detail: "Role and grant inspection templates".into(),
        scope: None,
        path: Some(vec![connection.name.clone(), "Security".into()]),
        query_template: Some("list roles; list all permissions;".into()),
        expandable: Some(false),
    }]
}

fn diagnostics_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    vec![ExplorerNode {
        id: "cassandra-local-node".into(),
        family: "widecolumn".into(),
        label: "Local Node".into(),
        kind: "diagnostics".into(),
        detail: "system.local, peers, tracing, compaction, and repair templates".into(),
        scope: None,
        path: Some(vec![connection.name.clone(), "Diagnostics".into()]),
        query_template: Some(
            "select * from system.local; select * from system.peers; tracing on;".into(),
        ),
        expandable: Some(false),
    }]
}

pub(crate) fn cassandra_table_query(keyspace: &str, table: &str) -> String {
    format!(
        "select * from {}.{} where <partition_key> = ? limit 100;",
        quote_cql_identifier(keyspace),
        quote_cql_identifier(table)
    )
}

fn quote_cql_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

#[cfg(test)]
mod tests {
    use super::cassandra_table_query;

    #[test]
    fn cassandra_table_query_quotes_keyspace_and_table() {
        assert_eq!(
            cassandra_table_query("commerce", "orders"),
            "select * from \"commerce\".\"orders\" where <partition_key> = ? limit 100;"
        );
    }
}
