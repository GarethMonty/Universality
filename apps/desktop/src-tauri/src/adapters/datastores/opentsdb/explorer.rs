use serde_json::{json, Value};

use super::super::super::*;
use super::catalog::opentsdb_execution_capabilities;
use super::connection::{opentsdb_get, opentsdb_suggest_path};

pub(super) async fn list_opentsdb_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let nodes = match request.scope.as_deref() {
        Some("opentsdb:metrics") => suggest_nodes(connection, "metrics", request.limit).await?,
        Some("opentsdb:tagk") => suggest_nodes(connection, "tagk", request.limit).await?,
        Some("opentsdb:tagv") => suggest_nodes(connection, "tagv", request.limit).await?,
        Some("opentsdb:stats") => stats_nodes(connection).await?,
        Some(_) => Vec::new(),
        None => root_nodes(connection),
    };

    Ok(ExplorerResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        scope: request.scope.clone(),
        summary: format!(
            "Loaded {} OpenTSDB explorer node(s) for {}.",
            nodes.len(),
            connection.name
        ),
        capabilities: opentsdb_execution_capabilities(),
        nodes,
    })
}

pub(super) fn inspect_opentsdb_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> ExplorerInspectResponse {
    let metric = request
        .node_id
        .strip_prefix("opentsdb-metric:")
        .unwrap_or("sys.cpu.user");
    let query_template = json!({
        "start": "1h-ago",
        "queries": [
            {
                "aggregator": "avg",
                "metric": metric,
                "downsample": "1m-avg"
            }
        ]
    });

    ExplorerInspectResponse {
        node_id: request.node_id.clone(),
        summary: format!(
            "OpenTSDB query template ready for {} on {}.",
            request.node_id, connection.name
        ),
        query_template: Some(serde_json::to_string_pretty(&query_template).unwrap_or_default()),
        payload: Some(json!({
            "engine": "opentsdb",
            "nodeId": request.node_id,
            "api": ["/api/query", "/api/suggest", "/api/stats", "/api/version"]
        })),
    }
}

fn root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "opentsdb-metrics",
            "Metrics",
            "metrics",
            "Suggested metric names for query builders",
            "opentsdb:metrics",
        ),
        (
            "opentsdb-tag-keys",
            "Tag Keys",
            "tagk",
            "Suggested tag keys",
            "opentsdb:tagk",
        ),
        (
            "opentsdb-tag-values",
            "Tag Values",
            "tagv",
            "Suggested tag values",
            "opentsdb:tagv",
        ),
        (
            "opentsdb-stats",
            "Stats",
            "stats",
            "OpenTSDB API and storage diagnostic counters",
            "opentsdb:stats",
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, scope)| ExplorerNode {
        id: id.into(),
        family: "timeseries".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: Some(scope.into()),
        path: Some(vec![connection.name.clone(), "OpenTSDB".into()]),
        query_template: Some(default_query_template("sys.cpu.user")),
        expandable: Some(true),
    })
    .collect()
}

async fn suggest_nodes(
    connection: &ResolvedConnectionProfile,
    kind: &str,
    limit: Option<u32>,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let limit = bounded_page_size(limit.or(Some(100)));
    let response = opentsdb_get(connection, &opentsdb_suggest_path(kind, limit)).await?;
    let values: Value = serde_json::from_str(&response.body).map_err(|error| {
        CommandError::new(
            "opentsdb-json-invalid",
            format!("OpenTSDB returned invalid JSON: {error}"),
        )
    })?;
    Ok(values
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(|value| ExplorerNode {
            id: format!("opentsdb-{kind}:{value}"),
            family: "timeseries".into(),
            label: value.into(),
            kind: kind.into(),
            detail: format!("OpenTSDB suggested {kind}"),
            scope: None,
            path: Some(vec![connection.name.clone(), kind.into()]),
            query_template: Some(default_query_template(value)),
            expandable: Some(false),
        })
        .collect())
}

async fn stats_nodes(
    connection: &ResolvedConnectionProfile,
) -> Result<Vec<ExplorerNode>, CommandError> {
    let response = opentsdb_get(connection, "/api/stats").await?;
    let values: Value = serde_json::from_str(&response.body).unwrap_or_else(|_| json!([]));
    Ok(values
        .as_array()
        .into_iter()
        .flatten()
        .take(100)
        .enumerate()
        .map(|(index, value)| ExplorerNode {
            id: format!("opentsdb-stat:{index}"),
            family: "timeseries".into(),
            label: value
                .get("metric")
                .and_then(Value::as_str)
                .unwrap_or("stat")
                .into(),
            kind: "stat".into(),
            detail: value.get("value").map(Value::to_string).unwrap_or_default(),
            scope: None,
            path: Some(vec![connection.name.clone(), "Stats".into()]),
            query_template: None,
            expandable: Some(false),
        })
        .collect())
}

pub(crate) fn default_query_template(metric: &str) -> String {
    serde_json::to_string_pretty(&json!({
        "start": "1h-ago",
        "queries": [
            {
                "aggregator": "avg",
                "metric": metric,
                "downsample": "1m-avg"
            }
        ]
    }))
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::default_query_template;

    #[test]
    fn opentsdb_default_query_template_uses_metric() {
        let template = default_query_template("sys.cpu.user");
        assert!(template.contains("\"metric\": \"sys.cpu.user\""));
        assert!(template.contains("\"aggregator\": \"avg\""));
    }
}
