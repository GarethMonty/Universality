use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::app::runtime::timestamp_now;

use super::super::super::super::*;
use super::super::spec::BetaAdapterSpec;

pub(crate) fn beta_result_payloads(
    spec: &BetaAdapterSpec,
    query_text: &str,
) -> (String, Vec<&'static str>, Vec<Value>) {
    let common_plan = payload_plan(
        "json",
        json!({
            "engine": spec.engine,
            "language": spec.default_language,
            "query": query_text,
            "status": "request-builder-preview"
        }),
        "Guarded beta adapter operation plan.",
    );

    match spec.family {
        "document" => (
            "document".into(),
            vec!["document", "json", "table", "plan"],
            vec![
                payload_document(json!([
                    {
                        "_id": "preview-1",
                        "engine": spec.engine,
                        "message": "Document payload normalization is ready for the live adapter."
                    }
                ])),
                payload_json(json!({ "engine": spec.engine, "query": query_text })),
                payload_table(
                    vec!["field".into(), "value".into()],
                    vec![vec!["engine".into(), spec.engine.into()], vec!["maturity".into(), "beta".into()]],
                ),
                common_plan,
            ],
        ),
        "keyvalue" => {
            let mut entries = BTreeMap::new();
            entries.insert("engine".into(), spec.engine.into());
            entries.insert("maturity".into(), "beta".into());
            (
                "keyvalue".into(),
                vec!["keyvalue", "json", "raw", "metrics"],
                vec![
                    payload_keyvalue(entries, None, None),
                    payload_json(json!({ "engine": spec.engine, "query": query_text })),
                    payload_raw(query_text.into()),
                    payload_metrics(json!([
                        { "name": "preview.keys", "value": 0, "unit": "keys", "labels": { "engine": spec.engine } }
                    ])),
                ],
            )
        }
        "graph" => (
            "graph".into(),
            vec!["graph", "table", "json", "plan"],
            vec![
                payload_graph(
                    json!([{ "id": "preview-node", "label": spec.label, "kind": spec.engine }]),
                    json!([]),
                ),
                payload_table(
                    vec!["node".into(), "kind".into()],
                    vec![vec![spec.label.into(), spec.engine.into()]],
                ),
                payload_json(json!({ "engine": spec.engine, "query": query_text })),
                common_plan,
            ],
        ),
        "timeseries" => (
            "series".into(),
            vec!["series", "chart", "table", "metrics", "json"],
            vec![
                payload_series(json!([
                    {
                        "name": format!("{}.preview", spec.engine),
                        "unit": "count",
                        "points": [
                            { "timestamp": timestamp_now(), "value": 0, "labels": { "engine": spec.engine } }
                        ]
                    }
                ])),
                payload_metrics(json!([
                    { "name": "preview.samples", "value": 0, "unit": "samples", "labels": { "engine": spec.engine } }
                ])),
                payload_json(json!({ "engine": spec.engine, "query": query_text })),
            ],
        ),
        "search" => (
            "searchHits".into(),
            vec!["searchHits", "json", "table", "plan", "profile", "metrics"],
            vec![
                payload_search_hits(
                    0,
                    json!([
                        {
                            "id": "preview-hit",
                            "score": 0,
                            "source": { "engine": spec.engine, "maturity": "beta" }
                        }
                    ]),
                    json!({ "preview": { "doc_count": 0 } }),
                ),
                common_plan,
                payload_metrics(json!([
                    { "name": "preview.hits", "value": 0, "unit": "hits", "labels": { "engine": spec.engine } }
                ])),
            ],
        ),
        "widecolumn" => (
            "table".into(),
            vec!["table", "json", "metrics", "profile"],
            vec![
                payload_table(
                    vec!["partition_key".into(), "engine".into(), "status".into()],
                    vec![vec!["preview".into(), spec.engine.into(), "request-builder-ready".into()]],
                ),
                payload_json(json!({ "engine": spec.engine, "query": query_text })),
                payload_metrics(json!([
                    { "name": "preview.capacity_units", "value": 0, "unit": "units", "labels": { "engine": spec.engine } }
                ])),
            ],
        ),
        "warehouse" | "embedded-olap" | "sql" => (
            "table".into(),
            vec!["table", "json", "plan", "profile", "metrics", "costEstimate"],
            vec![
                payload_table(
                    vec!["engine".into(), "language".into(), "status".into()],
                    vec![vec![spec.engine.into(), spec.default_language.into(), "request-builder-ready".into()]],
                ),
                common_plan,
                payload_profile(
                    "Profile payload normalization is available when the live engine returns stages.",
                    json!([{ "name": "preview", "durationMs": 0, "rows": 0 }]),
                ),
                payload_metrics(json!([
                    { "name": "preview.rows", "value": 0, "unit": "rows", "labels": { "engine": spec.engine } }
                ])),
                payload_cost_estimate(json!({ "engine": spec.engine, "dryRunRequired": true })),
            ],
        ),
        _ => (
            "raw".into(),
            vec!["raw", "json"],
            vec![payload_raw(query_text.into()), payload_json(json!({ "engine": spec.engine }))],
        ),
    }
}
