use tauri::State;

use crate::{
    app::runtime::{ManagedAppState, SharedAppState},
    domain::{
        error::CommandError,
        models::{
            BootstrapPayload, CancelExecutionRequest, CancelExecutionResult, ConnectionProfile,
            ConnectionTestRequest, ConnectionTestResult, EnvironmentProfile, ExecutionRequest,
            ExecutionResponse, ExplorerInspectRequest, ExplorerInspectResponse, ExplorerRequest,
            ExplorerResponse, ExportBundle, SavedWorkItem, UpdateUiStateRequest,
        },
    },
};

fn clone_runtime(state: &State<'_, SharedAppState>) -> ManagedAppState {
    let state = state.lock().unwrap();
    ManagedAppState {
        app: state.app.clone(),
        snapshot: state.snapshot.clone(),
    }
}

fn replace_runtime(state: &State<'_, SharedAppState>, runtime: ManagedAppState) {
    let mut state = state.lock().unwrap();
    state.snapshot = runtime.snapshot;
}

#[tauri::command]
pub fn set_active_connection(
    state: State<'_, SharedAppState>,
    connection_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.set_active_connection(&connection_id)
}

#[tauri::command]
pub fn set_active_tab(
    state: State<'_, SharedAppState>,
    tab_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.set_active_tab(&tab_id)
}

#[tauri::command]
pub fn upsert_connection_profile(
    state: State<'_, SharedAppState>,
    profile: ConnectionProfile,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.upsert_connection(profile)
}

#[tauri::command]
pub fn upsert_environment_profile(
    state: State<'_, SharedAppState>,
    profile: EnvironmentProfile,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.upsert_environment(profile)
}

#[tauri::command]
pub fn create_query_tab(
    state: State<'_, SharedAppState>,
    connection_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.create_query_tab(&connection_id)
}

#[tauri::command]
pub fn update_query_tab(
    state: State<'_, SharedAppState>,
    tab_id: String,
    query_text: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.update_query_tab(&tab_id, &query_text)
}

#[tauri::command]
pub fn upsert_saved_work_item(
    state: State<'_, SharedAppState>,
    item: SavedWorkItem,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.upsert_saved_work(item)
}

#[tauri::command]
pub fn delete_saved_work_item(
    state: State<'_, SharedAppState>,
    saved_work_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.delete_saved_work(&saved_work_id)
}

#[tauri::command]
pub fn open_saved_work_item(
    state: State<'_, SharedAppState>,
    saved_work_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.open_saved_work(&saved_work_id)
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, SharedAppState>,
    request: ConnectionTestRequest,
) -> Result<ConnectionTestResult, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.test_connection(request).await
}

#[tauri::command]
pub async fn list_explorer_nodes(
    state: State<'_, SharedAppState>,
    request: ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    let mut runtime = clone_runtime(&state);
    let response = runtime.list_explorer_nodes(request).await?;
    replace_runtime(&state, runtime);
    Ok(response)
}

#[tauri::command]
pub async fn inspect_explorer_node(
    state: State<'_, SharedAppState>,
    request: ExplorerInspectRequest,
) -> Result<ExplorerInspectResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.inspect_explorer_node(request).await
}

#[tauri::command]
pub async fn execute_query_request(
    state: State<'_, SharedAppState>,
    request: ExecutionRequest,
) -> Result<ExecutionResponse, CommandError> {
    let mut runtime = clone_runtime(&state);
    let response = runtime.execute_query(request).await?;
    replace_runtime(&state, runtime);
    Ok(response)
}

#[tauri::command]
pub async fn cancel_execution_request(
    state: State<'_, SharedAppState>,
    request: CancelExecutionRequest,
) -> Result<CancelExecutionResult, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.cancel_execution(request).await
}

#[tauri::command]
pub fn set_theme(
    state: State<'_, SharedAppState>,
    theme: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.set_theme(&theme)
}

#[tauri::command]
pub fn set_ui_state(
    state: State<'_, SharedAppState>,
    patch: UpdateUiStateRequest,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.set_ui_state(patch)
}

#[tauri::command]
pub fn lock_app(state: State<'_, SharedAppState>) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.set_locked(true)
}

#[tauri::command]
pub fn unlock_app(state: State<'_, SharedAppState>) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.set_locked(false)
}

#[tauri::command]
pub fn export_workspace_bundle(
    state: State<'_, SharedAppState>,
    passphrase: String,
) -> Result<ExportBundle, CommandError> {
    let state = state.lock().unwrap();
    state.export_bundle(&passphrase)
}

#[tauri::command]
pub fn import_workspace_bundle(
    state: State<'_, SharedAppState>,
    passphrase: String,
    encrypted_payload: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.import_bundle(&passphrase, &encrypted_payload)
}
