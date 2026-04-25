use crate::domain::models::{ExplorerNode, ResolvedConnectionProfile};

use super::super::super::spec::BetaAdapterSpec;
use super::super::util::{default_beta_query, spec_has};
use super::node::beta_node;

pub(crate) fn beta_root_nodes(
    spec: &BetaAdapterSpec,
    connection: &ResolvedConnectionProfile,
) -> Vec<ExplorerNode> {
    let mut nodes = vec![
        beta_node(
            spec,
            connection,
            "beta-objects",
            "Explore",
            "objects",
            "Metadata explorer and native object hierarchy",
            Some("beta:objects"),
            Some(default_beta_query(spec)),
        ),
        beta_node(
            spec,
            connection,
            "beta-query",
            "Query",
            "query",
            "Native editor, visual-builder output, and normalized results",
            None,
            Some(default_beta_query(spec)),
        ),
        beta_node(
            spec,
            connection,
            "beta-security",
            "Security",
            "security",
            "Roles, grants, ACLs, IAM signals, and disabled reasons",
            Some("beta:security"),
            None,
        ),
        beta_node(
            spec,
            connection,
            "beta-diagnostics",
            "Diagnostics",
            "diagnostics",
            "Plans, profiles, metrics, query history, and chartable analytics",
            Some("beta:diagnostics"),
            None,
        ),
        beta_node(
            spec,
            connection,
            "beta-import-export",
            "Import/Export",
            "import-export",
            "Bulk import/export operation planning",
            Some("beta:import-export"),
            None,
        ),
    ];

    if spec_has(spec, "supports_backup_restore") {
        nodes.push(beta_node(
            spec,
            connection,
            "beta-backups",
            "Backups",
            "backups",
            "Backup and restore operation planning",
            Some("beta:backups"),
            None,
        ));
    }

    nodes
}
