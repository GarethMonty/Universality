use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use crate::domain::{error::CommandError, models::WorkspaceSnapshot};

pub const SNAPSHOT_FORMAT: &str = "datanaut-pack-v1";
pub const LEGACY_SNAPSHOT_FORMAT: &str = "universality-pack-v1";
pub const SCHEMA_VERSION: u32 = 6;

pub fn workspace_file_path(app: &AppHandle) -> PathBuf {
    if let Some(override_dir) = env_value("DATANAUT_WORKSPACE_DIR", "UNIVERSALITY_WORKSPACE_DIR") {
        return PathBuf::from(override_dir).join("workspace.json");
    }

    let base_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("datanaut"));
    base_dir.join("workspace.json")
}

fn legacy_workspace_file_path() -> PathBuf {
    if let Ok(override_dir) = std::env::var("UNIVERSALITY_WORKSPACE_DIR") {
        return PathBuf::from(override_dir).join("workspace.json");
    }

    std::env::temp_dir()
        .join("universality")
        .join("workspace.json")
}

fn backup_file_path(app: &AppHandle) -> PathBuf {
    workspace_file_path(app).with_extension("json.bak")
}

pub fn load_snapshot(app: &AppHandle) -> Result<Option<WorkspaceSnapshot>, CommandError> {
    let path = workspace_file_path(app);
    if !path.exists() {
        let legacy_path = legacy_workspace_file_path();
        if legacy_path != path && legacy_path.exists() {
            return read_snapshot_with_backup(&legacy_path);
        }

        return Ok(None);
    }

    read_snapshot_with_backup(&path)
}

fn read_snapshot_with_backup(path: &PathBuf) -> Result<Option<WorkspaceSnapshot>, CommandError> {
    let content = fs::read_to_string(path)?;
    match serde_json::from_str::<WorkspaceSnapshot>(&content) {
        Ok(snapshot) => Ok(Some(snapshot)),
        Err(primary_error) => {
            let backup_path = path.with_extension("json.bak");
            if !backup_path.exists() {
                return Err(primary_error.into());
            }

            let backup_content = fs::read_to_string(backup_path)?;
            let snapshot = serde_json::from_str::<WorkspaceSnapshot>(&backup_content)?;
            Ok(Some(snapshot))
        }
    }
}

pub fn save_snapshot(app: &AppHandle, snapshot: &WorkspaceSnapshot) -> Result<(), CommandError> {
    let path = workspace_file_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let serialized = serde_json::to_string_pretty(snapshot)?;
    let temporary_path = path.with_extension("json.tmp");
    let backup_path = backup_file_path(app);

    fs::write(&temporary_path, serialized)?;

    if path.exists() {
        let _ = fs::copy(&path, &backup_path);
        fs::remove_file(&path)?;
    }

    fs::rename(temporary_path, path)?;
    Ok(())
}

fn env_value(primary: &str, legacy: &str) -> Option<String> {
    std::env::var(primary)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            std::env::var(legacy)
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
}
