use super::catalog::FixtureConnectionSeed;

pub(super) fn fixture_port(env_key: &str, default: u16) -> u16 {
    fixture_env_value(env_key)
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(default)
}

pub(super) fn fixture_env_value(env_key: &str) -> Option<String> {
    std::env::var(env_key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            legacy_datanaut_env_key(env_key).and_then(|legacy_key| {
                std::env::var(legacy_key)
                    .ok()
                    .filter(|value| !value.trim().is_empty())
            })
        })
        .or_else(|| fixture_generated_env_value(env_key))
        .or_else(|| {
            legacy_datanaut_env_key(env_key)
                .and_then(|legacy_key| fixture_generated_env_value(&legacy_key))
        })
}

fn legacy_datanaut_env_key(env_key: &str) -> Option<String> {
    env_key
        .strip_prefix("DATANAUT_")
        .map(|suffix| format!("UNIVERSALITY_{suffix}"))
}

fn fixture_generated_env_value(env_key: &str) -> Option<String> {
    let current_dir = std::env::current_dir().ok();
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let roots = current_dir
        .iter()
        .flat_map(|path| path.ancestors().map(std::path::Path::to_path_buf))
        .chain(manifest_dir.ancestors().map(std::path::Path::to_path_buf));

    for root in roots {
        let path = root.join("tests").join("fixtures").join(".generated.env");
        let Ok(contents) = std::fs::read_to_string(path) else {
            continue;
        };

        for line in contents.lines() {
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };

            if key.trim() == env_key {
                return Some(value.trim().to_string());
            }
        }
    }

    None
}

pub(super) fn resolve_fixture_connection_string(
    value: &str,
    seed: &FixtureConnectionSeed,
) -> String {
    if value.contains("${") {
        return format!("http://{}:{}", seed.host, seed.port.unwrap_or_default());
    }

    value.to_string()
}
