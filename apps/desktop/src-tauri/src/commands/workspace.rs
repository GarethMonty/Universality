use std::path::{Path, PathBuf};

use duckdb::Connection as DuckDbConnection;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::{
    app::runtime::{ManagedAppState, SharedAppState},
    domain::{
        error::CommandError,
        models::{
            AdapterDiagnosticsRequest, AdapterDiagnosticsResponse, BootstrapPayload,
            CancelExecutionRequest, CancelExecutionResult, ConnectionProfile,
            ConnectionTestRequest, ConnectionTestResult, CreateScopedQueryTabRequest,
            DataEditExecutionRequest, DataEditExecutionResponse, DataEditPlanRequest,
            DataEditPlanResponse, DatastoreExperienceResponse, EnvironmentProfile,
            ExecutionRequest, ExecutionResponse, ExplorerInspectRequest, ExplorerInspectResponse,
            ExplorerRequest, ExplorerResponse, ExportBundle, LocalDatabaseCreateRequest,
            LocalDatabaseCreateResult, LocalDatabasePickRequest, LocalDatabasePickResult,
            OperationExecutionRequest, OperationExecutionResponse, OperationManifestRequest,
            OperationManifestResponse, OperationPlanRequest, OperationPlanResponse,
            PermissionInspectionRequest, PermissionInspectionResponse, QueryTabReorderRequest,
            ResultPageRequest, ResultPageResponse, SavedWorkItem, StructureRequest,
            StructureResponse, UpdateQueryBuilderStateRequest, UpdateUiStateRequest,
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
pub fn set_tab_environment(
    state: State<'_, SharedAppState>,
    tab_id: String,
    environment_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.set_tab_environment(&tab_id, &environment_id)
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
pub fn delete_connection_profile(
    state: State<'_, SharedAppState>,
    connection_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.delete_connection(&connection_id)
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
pub fn create_scoped_query_tab(
    state: State<'_, SharedAppState>,
    request: CreateScopedQueryTabRequest,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.create_scoped_query_tab(request)
}

#[tauri::command]
pub fn close_query_tab(
    state: State<'_, SharedAppState>,
    tab_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.close_query_tab(&tab_id)
}

#[tauri::command]
pub fn reopen_closed_query_tab(
    state: State<'_, SharedAppState>,
    closed_tab_id: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.reopen_closed_query_tab(&closed_tab_id)
}

#[tauri::command]
pub fn reorder_query_tabs(
    state: State<'_, SharedAppState>,
    request: QueryTabReorderRequest,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.reorder_query_tabs(request)
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
pub fn update_query_builder_state(
    state: State<'_, SharedAppState>,
    request: UpdateQueryBuilderStateRequest,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.update_query_builder_state(request)
}

#[tauri::command]
pub fn rename_query_tab(
    state: State<'_, SharedAppState>,
    tab_id: String,
    title: String,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.rename_query_tab(&tab_id, &title)
}

#[tauri::command]
pub fn save_query_tab(
    state: State<'_, SharedAppState>,
    tab_id: String,
    item: SavedWorkItem,
) -> Result<BootstrapPayload, CommandError> {
    let mut state = state.lock().unwrap();
    state.save_query_tab(&tab_id, item)
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
pub async fn load_structure_map(
    state: State<'_, SharedAppState>,
    request: StructureRequest,
) -> Result<StructureResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.load_structure_map(request).await
}

#[tauri::command]
pub fn list_datastore_experiences(
    state: State<'_, SharedAppState>,
) -> Result<DatastoreExperienceResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.list_datastore_experiences()
}

#[tauri::command]
pub async fn list_datastore_operations(
    state: State<'_, SharedAppState>,
    request: OperationManifestRequest,
) -> Result<OperationManifestResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.list_operation_manifests(request).await
}

#[tauri::command]
pub async fn plan_datastore_operation(
    state: State<'_, SharedAppState>,
    request: OperationPlanRequest,
) -> Result<OperationPlanResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.plan_operation(request).await
}

#[tauri::command]
pub async fn execute_datastore_operation(
    state: State<'_, SharedAppState>,
    request: OperationExecutionRequest,
) -> Result<OperationExecutionResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.execute_operation(request).await
}

#[tauri::command]
pub async fn plan_data_edit(
    state: State<'_, SharedAppState>,
    request: DataEditPlanRequest,
) -> Result<DataEditPlanResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.plan_data_edit(request).await
}

#[tauri::command]
pub async fn execute_data_edit(
    state: State<'_, SharedAppState>,
    request: DataEditExecutionRequest,
) -> Result<DataEditExecutionResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.execute_data_edit(request).await
}

#[tauri::command]
pub async fn inspect_connection_permissions(
    state: State<'_, SharedAppState>,
    request: PermissionInspectionRequest,
) -> Result<PermissionInspectionResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.inspect_permissions(request).await
}

#[tauri::command]
pub async fn collect_adapter_diagnostics(
    state: State<'_, SharedAppState>,
    request: AdapterDiagnosticsRequest,
) -> Result<AdapterDiagnosticsResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.collect_adapter_diagnostics(request).await
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
pub async fn fetch_result_page(
    state: State<'_, SharedAppState>,
    request: ResultPageRequest,
) -> Result<ResultPageResponse, CommandError> {
    let runtime = clone_runtime(&state);
    runtime.fetch_result_page(request).await
}

#[tauri::command]
pub fn pick_local_database_file(
    app: AppHandle,
    state: State<'_, SharedAppState>,
    request: LocalDatabasePickRequest,
) -> Result<LocalDatabasePickResult, CommandError> {
    {
        let state = state.lock().unwrap();
        state.ensure_unlocked()?;
    }

    let Some(spec) = local_database_spec(&request.engine) else {
        return Err(local_database_unsupported_error());
    };

    let title = if request.purpose == "create" {
        format!("Choose {} database folder", spec.label)
    } else {
        format!("Open {} database", spec.label)
    };
    let dialog = app
        .dialog()
        .file()
        .set_title(&title)
        .add_filter(spec.filter_label, spec.extensions);
    let selected = if request.purpose == "create" {
        dialog.blocking_pick_folder()
    } else {
        dialog.blocking_pick_file()
    };

    Ok(LocalDatabasePickResult {
        canceled: selected.is_none(),
        path: selected.map(dialog_path_to_string).transpose()?,
    })
}

#[tauri::command]
pub async fn create_local_database(
    state: State<'_, SharedAppState>,
    request: LocalDatabaseCreateRequest,
) -> Result<LocalDatabaseCreateResult, CommandError> {
    {
        let state = state.lock().unwrap();
        state.ensure_unlocked()?;
    }

    let Some(spec) = local_database_spec(&request.engine) else {
        return Err(local_database_unsupported_error());
    };

    if request.mode != "empty" && request.mode != "starter" {
        return Err(CommandError::new(
            "local-database-mode-unsupported",
            "Choose either an empty database or starter schema.",
        ));
    }
    if request.mode == "starter" && !spec.can_create_starter {
        return Err(CommandError::new(
            "local-database-mode-unsupported",
            format!(
                "{} databases can currently be created as empty files only.",
                spec.label
            ),
        ));
    }

    let path = PathBuf::from(request.path.trim());

    if path.as_os_str().is_empty() {
        return Err(CommandError::new(
            "local-database-path-required",
            "Choose a file path before creating the local database.",
        ));
    }

    let warnings = match request.engine.as_str() {
        "sqlite" => {
            create_sqlite_local_database(&path, &request.mode).await?;
            Vec::new()
        }
        "duckdb" => {
            create_duckdb_local_database(&path, &request.mode)?;
            Vec::new()
        }
        "litedb" => create_litedb_local_database(&path)?,
        _ => return Err(local_database_unsupported_error()),
    };

    Ok(LocalDatabaseCreateResult {
        engine: request.engine,
        path: path.to_string_lossy().to_string(),
        message: if request.mode == "starter" && spec.can_create_starter {
            format!("{} starter database created.", spec.label)
        } else {
            format!("{} database created.", spec.label)
        },
        warnings,
    })
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

fn dialog_path_to_string(path: FilePath) -> Result<String, CommandError> {
    path.into_path()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| CommandError::new("dialog-path-error", error.to_string()))
}

struct LocalDatabaseSpec {
    label: &'static str,
    filter_label: &'static str,
    extensions: &'static [&'static str],
    can_create_starter: bool,
}

fn local_database_spec(engine: &str) -> Option<LocalDatabaseSpec> {
    match engine {
        "sqlite" => Some(LocalDatabaseSpec {
            label: "SQLite",
            filter_label: "SQLite database",
            extensions: &["sqlite", "sqlite3", "db"],
            can_create_starter: true,
        }),
        "duckdb" => Some(LocalDatabaseSpec {
            label: "DuckDB",
            filter_label: "DuckDB database",
            extensions: &["duckdb", "db"],
            can_create_starter: true,
        }),
        "litedb" => Some(LocalDatabaseSpec {
            label: "LiteDB",
            filter_label: "LiteDB database",
            extensions: &["db", "litedb"],
            can_create_starter: false,
        }),
        _ => None,
    }
}

fn local_database_unsupported_error() -> CommandError {
    CommandError::new(
        "local-database-unsupported",
        "Local database files can be created for SQLite, DuckDB, and LiteDB.",
    )
}

async fn create_sqlite_local_database(path: &Path, mode: &str) -> Result<(), CommandError> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }

    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;

    sqlx::query("pragma user_version = 1")
        .execute(&pool)
        .await?;

    if mode == "starter" {
        sqlx::query(
            "create table if not exists items (
                id integer primary key autoincrement,
                name text not null,
                status text not null default 'new',
                created_at text not null default (datetime('now'))
            )",
        )
        .execute(&pool)
        .await?;
        sqlx::query(
            "insert into items (name, status)
             select 'First local item', 'new'
             where not exists (select 1 from items)",
        )
        .execute(&pool)
        .await?;
    }

    pool.close().await;
    Ok(())
}

fn create_duckdb_local_database(path: &Path, mode: &str) -> Result<(), CommandError> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }

    let db = DuckDbConnection::open(path)
        .map_err(|error| CommandError::new("duckdb-create-error", error.to_string()))?;
    db.execute_batch("select 1;")
        .map_err(|error| CommandError::new("duckdb-create-error", error.to_string()))?;

    if mode == "starter" {
        db.execute_batch(
            "create table if not exists items (
                id integer primary key,
                name varchar not null,
                status varchar not null,
                created_at timestamp default current_timestamp
            );
            insert into items
            select 1, 'First local item', 'new', current_timestamp
            where not exists (select 1 from items);",
        )
        .map_err(|error| CommandError::new("duckdb-create-error", error.to_string()))?;
    }

    Ok(())
}

fn create_litedb_local_database(path: &Path) -> Result<Vec<String>, CommandError> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }

    if !path.exists() {
        std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)?;
    }

    Ok(vec![
        "LiteDB file was prepared. The .NET LiteDB sidecar will initialize database pages when live file access is enabled.".into(),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_sqlite_path(name: &str) -> PathBuf {
        let unique = crate::app::runtime::generate_id(name);
        std::env::temp_dir()
            .join("datanaut-local-db-tests")
            .join(format!("{unique}.sqlite"))
    }

    fn test_local_path(name: &str, extension: &str) -> PathBuf {
        let unique = crate::app::runtime::generate_id(name);
        std::env::temp_dir()
            .join("datanaut-local-db-tests")
            .join(format!("{unique}.{extension}"))
    }

    #[test]
    fn empty_sqlite_database_creation_is_connectable() {
        tauri::async_runtime::block_on(async {
            let path = test_sqlite_path("empty");
            create_sqlite_local_database(&path, "empty").await.unwrap();

            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(
                    SqliteConnectOptions::new()
                        .filename(&path)
                        .create_if_missing(false),
                )
                .await
                .unwrap();
            let value: i64 = sqlx::query_scalar("select 1")
                .fetch_one(&pool)
                .await
                .unwrap();
            pool.close().await;
            let _ = std::fs::remove_file(path);

            assert_eq!(value, 1);
        });
    }

    #[test]
    fn starter_sqlite_database_creation_seeds_items_table() {
        tauri::async_runtime::block_on(async {
            let path = test_sqlite_path("starter");
            create_sqlite_local_database(&path, "starter")
                .await
                .unwrap();

            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(
                    SqliteConnectOptions::new()
                        .filename(&path)
                        .create_if_missing(false),
                )
                .await
                .unwrap();
            let count: i64 = sqlx::query_scalar("select count(*) from items")
                .fetch_one(&pool)
                .await
                .unwrap();
            pool.close().await;
            let _ = std::fs::remove_file(path);

            assert_eq!(count, 1);
        });
    }

    #[test]
    fn duckdb_database_creation_supports_starter_table() {
        let path = test_local_path("duckdb-starter", "duckdb");
        create_duckdb_local_database(&path, "starter").unwrap();

        let db = DuckDbConnection::open(&path).unwrap();
        let count: i64 = db
            .query_row("select count(*) from items", [], |row| row.get(0))
            .unwrap();
        let _ = std::fs::remove_file(path);

        assert_eq!(count, 1);
    }

    #[test]
    fn litedb_database_creation_prepares_local_file() {
        let path = test_local_path("litedb-empty", "db");
        let warnings = create_litedb_local_database(&path).unwrap();
        let metadata = std::fs::metadata(&path).unwrap();
        let _ = std::fs::remove_file(path);

        assert!(metadata.is_file());
        assert_eq!(warnings.len(), 1);
    }
}
