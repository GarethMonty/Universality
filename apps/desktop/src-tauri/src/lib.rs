use tauri::Manager;

pub mod adapters;
pub mod app;
pub mod commands;
pub mod core;
pub mod domain;
pub mod infrastructure;
pub mod persistence;
pub mod security;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(std::sync::Mutex::new(app::runtime::ManagedAppState::load(
                app.handle().clone(),
            )));
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::app::bootstrap_app,
            commands::app::create_diagnostics_report,
            commands::app::get_app_health,
            commands::app::store_secret,
            commands::workspace::cancel_execution_request,
            commands::workspace::create_query_tab,
            commands::workspace::delete_saved_work_item,
            commands::workspace::execute_query_request,
            commands::workspace::export_workspace_bundle,
            commands::workspace::import_workspace_bundle,
            commands::workspace::inspect_explorer_node,
            commands::workspace::list_explorer_nodes,
            commands::workspace::lock_app,
            commands::workspace::open_saved_work_item,
            commands::workspace::set_active_connection,
            commands::workspace::set_active_tab,
            commands::workspace::set_theme,
            commands::workspace::set_ui_state,
            commands::workspace::test_connection,
            commands::workspace::unlock_app,
            commands::workspace::update_query_tab,
            commands::workspace::upsert_connection_profile,
            commands::workspace::upsert_environment_profile,
            commands::workspace::upsert_saved_work_item
        ])
        .run(tauri::generate_context!())
        .expect("error while running Universality");
}
