use crate::domain::models::{ExplorerNode, ResolvedConnectionProfile};

use super::super::spec::BetaAdapterSpec;

mod node;
mod root;
mod sections;

use root::beta_root_nodes;
use sections::beta_section_nodes;

pub(crate) fn beta_explorer_nodes(
    spec: &BetaAdapterSpec,
    connection: &ResolvedConnectionProfile,
    scope: Option<&str>,
) -> Vec<ExplorerNode> {
    if let Some(scope) = scope {
        let section = scope.strip_prefix("beta:").unwrap_or(scope);
        return beta_section_nodes(spec, connection, section);
    }

    beta_root_nodes(spec, connection)
}
