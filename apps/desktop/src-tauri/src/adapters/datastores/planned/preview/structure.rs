use serde_json::json;

use crate::domain::models::{
    ResolvedConnectionProfile, StructureEdge, StructureGroup, StructureMetric, StructureNode,
    StructureRequest, StructureResponse,
};

use super::super::spec::BetaAdapterSpec;
use super::util::{default_beta_query, spec_has};

pub(crate) fn beta_structure_response(
    spec: &BetaAdapterSpec,
    connection: &ResolvedConnectionProfile,
    request: &StructureRequest,
) -> StructureResponse {
    let groups = vec![
        StructureGroup {
            id: "objects".into(),
            label: "Objects".into(),
            kind: "objects".into(),
            detail: Some("Engine-native metadata surface".into()),
            color: Some("#0f766e".into()),
        },
        StructureGroup {
            id: "security".into(),
            label: "Security".into(),
            kind: "security".into(),
            detail: Some("Roles, grants, ACLs, and IAM signals".into()),
            color: Some("#7c3aed".into()),
        },
        StructureGroup {
            id: "diagnostics".into(),
            label: "Diagnostics".into(),
            kind: "diagnostics".into(),
            detail: Some("Plans, profiles, metrics, and costs".into()),
            color: Some("#b45309".into()),
        },
    ];
    let nodes = vec![
        StructureNode {
            id: format!("{}:objects", spec.engine),
            family: spec.family.into(),
            label: format!("{} objects", spec.label),
            kind: "objects".into(),
            group_id: Some("objects".into()),
            detail: Some("Explorer root and metadata request builders are registered.".into()),
            metrics: vec![StructureMetric {
                label: "Capabilities".into(),
                value: spec.capabilities.len().to_string(),
            }],
            fields: Vec::new(),
            sample: Some(json!({ "queryTemplate": default_beta_query(spec) })),
        },
        StructureNode {
            id: format!("{}:security", spec.engine),
            family: spec.family.into(),
            label: "Effective permissions".into(),
            kind: "security".into(),
            group_id: Some("security".into()),
            detail: Some("Permission inspection and disabled reasons are available.".into()),
            metrics: Vec::new(),
            fields: Vec::new(),
            sample: Some(json!({
                "readOnly": connection.read_only,
                "cloudIam": spec_has(spec, "supports_cloud_iam")
            })),
        },
        StructureNode {
            id: format!("{}:diagnostics", spec.engine),
            family: spec.family.into(),
            label: "Diagnostics".into(),
            kind: "diagnostics".into(),
            group_id: Some("diagnostics".into()),
            detail: Some("Normalized diagnostic payloads are wired for dashboards.".into()),
            metrics: Vec::new(),
            fields: Vec::new(),
            sample: Some(json!({
                "plans": spec_has(spec, "supports_explain_plan"),
                "profiles": spec_has(spec, "supports_query_profile"),
                "metrics": spec_has(spec, "supports_metrics_collection")
            })),
        },
    ];

    StructureResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        engine: spec.engine.into(),
        summary: format!(
            "{} beta structure map contains {} node(s).",
            spec.label,
            nodes.len()
        ),
        groups,
        nodes,
        edges: vec![
            StructureEdge {
                id: format!("{}:objects-security", spec.engine),
                from: format!("{}:objects", spec.engine),
                to: format!("{}:security", spec.engine),
                label: "permission-aware".into(),
                kind: "permission".into(),
                inferred: Some(true),
            },
            StructureEdge {
                id: format!("{}:objects-diagnostics", spec.engine),
                from: format!("{}:objects", spec.engine),
                to: format!("{}:diagnostics", spec.engine),
                label: "observable".into(),
                kind: "diagnostic".into(),
                inferred: Some(true),
            },
        ],
        metrics: vec![
            StructureMetric {
                label: "Maturity".into(),
                value: "beta".into(),
            },
            StructureMetric {
                label: "Default language".into(),
                value: spec.default_language.into(),
            },
        ],
        truncated: Some(false),
        next_cursor: None,
    }
}
