use std::collections::HashMap;

use super::timestamp_now;
use crate::domain::models::{EnvironmentProfile, ResolvedConnectionProfile, ResolvedEnvironment};

pub(super) fn interpolate_value(value: &str, variables: &HashMap<String, String>) -> String {
    variables
        .iter()
        .fold(value.to_string(), |current, (key, resolved)| {
            current.replace(&format!("${{{key}}}"), resolved)
        })
}

pub(super) fn build_resolution_warnings(
    profile: &ResolvedConnectionProfile,
    resolved_environment: &ResolvedEnvironment,
) -> Vec<String> {
    let mut warnings = Vec::new();

    if !resolved_environment.unresolved_keys.is_empty() {
        warnings.push("Some environment variables are unresolved.".into());
    }

    if has_unresolved_tokens(&profile.host)
        || profile
            .database
            .as_ref()
            .is_some_and(|value| has_unresolved_tokens(value))
    {
        warnings.push("Connection fields still contain unresolved placeholders.".into());
    }

    warnings
}

pub(super) fn has_unresolved_tokens(value: &str) -> bool {
    value.contains("${")
}

pub fn resolve_environment(
    environments: &[EnvironmentProfile],
    environment_id: &str,
) -> ResolvedEnvironment {
    let fallback = environments
        .first()
        .cloned()
        .unwrap_or_else(|| EnvironmentProfile {
            id: "environment-missing".into(),
            label: "Missing environment".into(),
            color: "#000000".into(),
            risk: "low".into(),
            inherits_from: None,
            variables: HashMap::new(),
            sensitive_keys: Vec::new(),
            requires_confirmation: false,
            safe_mode: false,
            exportable: true,
            created_at: timestamp_now(),
            updated_at: timestamp_now(),
        });
    let environment_map: HashMap<String, EnvironmentProfile> = environments
        .iter()
        .cloned()
        .map(|environment| (environment.id.clone(), environment))
        .collect();
    let mut resolved_chain = Vec::new();
    let mut visited = Vec::new();
    let mut current = environment_map.get(environment_id).cloned();

    while let Some(environment) = current {
        if visited.iter().any(|item| item == &environment.id) {
            break;
        }

        visited.push(environment.id.clone());
        current = environment
            .inherits_from
            .as_ref()
            .and_then(|parent| environment_map.get(parent))
            .cloned();
        resolved_chain.insert(0, environment);
    }

    let active_environment = environment_map
        .get(environment_id)
        .cloned()
        .unwrap_or(fallback);

    let mut variables = HashMap::new();
    let mut inherited_chain = Vec::new();
    let mut sensitive_keys = Vec::new();

    for environment in resolved_chain {
        inherited_chain.push(environment.label.clone());
        for (key, value) in environment.variables {
            variables.insert(key, value);
        }
        for key in environment.sensitive_keys {
            if !sensitive_keys.contains(&key) {
                sensitive_keys.push(key);
            }
        }
    }

    let unresolved_keys = variables
        .iter()
        .filter_map(|(key, value)| {
            if value.contains("${") {
                Some(key.clone())
            } else {
                None
            }
        })
        .collect();

    ResolvedEnvironment {
        environment_id: active_environment.id,
        label: active_environment.label,
        risk: active_environment.risk,
        variables,
        unresolved_keys,
        inherited_chain,
        sensitive_keys,
    }
}
