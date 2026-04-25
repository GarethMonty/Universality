use serde_json::{json, Value};

use super::super::super::*;
use super::catalog::dynamodb_execution_capabilities;
use super::connection::dynamodb_call;

pub(super) async fn list_dynamodb_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("dynamodb:tables") => table_nodes(connection, request.limit).await?,
        Some(scope) if scope.starts_with("dynamodb:table:") => {
            table_child_nodes(connection, scope).await?
        }
        Some("dynamodb:diagnostics") => diagnostics_nodes(connection),
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} DynamoDB explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: dynamodb_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_dynamodb_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .strip_prefix("dynamodb-table:")
        .map(dynamodb_scan_template)
        .or_else(|| {
            request
                .node_id
                .strip_prefix("dynamodb-index:")
                .and_then(|rest| rest.split_once(':'))
                .map(|(table, index)| dynamodb_query_index_template(table, index))
        })
        .unwrap_or_else(|| match request.node_id.as_str() {
            "dynamodb-tables" => json!({ "operation": "ListTables" }).to_string(),
            "dynamodb-diagnostics" => {
                json!({ "operation": "ListTables", "Limit": 100 }).to_string()
            }
            _ => json!({ "operation": "ListTables" }).to_string(),
        });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "DynamoDB JSON request template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "dynamodb",
            "nodeId": request.node_id,
            "api": ["ListTables", "DescribeTable", "GetItem", "Query", "Scan"]
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "dynamodb-tables",
            "Tables",
            "tables",
            "DynamoDB tables and key schemas",
            "dynamodb:tables",
            json!({ "operation": "ListTables" }).to_string(),
        ),
        (
            "dynamodb-diagnostics",
            "Diagnostics",
            "diagnostics",
            "Consumed capacity, table count, and local endpoint checks",
            "dynamodb:diagnostics",
            json!({ "operation": "ListTables", "Limit": 100 }).to_string(),
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
        path: Some(vec![connection.name.clone(), "DynamoDB".into()]),
        query_template: Some(query),
        expandable: Some(true),
    })
    .collect()
}

async fn table_nodes(
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let value = dynamodb_call(connection, "ListTables", &json!({})).await?;
    let limit = bounded_page_size(limit.or(Some(100))) as usize;
    Ok(value
        .get("TableNames")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(limit)
        .filter_map(Value::as_str)
        .map(|name| ExplorerNode {
            id: format!("dynamodb-table:{name}"),
            family: "widecolumn".into(),
            label: name.into(),
            kind: "table".into(),
            detail: "DynamoDB table".into(),
            scope: Some(format!("dynamodb:table:{name}")),
            path: Some(vec![connection.name.clone(), "Tables".into()]),
            query_template: Some(dynamodb_scan_template(name)),
            expandable: Some(true),
        })
        .collect())
}

async fn table_child_nodes(
    connection: &ResolvedConnectionProfile,
    scope: &str,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let table = scope.trim_start_matches("dynamodb:table:");
    let value = dynamodb_call(connection, "DescribeTable", &json!({ "TableName": table })).await?;
    let mut nodes = vec![ExplorerNode {
        id: format!("dynamodb-key-schema:{table}"),
        family: "widecolumn".into(),
        label: "Key Schema".into(),
        kind: "key-schema".into(),
        detail: "Partition and sort key definition".into(),
        scope: None,
        path: Some(vec![connection.name.clone(), table.into()]),
        query_template: Some(dynamodb_describe_template(table)),
        expandable: Some(false),
    }];
    nodes.extend(index_nodes(
        connection,
        table,
        &value,
        "GlobalSecondaryIndexes",
    ));
    nodes.extend(index_nodes(
        connection,
        table,
        &value,
        "LocalSecondaryIndexes",
    ));
    Ok(nodes)
}

fn diagnostics_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    vec![ExplorerNode {
        id: "dynamodb-list-tables-diagnostic".into(),
        family: "widecolumn".into(),
        label: "List Tables".into(),
        kind: "diagnostic".into(),
        detail: "Baseline connectivity and table count check".into(),
        scope: None,
        path: Some(vec![connection.name.clone(), "Diagnostics".into()]),
        query_template: Some(json!({ "operation": "ListTables", "Limit": 100 }).to_string()),
        expandable: Some(false),
    }]
}

fn index_nodes(
    connection: &ResolvedConnectionProfile,
    table: &str,
    value: &Value,
    index_field: &str,
) -> Vec<ExplorerNode> {
    value
        .pointer(&format!("/Table/{index_field}"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|index| index.get("IndexName").and_then(Value::as_str))
        .map(|index| ExplorerNode {
            id: format!("dynamodb-index:{table}:{index}"),
            family: "widecolumn".into(),
            label: index.into(),
            kind: "index".into(),
            detail: format!("DynamoDB {index_field}"),
            scope: None,
            path: Some(vec![
                connection.name.clone(),
                table.into(),
                "Indexes".into(),
            ]),
            query_template: Some(dynamodb_query_index_template(table, index)),
            expandable: Some(false),
        })
        .collect()
}

fn dynamodb_scan_template(table: &str) -> String {
    json!({
        "operation": "Scan",
        "tableName": table,
        "limit": 100
    })
    .to_string()
}

fn dynamodb_describe_template(table: &str) -> String {
    json!({
        "operation": "DescribeTable",
        "tableName": table
    })
    .to_string()
}

fn dynamodb_query_index_template(table: &str, index: &str) -> String {
    json!({
        "operation": "Query",
        "tableName": table,
        "indexName": index,
        "keyConditionExpression": "#pk = :pk",
        "expressionAttributeNames": { "#pk": "partitionKey" },
        "expressionAttributeValues": { ":pk": { "S": "value" } },
        "limit": 100
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::{dynamodb_query_index_template, dynamodb_scan_template};

    #[test]
    fn dynamodb_scan_template_targets_table() {
        let value: serde_json::Value =
            serde_json::from_str(&dynamodb_scan_template("Orders")).unwrap();
        assert_eq!(value["operation"], "Scan");
        assert_eq!(value["tableName"], "Orders");
    }

    #[test]
    fn dynamodb_index_template_sets_index_name() {
        let value: serde_json::Value =
            serde_json::from_str(&dynamodb_query_index_template("Orders", "ByCustomer")).unwrap();
        assert_eq!(value["operation"], "Query");
        assert_eq!(value["indexName"], "ByCustomer");
    }
}
