use serde_json::{json, Value};

use super::super::super::*;
use super::catalog::influxdb_execution_capabilities;
use super::connection::{influxdb_database, influxdb_get, influxdb_query_path};
use super::query::parse_influxdb_json;

pub(super) async fn list_influxdb_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("influxdb:measurements") => {
            query_value_nodes(
                connection,
                request.limit,
                "SHOW MEASUREMENTS",
                "measurement",
            )
            .await?
        }
        Some("influxdb:retention-policies") => {
            query_value_nodes(
                connection,
                request.limit,
                "SHOW RETENTION POLICIES",
                "retention-policy",
            )
            .await?
        }
        Some("influxdb:field-keys") => {
            query_value_nodes(connection, request.limit, "SHOW FIELD KEYS", "field").await?
        }
        Some("influxdb:tag-keys") => {
            query_value_nodes(connection, request.limit, "SHOW TAG KEYS", "tag").await?
        }
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} InfluxDB explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: influxdb_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_influxdb_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let query_template = request
        .node_id
        .strip_prefix("influxdb-measurement:")
        .map(|measurement| {
            format!(
                "SELECT * FROM {} ORDER BY time DESC LIMIT 100",
                quote_influx_identifier(measurement)
            )
        })
        .unwrap_or_else(|| match request.node_id.as_str() {
            "influxdb-measurements" => "SHOW MEASUREMENTS".into(),
            "influxdb-retention-policies" => "SHOW RETENTION POLICIES".into(),
            "influxdb-field-keys" => "SHOW FIELD KEYS".into(),
            "influxdb-tag-keys" => "SHOW TAG KEYS".into(),
            _ => "SHOW MEASUREMENTS".into(),
        });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "InfluxQL template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(query_template),
        payload: Some(json!({
            "engine": "influxdb",
            "nodeId": request.node_id,
            "api": ["/ping", "/query"],
            "database": influxdb_database(connection)
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "influxdb-measurements",
            "Measurements",
            "measurements",
            "Time-series measurement names",
            "influxdb:measurements",
            "SHOW MEASUREMENTS",
        ),
        (
            "influxdb-retention-policies",
            "Retention Policies",
            "retention-policies",
            "Retention policy names and shard durations",
            "influxdb:retention-policies",
            "SHOW RETENTION POLICIES",
        ),
        (
            "influxdb-field-keys",
            "Field Keys",
            "field-keys",
            "Measurement field names and value types",
            "influxdb:field-keys",
            "SHOW FIELD KEYS",
        ),
        (
            "influxdb-tag-keys",
            "Tag Keys",
            "tag-keys",
            "Tag dimensions for filtering and grouping",
            "influxdb:tag-keys",
            "SHOW TAG KEYS",
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, scope, query)| ExplorerNode {
        id: id.into(),
        family: "timeseries".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: Some(scope.into()),
        path: Some(vec![connection.name.clone(), "InfluxDB".into()]),
        query_template: Some(query.into()),
        expandable: Some(true),
    })
    .collect()
}

async fn query_value_nodes(
    connection: &ResolvedConnectionProfile,
    limit: Option<u32>,
    query: &str,
    kind: &str,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let database = influxdb_database(connection);
    let response = influxdb_get(connection, &influxdb_query_path(&database, query)).await?;
    let value = parse_influxdb_json(&response.body)?;
    let limit = bounded_page_size(limit.or(Some(100))) as usize;

    Ok(first_column_values(&value)
        .into_iter()
        .take(limit)
        .map(|label| {
            let node_id = if kind == "measurement" {
                format!("influxdb-measurement:{label}")
            } else {
                format!("influxdb-{kind}:{label}")
            };
            ExplorerNode {
                id: node_id,
                family: "timeseries".into(),
                label: label.clone(),
                kind: kind.into(),
                detail: format!("InfluxDB {kind}"),
                scope: None,
                path: Some(vec![connection.name.clone(), kind.into()]),
                query_template: Some(if kind == "measurement" {
                    format!(
                        "SELECT * FROM {} ORDER BY time DESC LIMIT 100",
                        quote_influx_identifier(&label)
                    )
                } else {
                    query.into()
                }),
                expandable: Some(false),
            }
        })
        .collect())
}

pub(crate) fn first_column_values(value: &Value) -> Vec<String> {
    value
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|result| {
            result
                .get("series")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .flat_map(|series| {
            series
                .get("values")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(|row| row.as_array().and_then(|items| items.first()))
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| value.to_string())
        })
        .collect()
}

pub(crate) fn quote_influx_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\\\""))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{first_column_values, quote_influx_identifier};

    #[test]
    fn influxdb_first_column_values_reads_show_results() {
        let value = json!({
            "results": [{
                "series": [{
                    "columns": ["name"],
                    "values": [["cpu"], ["mem"]]
                }]
            }]
        });

        assert_eq!(first_column_values(&value), vec!["cpu", "mem"]);
    }

    #[test]
    fn influxdb_identifier_quote_escapes_quotes() {
        assert_eq!(quote_influx_identifier("cpu\"load"), "\"cpu\\\"load\"");
    }
}
