use crate::domain::models::{ExplorerNode, ResolvedConnectionProfile};

use super::super::super::spec::BetaAdapterSpec;

#[allow(clippy::too_many_arguments)]
pub(crate) fn beta_node(
    spec: &BetaAdapterSpec,
    connection: &ResolvedConnectionProfile,
    id: &str,
    label: &str,
    kind: &str,
    detail: &str,
    scope: Option<&str>,
    query_template: Option<String>,
) -> ExplorerNode {
    ExplorerNode {
        id: format!("{}:{id}", spec.engine),
        family: spec.family.into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: scope.map(str::to_string),
        path: Some(vec![connection.name.clone(), spec.label.into()]),
        query_template,
        expandable: Some(scope.is_some()),
    }
}
