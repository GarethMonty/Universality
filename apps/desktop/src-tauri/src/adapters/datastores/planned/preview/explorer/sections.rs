use crate::domain::models::{ExplorerNode, ResolvedConnectionProfile};

use super::super::super::spec::BetaAdapterSpec;
use super::node::beta_node;

pub(crate) fn beta_section_nodes(
    spec: &BetaAdapterSpec,
    connection: &ResolvedConnectionProfile,
    section: &str,
) -> Vec<ExplorerNode> {
    match section {
        "objects" => vec![
            beta_node(
                spec,
                connection,
                "objects-primary",
                "Objects",
                "object-group",
                "Engine-native databases, datasets, keyspaces, indices, buckets, or containers",
                None,
                None,
            ),
            beta_node(
                spec,
                connection,
                "objects-indexes",
                "Indexes",
                "index-group",
                "Indexes, mappings, materialized views, or access paths",
                None,
                None,
            ),
        ],
        "security" => vec![
            beta_node(
                spec,
                connection,
                "security-principal",
                "Effective principal",
                "principal",
                "Connected user, token, service account, or IAM identity",
                None,
                None,
            ),
            beta_node(
                spec,
                connection,
                "security-permissions",
                "Permissions",
                "permissions",
                "Roles, grants, ACLs, IAM bindings, or unavailable actions",
                None,
                None,
            ),
        ],
        "diagnostics" => vec![
            beta_node(
                spec,
                connection,
                "diagnostics-plan",
                "Plans and profiles",
                "diagnostic",
                "Explain/profile request builders and normalized payloads",
                None,
                None,
            ),
            beta_node(
                spec,
                connection,
                "diagnostics-metrics",
                "Metrics",
                "metrics",
                "Chart-ready metrics and time-series signals",
                None,
                None,
            ),
        ],
        "import-export" => vec![beta_node(
            spec,
            connection,
            "import-export-plan",
            "Import/export plan",
            "operation-plan",
            "Bulk movement operation preview and cost/scan warnings",
            None,
            None,
        )],
        "backups" => vec![
            beta_node(
                spec,
                connection,
                "backup-plan",
                "Backup plan",
                "operation-plan",
                "Backup workflow preview with required confirmation",
                None,
                None,
            ),
            beta_node(
                spec,
                connection,
                "restore-plan",
                "Restore plan",
                "operation-plan",
                "Restore workflow preview with destructive guardrails",
                None,
                None,
            ),
        ],
        _ => Vec::new(),
    }
}
