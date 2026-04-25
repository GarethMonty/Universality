use crate::domain::models::AdapterManifest;

use super::super::super::*;

#[derive(Clone, Copy)]
pub(super) struct BetaAdapterSpec {
    pub(super) engine: &'static str,
    pub(super) family: &'static str,
    pub(super) label: &'static str,
    pub(super) default_language: &'static str,
    pub(super) capabilities: &'static [&'static str],
}

pub(super) fn beta_manifest(
    engine: &str,
    family: &str,
    label: &str,
    default_language: &str,
    capabilities: &[&str],
) -> AdapterManifest {
    manifest_with_maturity(
        &format!("adapter-{engine}"),
        engine,
        family,
        label,
        "beta",
        default_language,
        capabilities,
    )
}

pub(crate) fn beta_manifests() -> Vec<AdapterManifest> {
    beta_adapter_specs()
        .iter()
        .map(|spec| {
            beta_manifest(
                spec.engine,
                spec.family,
                spec.label,
                spec.default_language,
                spec.capabilities,
            )
        })
        .collect()
}

pub(super) fn beta_adapter_specs() -> &'static [BetaAdapterSpec] {
    &[]
}
