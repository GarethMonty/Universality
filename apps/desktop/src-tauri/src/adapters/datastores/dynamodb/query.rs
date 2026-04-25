use serde_json::{json, Map, Value};

use super::super::super::*;
use super::connection::dynamodb_call;
use super::DynamoDbAdapter;

const READ_OPERATIONS: &[&str] = &["ListTables", "DescribeTable", "GetItem", "Query", "Scan"];

pub(super) async fn execute_dynamodb_query(
    adapter: &DynamoDbAdapter,
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    let started = Instant::now();
    let query_text = selected_query(request).trim();
    if query_text.is_empty() {
        return Err(CommandError::new(
            "dynamodb-request-missing",
            "No DynamoDB JSON request was provided.",
        ));
    }

    let mut request_value: Value = serde_json::from_str(query_text).map_err(|error| {
        CommandError::new(
            "dynamodb-request-invalid",
            format!("DynamoDB requests must be JSON: {error}"),
        )
    })?;
    let operation = dynamodb_operation(&mut request_value)?;
    if !READ_OPERATIONS.contains(&operation.as_str()) {
        return Err(CommandError::new(
            "dynamodb-write-preview-only",
            format!(
                "DynamoDB operation `{operation}` is planned as a guarded operation preview; this adapter executes read and metadata operations only."
            ),
        ));
    }

    let row_limit = bounded_page_size(
        request
            .row_limit
            .or(Some(adapter.execution_capabilities().default_row_limit)),
    );
    let body = normalize_request_body(request_value, row_limit);
    let response = dynamodb_call(connection, &operation, &body).await?;
    let (columns, rows) = normalize_dynamodb_response(&operation, &response, row_limit);
    let row_count = rows.len() as u32;
    let payloads = vec![
        payload_table(columns, rows),
        payload_json(response.clone()),
        payload_raw(
            serde_json::to_string_pretty(&json!({
                "operation": operation,
                "body": body,
            }))
            .unwrap_or_else(|_| query_text.into()),
        ),
    ];
    let (default_renderer, renderer_modes_owned) = renderer_modes_for_payloads(&payloads);
    let renderer_modes = renderer_modes_owned
        .iter()
        .map(String::as_str)
        .collect::<Vec<&str>>();

    Ok(build_result(ResultEnvelopeInput {
        engine: &connection.engine,
        summary: format!("DynamoDB {operation} returned {row_count} row(s)."),
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

pub(crate) fn dynamodb_operation(value: &mut Value) -> Result<String, CommandError> {
    let object = value.as_object_mut().ok_or_else(|| {
        CommandError::new(
            "dynamodb-request-invalid",
            "DynamoDB request JSON must be an object with an `operation` field.",
        )
    })?;
    let operation = object
        .remove("operation")
        .or_else(|| object.remove("Operation"))
        .or_else(|| object.remove("action"))
        .or_else(|| object.remove("Action"))
        .and_then(|value| value.as_str().map(str::to_string))
        .ok_or_else(|| {
            CommandError::new(
                "dynamodb-operation-missing",
                "DynamoDB request JSON must include operation, such as ListTables, DescribeTable, Query, Scan, or GetItem.",
            )
        })?;
    Ok(normalize_operation_name(&operation))
}

pub(crate) fn normalize_request_body(value: Value, row_limit: u32) -> Value {
    let object = value.as_object().cloned().unwrap_or_default();
    let mut normalized = Map::new();
    for (key, value) in object {
        normalized.insert(normalize_request_key(&key), value);
    }
    if !normalized.contains_key("Limit") {
        normalized.insert("Limit".into(), json!(row_limit));
    }
    Value::Object(normalized)
}

pub(crate) fn normalize_dynamodb_response(
    operation: &str,
    response: &Value,
    row_limit: u32,
) -> (Vec<String>, Vec<Vec<String>>) {
    match operation {
        "ListTables" => {
            let rows = response
                .get("TableNames")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .take(row_limit as usize)
                .map(|name| vec![attribute_or_json_to_string(name)])
                .collect();
            (vec!["tableName".into()], rows)
        }
        "DescribeTable" => describe_table_rows(response),
        "GetItem" => {
            let item = response.get("Item").cloned().unwrap_or_else(|| json!({}));
            item_rows(&[item], row_limit)
        }
        "Query" | "Scan" => {
            let items = response
                .get("Items")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            item_rows(&items, row_limit)
        }
        _ => (vec!["value".into()], vec![vec![response.to_string()]]),
    }
}

fn item_rows(items: &[Value], row_limit: u32) -> (Vec<String>, Vec<Vec<String>>) {
    let mut columns = items
        .iter()
        .filter_map(Value::as_object)
        .flat_map(|item| item.keys().cloned())
        .collect::<Vec<_>>();
    columns.sort();
    columns.dedup();
    if columns.is_empty() {
        columns.push("value".into());
    }

    let rows = items
        .iter()
        .take(row_limit as usize)
        .map(|item| {
            if let Some(object) = item.as_object() {
                columns
                    .iter()
                    .map(|column| {
                        object
                            .get(column)
                            .map(attribute_or_json_to_string)
                            .unwrap_or_default()
                    })
                    .collect()
            } else {
                vec![attribute_or_json_to_string(item)]
            }
        })
        .collect();
    (columns, rows)
}

fn describe_table_rows(response: &Value) -> (Vec<String>, Vec<Vec<String>>) {
    let table = response.get("Table").unwrap_or(response);
    let table_name = table
        .get("TableName")
        .and_then(Value::as_str)
        .unwrap_or("table");
    let status = table
        .get("TableStatus")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let item_count = table
        .get("ItemCount")
        .map(attribute_or_json_to_string)
        .unwrap_or_default();
    let rows = vec![vec![table_name.into(), status.into(), item_count]];
    (
        vec!["tableName".into(), "status".into(), "itemCount".into()],
        rows,
    )
}

pub(crate) fn attribute_or_json_to_string(value: &Value) -> String {
    if let Some(object) = value.as_object() {
        for key in ["S", "N", "BOOL", "NULL", "SS", "NS", "BS", "M", "L"] {
            if let Some(inner) = object.get(key) {
                return match key {
                    "S" | "N" => inner.as_str().unwrap_or_default().to_string(),
                    "BOOL" => inner.as_bool().unwrap_or_default().to_string(),
                    "NULL" => "null".into(),
                    _ => inner.to_string(),
                };
            }
        }
    }
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn normalize_operation_name(value: &str) -> String {
    match value
        .to_ascii_lowercase()
        .replace(['_', '-', ' '], "")
        .as_str()
    {
        "listtables" => "ListTables",
        "describetable" => "DescribeTable",
        "getitem" => "GetItem",
        "query" => "Query",
        "scan" => "Scan",
        "putitem" => "PutItem",
        "updateitem" => "UpdateItem",
        "deleteitem" => "DeleteItem",
        "createtable" => "CreateTable",
        "deletetable" => "DeleteTable",
        other => other,
    }
    .into()
}

fn normalize_request_key(key: &str) -> String {
    match key {
        "tableName" => "TableName",
        "key" => "Key",
        "item" => "Item",
        "indexName" => "IndexName",
        "limit" => "Limit",
        "keyConditionExpression" => "KeyConditionExpression",
        "filterExpression" => "FilterExpression",
        "expressionAttributeNames" => "ExpressionAttributeNames",
        "expressionAttributeValues" => "ExpressionAttributeValues",
        "projectionExpression" => "ProjectionExpression",
        "exclusiveStartKey" => "ExclusiveStartKey",
        "consistentRead" => "ConsistentRead",
        _ => key,
    }
    .into()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        attribute_or_json_to_string, dynamodb_operation, normalize_dynamodb_response,
        normalize_request_body,
    };

    #[test]
    fn dynamodb_operation_reads_and_normalizes_action_field() {
        let mut value = json!({ "action": "list-tables" });
        assert_eq!(dynamodb_operation(&mut value).unwrap(), "ListTables");
    }

    #[test]
    fn dynamodb_request_body_normalizes_common_keys_and_limit() {
        let value = json!({ "tableName": "Orders", "keyConditionExpression": "pk = :pk" });
        let body = normalize_request_body(value, 25);

        assert_eq!(body["TableName"], "Orders");
        assert_eq!(body["KeyConditionExpression"], "pk = :pk");
        assert_eq!(body["Limit"], 25);
    }

    #[test]
    fn dynamodb_attribute_values_render_to_strings() {
        assert_eq!(attribute_or_json_to_string(&json!({ "S": "Ada" })), "Ada");
        assert_eq!(attribute_or_json_to_string(&json!({ "N": "42" })), "42");
        assert_eq!(
            attribute_or_json_to_string(&json!({ "BOOL": true })),
            "true"
        );
    }

    #[test]
    fn dynamodb_scan_response_normalizes_items_to_rows() {
        let value = json!({
            "Items": [
                { "pk": { "S": "order#1" }, "total": { "N": "10" } }
            ]
        });
        let (columns, rows) = normalize_dynamodb_response("Scan", &value, 100);

        assert_eq!(columns, vec!["pk", "total"]);
        assert_eq!(rows, vec![vec!["order#1", "10"]]);
    }
}
