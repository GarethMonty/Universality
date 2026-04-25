use serde_json::{json, Value};

use super::super::super::*;
use super::connection::dynamodb_call;

pub(super) async fn collect_dynamodb_diagnostics(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    scope: Option<&str>,
) -> Result<AdapterDiagnostics, CommandError> {
    let mut diagnostics = default_adapter_diagnostics(connection, manifest, scope);
    let tables = optional_dynamodb_call(connection, "ListTables", &json!({})).await;

    diagnostics.metrics.push(payload_metrics(json!([
        {
            "name": "dynamodb.api.reachable",
            "value": if tables.is_some() { 1 } else { 0 },
            "unit": "flag",
            "labels": { "source": "ListTables" }
        },
        {
            "name": "dynamodb.tables.count",
            "value": table_count(tables.as_ref()),
            "unit": "tables",
            "labels": { "source": "ListTables" }
        }
    ])));
    diagnostics.cost_estimates.push(payload_cost_estimate(json!({
        "engine": "dynamodb",
        "basis": "ConsumedCapacity is returned when DynamoDB requests include ReturnConsumedCapacity.",
        "liveCosting": false
    })));
    diagnostics.query_history.push(payload_json(json!({
        "engine": "dynamodb",
        "templates": [
            { "operation": "ListTables" },
            { "operation": "DescribeTable", "tableName": "TableName" },
            { "operation": "Query", "tableName": "TableName", "keyConditionExpression": "#pk = :pk" },
            { "operation": "Scan", "tableName": "TableName", "limit": 100 }
        ],
        "tables": tables,
    })));
    diagnostics.warnings.push(
        "DynamoDB Scan can consume significant capacity; use key-condition Query, limits, and ReturnConsumedCapacity before dashboarding."
            .into(),
    );
    Ok(diagnostics)
}

async fn optional_dynamodb_call(
    connection: &ResolvedConnectionProfile,
    operation: &str,
    body: &Value,
) -> Option<Value> {
    dynamodb_call(connection, operation, body).await.ok()
}

pub(crate) fn table_count(value: Option<&Value>) -> usize {
    value
        .and_then(|value| value.get("TableNames"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::table_count;

    #[test]
    fn dynamodb_table_count_reads_list_tables_shape() {
        let value = json!({ "TableNames": ["Orders", "Users"] });

        assert_eq!(table_count(Some(&value)), 2);
        assert_eq!(table_count(None), 0);
    }
}
