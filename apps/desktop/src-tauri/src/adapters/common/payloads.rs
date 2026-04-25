use std::collections::BTreeMap;

use serde_json::{json, Value};

pub(crate) fn payload_table(columns: Vec<String>, rows: Vec<Vec<String>>) -> Value {
    json!({
        "renderer": "table",
        "columns": columns,
        "rows": rows,
    })
}

pub(crate) fn payload_json(value: Value) -> Value {
    json!({
        "renderer": "json",
        "value": value,
    })
}

pub(crate) fn payload_raw(text: String) -> Value {
    json!({
        "renderer": "raw",
        "text": text,
    })
}

pub(crate) fn payload_document(documents: Value) -> Value {
    json!({
        "renderer": "document",
        "documents": documents,
    })
}

pub(crate) fn payload_keyvalue(
    entries: BTreeMap<String, String>,
    ttl: Option<String>,
    memory: Option<String>,
) -> Value {
    json!({
        "renderer": "keyvalue",
        "entries": entries,
        "ttl": ttl,
        "memoryUsage": memory,
    })
}

pub(crate) fn payload_plan(format: &str, value: Value, summary: &str) -> Value {
    json!({
        "renderer": "plan",
        "format": format,
        "value": value,
        "summary": summary,
    })
}

pub(crate) fn payload_profile(summary: &str, stages: Value) -> Value {
    json!({
        "renderer": "profile",
        "summary": summary,
        "stages": stages,
    })
}

pub(crate) fn payload_metrics(metrics: Value) -> Value {
    json!({
        "renderer": "metrics",
        "metrics": metrics,
    })
}

pub(crate) fn payload_series(series: Value) -> Value {
    json!({
        "renderer": "series",
        "series": series,
    })
}

pub(crate) fn payload_search_hits(total: u64, hits: Value, aggregations: Value) -> Value {
    json!({
        "renderer": "searchHits",
        "total": total,
        "hits": hits,
        "aggregations": aggregations,
    })
}

pub(crate) fn payload_graph(nodes: Value, edges: Value) -> Value {
    json!({
        "renderer": "graph",
        "nodes": nodes,
        "edges": edges,
    })
}

pub(crate) fn payload_cost_estimate(details: Value) -> Value {
    json!({
        "renderer": "costEstimate",
        "currency": "USD",
        "estimatedBytes": 0,
        "estimatedCredits": 0,
        "estimatedCost": 0,
        "details": details,
    })
}
