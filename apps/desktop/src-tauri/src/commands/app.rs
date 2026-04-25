use tauri::State;

use crate::{
    app::runtime::SharedAppState,
    domain::{
        error::CommandError,
        health::AppHealth,
        models::{BootstrapPayload, DiagnosticsReport, SecretRef},
    },
    security,
};

#[tauri::command]
pub fn get_app_health(state: State<'_, SharedAppState>) -> AppHealth {
    let state = state.lock().unwrap();
    state.health()
}

#[tauri::command]
pub fn bootstrap_app(state: State<'_, SharedAppState>) -> Result<BootstrapPayload, CommandError> {
    let state = state.lock().unwrap();
    Ok(state.bootstrap_payload())
}

#[tauri::command]
pub fn create_diagnostics_report(
    state: State<'_, SharedAppState>,
) -> Result<DiagnosticsReport, CommandError> {
    let state = state.lock().unwrap();
    Ok(state.diagnostics())
}

#[tauri::command]
pub fn store_secret(
    state: State<'_, SharedAppState>,
    secret_ref: SecretRef,
    secret: String,
) -> Result<bool, CommandError> {
    let state = state.lock().unwrap();
    state.ensure_unlocked()?;
    security::store_secret_value(&secret_ref, &secret)?;
    Ok(true)
}
