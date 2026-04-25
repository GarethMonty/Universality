use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::Mutex,
};

use sha2::{Digest, Sha256};
use tauri::AppHandle;

use crate::{
    adapters,
    domain::{
        error::CommandError,
        models::{
            AdapterDiagnosticsRequest, AdapterDiagnosticsResponse, AppHealth, AppPreferences,
            BootstrapPayload, CancelExecutionRequest, CancelExecutionResult,
            ClosedQueryTabSnapshot, ConnectionAuth, ConnectionProfile, ConnectionTestRequest,
            ConnectionTestResult, DiagnosticsCounts, DiagnosticsReport, EnvironmentProfile,
            ExecutionRequest, ExecutionResponse, ExplorerInspectRequest, ExplorerInspectResponse,
            ExplorerRequest, ExplorerResponse, ExportBundle, LockState, OperationExecutionRequest,
            OperationExecutionResponse, OperationManifestRequest, OperationManifestResponse,
            OperationPlanRequest, OperationPlanResponse, PermissionInspectionRequest,
            PermissionInspectionResponse, QueryExecutionNotice, QueryHistoryEntry,
            QueryTabReorderRequest, QueryTabState, ResolvedConnectionProfile, ResolvedEnvironment,
            ResultPageRequest, ResultPageResponse, SavedWorkItem, SecretRef, StructureRequest,
            StructureResponse, UiState, UpdateUiStateRequest, UserFacingError, WorkspaceSnapshot,
        },
    },
    persistence, security,
};

pub struct ManagedAppState {
    pub app: AppHandle,
    pub snapshot: WorkspaceSnapshot,
}

pub type SharedAppState = Mutex<ManagedAppState>;

impl ManagedAppState {
    pub fn load(app: AppHandle) -> Self {
        let loaded_snapshot = persistence::load_snapshot(&app)
            .ok()
            .flatten()
            .map(migrate_snapshot);
        let seed_fixture_workspace =
            fixture_debug_enabled() && loaded_snapshot.as_ref().is_none_or(workspace_is_empty);
        let snapshot = if seed_fixture_workspace {
            let seed = fixture_workspace_seed();
            let _ = seed_fixture_secrets(&seed.secrets);
            seed.snapshot
        } else {
            loaded_snapshot.unwrap_or_else(blank_workspace_snapshot)
        };
        let managed = Self { app, snapshot };
        let _ = persistence::save_snapshot(&managed.app, &sanitize_snapshot(&managed.snapshot));
        managed
    }

    pub fn health(&self) -> AppHealth {
        let secret_storage = if security::using_file_secret_store() {
            "file"
        } else {
            "keyring"
        };

        AppHealth::desktop(secret_storage)
    }

    pub fn diagnostics(&self) -> DiagnosticsReport {
        let mut warnings = Vec::new();

        if self.snapshot.lock_state.is_locked {
            warnings.push("Application is currently locked.".into());
        }

        if self.snapshot.preferences.telemetry == "disabled" {
            warnings.push("Crash reporting is disabled.".into());
        }

        if self
            .snapshot
            .environments
            .iter()
            .any(|environment| environment.risk == "critical")
        {
            warnings.push("Critical environments are configured in this workspace.".into());
        }

        DiagnosticsReport {
            created_at: timestamp_now(),
            runtime: self.health().runtime,
            platform: self.health().platform,
            app_version: env!("CARGO_PKG_VERSION").into(),
            counts: DiagnosticsCounts {
                connections: self.snapshot.connections.len(),
                environments: self.snapshot.environments.len(),
                tabs: self.snapshot.tabs.len(),
                saved_work: self.snapshot.saved_work.len(),
            },
            warnings,
        }
    }

    pub fn resolve_environment(&self, environment_id: &str) -> ResolvedEnvironment {
        resolve_environment(&self.snapshot.environments, environment_id)
    }

    fn next_query_tab_title(&self, connection: &ConnectionProfile) -> String {
        let (prefix, extension) = query_tab_title_parts(connection);
        let mut index = 1;
        let mut title = format!("{prefix} {index}.{extension}");

        while self.snapshot.tabs.iter().any(|tab| tab.title == title) {
            index += 1;
            title = format!("{prefix} {index}.{extension}");
        }

        title
    }

    pub fn bootstrap_payload(&self) -> BootstrapPayload {
        BootstrapPayload {
            health: self.health(),
            snapshot: self.snapshot.clone(),
            resolved_environment: self.resolve_environment(&self.snapshot.ui.active_environment_id),
            diagnostics: self.diagnostics(),
        }
    }

    pub fn persist(&self) -> Result<(), CommandError> {
        persistence::save_snapshot(&self.app, &sanitize_snapshot(&self.snapshot))
    }

    pub fn ensure_unlocked(&self) -> Result<(), CommandError> {
        if self.snapshot.lock_state.is_locked {
            Err(CommandError::new(
                "workspace-locked",
                "Unlock the workspace before using privileged desktop commands.",
            ))
        } else {
            Ok(())
        }
    }

    pub fn set_active_connection(
        &mut self,
        connection_id: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        let connection = self
            .snapshot
            .connections
            .iter()
            .find(|item| item.id == connection_id)
            .cloned()
            .ok_or_else(|| CommandError::new("connection-missing", "Connection was not found."))?;
        let tab = match self
            .snapshot
            .tabs
            .iter()
            .find(|item| item.connection_id == connection.id)
            .cloned()
        {
            Some(tab) => tab,
            None => {
                let title = self.next_query_tab_title(&connection);
                let tab = build_query_tab(&connection, true, title);
                self.snapshot.tabs.push(tab.clone());
                tab
            }
        };

        self.snapshot.ui.active_connection_id = tab.connection_id;
        self.snapshot.ui.active_environment_id = tab.environment_id;
        self.snapshot.ui.active_tab_id = tab.id;
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn set_active_tab(&mut self, tab_id: &str) -> Result<BootstrapPayload, CommandError> {
        let tab = self
            .snapshot
            .tabs
            .iter()
            .find(|item| item.id == tab_id)
            .cloned()
            .ok_or_else(|| CommandError::new("tab-missing", "Tab was not found."))?;
        self.snapshot.ui.active_tab_id = tab.id;
        self.snapshot.ui.active_connection_id = tab.connection_id;
        self.snapshot.ui.active_environment_id = tab.environment_id;
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn set_tab_environment(
        &mut self,
        tab_id: &str,
        environment_id: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        let environment_exists = self
            .snapshot
            .environments
            .iter()
            .any(|item| item.id == environment_id);

        if !environment_exists {
            return Err(CommandError::new(
                "environment-missing",
                "Environment was not found.",
            ));
        }

        let tab = self
            .snapshot
            .tabs
            .iter_mut()
            .find(|item| item.id == tab_id)
            .ok_or_else(|| CommandError::new("tab-missing", "Tab was not found."))?;
        tab.environment_id = environment_id.into();
        tab.status = "idle".into();
        tab.result = None;
        tab.error = None;
        tab.last_run_at = None;

        self.snapshot.ui.active_tab_id = tab.id.clone();
        self.snapshot.ui.active_connection_id = tab.connection_id.clone();
        self.snapshot.ui.active_environment_id = tab.environment_id.clone();
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn upsert_connection(
        &mut self,
        profile: ConnectionProfile,
    ) -> Result<BootstrapPayload, CommandError> {
        if let Some(index) = self
            .snapshot
            .connections
            .iter()
            .position(|item| item.id == profile.id)
        {
            self.snapshot.connections[index] = profile;
        } else {
            self.snapshot.connections.push(profile);
        }

        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn delete_connection(
        &mut self,
        connection_id: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        self.ensure_unlocked()?;

        let deleted = self
            .snapshot
            .connections
            .iter()
            .any(|connection| connection.id == connection_id);

        if !deleted {
            return Err(CommandError::new(
                "connection-missing",
                "Connection was not found.",
            ));
        }

        self.snapshot
            .connections
            .retain(|connection| connection.id != connection_id);
        self.snapshot
            .tabs
            .retain(|tab| tab.connection_id != connection_id);

        if self.snapshot.tabs.is_empty() {
            if let Some(connection) = self.snapshot.connections.first().cloned() {
                let title = self.next_query_tab_title(&connection);
                self.snapshot
                    .tabs
                    .push(build_query_tab(&connection, false, title));
            }
        }

        if let Some(active_tab) = self
            .snapshot
            .tabs
            .iter()
            .find(|tab| tab.id == self.snapshot.ui.active_tab_id)
            .cloned()
            .or_else(|| self.snapshot.tabs.first().cloned())
        {
            self.snapshot.ui.active_connection_id = active_tab.connection_id;
            self.snapshot.ui.active_environment_id = active_tab.environment_id;
            self.snapshot.ui.active_tab_id = active_tab.id;
        } else {
            self.snapshot.ui.active_connection_id = String::new();
            self.snapshot.ui.active_environment_id = String::new();
            self.snapshot.ui.active_tab_id = String::new();
            self.snapshot.ui.bottom_panel_visible = false;
            self.snapshot.ui.right_drawer = "none".into();
        }
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn upsert_environment(
        &mut self,
        profile: EnvironmentProfile,
    ) -> Result<BootstrapPayload, CommandError> {
        if let Some(index) = self
            .snapshot
            .environments
            .iter()
            .position(|item| item.id == profile.id)
        {
            self.snapshot.environments[index] = profile;
        } else {
            self.snapshot.environments.push(profile);
        }

        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn create_query_tab(
        &mut self,
        connection_id: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        let connection = self
            .snapshot
            .connections
            .iter()
            .find(|item| item.id == connection_id)
            .cloned()
            .ok_or_else(|| CommandError::new("connection-missing", "Connection was not found."))?;
        let title = self.next_query_tab_title(&connection);
        let tab = build_query_tab(&connection, true, title);
        self.snapshot.tabs.push(tab.clone());
        self.snapshot.ui.active_connection_id = tab.connection_id;
        self.snapshot.ui.active_environment_id = tab.environment_id;
        self.snapshot.ui.active_tab_id = tab.id;
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn close_query_tab(&mut self, tab_id: &str) -> Result<BootstrapPayload, CommandError> {
        let tab_index = self
            .snapshot
            .tabs
            .iter()
            .position(|item| item.id == tab_id)
            .ok_or_else(|| CommandError::new("tab-missing", "Tab was not found."))?;
        let closed_tab = self.snapshot.tabs.remove(tab_index);

        archive_closed_tab(&mut self.snapshot, closed_tab.clone(), "user");

        if let Some(active_tab) = self
            .snapshot
            .tabs
            .get(tab_index)
            .cloned()
            .or_else(|| {
                tab_index
                    .checked_sub(1)
                    .and_then(|index| self.snapshot.tabs.get(index).cloned())
            })
            .or_else(|| self.snapshot.tabs.first().cloned())
        {
            self.snapshot.ui.active_tab_id = active_tab.id;
            self.snapshot.ui.active_connection_id = active_tab.connection_id;
            self.snapshot.ui.active_environment_id = active_tab.environment_id;
        } else {
            let fallback_connection = self
                .snapshot
                .connections
                .iter()
                .find(|connection| connection.id == closed_tab.connection_id)
                .cloned()
                .or_else(|| self.snapshot.connections.first().cloned());
            self.snapshot.ui.active_tab_id = String::new();
            self.snapshot.ui.active_connection_id = fallback_connection
                .as_ref()
                .map(|connection| connection.id.clone())
                .unwrap_or_default();
            self.snapshot.ui.active_environment_id = if closed_tab.environment_id.is_empty() {
                fallback_connection
                    .and_then(|connection| connection.environment_ids.first().cloned())
                    .unwrap_or_default()
            } else {
                closed_tab.environment_id
            };
            self.snapshot.ui.bottom_panel_visible = false;
        }

        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn reopen_closed_query_tab(
        &mut self,
        closed_tab_id: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        let closed_tab_index = self
            .snapshot
            .closed_tabs
            .iter()
            .position(|item| item.tab.id == closed_tab_id)
            .ok_or_else(|| CommandError::new("closed-tab-missing", "Closed tab was not found."))?;
        let closed_tab = self.snapshot.closed_tabs.remove(closed_tab_index);
        let mut tab = closed_tab.tab;

        tab.id = generate_id("tab");
        tab.result = None;

        if tab.status == "running" || tab.status == "queued" {
            tab.status = "idle".into();
        }

        self.snapshot.tabs.push(tab.clone());
        self.snapshot.ui.active_tab_id = tab.id;
        self.snapshot.ui.active_connection_id = tab.connection_id;
        self.snapshot.ui.active_environment_id = tab.environment_id;
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn reorder_query_tabs(
        &mut self,
        request: QueryTabReorderRequest,
    ) -> Result<BootstrapPayload, CommandError> {
        reorder_query_tabs_in_place(&mut self.snapshot.tabs, request.ordered_tab_ids)?;
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn update_query_tab(
        &mut self,
        tab_id: &str,
        query_text: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        let tab = self
            .snapshot
            .tabs
            .iter_mut()
            .find(|item| item.id == tab_id)
            .ok_or_else(|| CommandError::new("tab-missing", "Tab was not found."))?;
        tab.query_text = query_text.into();
        tab.dirty = true;
        tab.status = "idle".into();
        tab.result = None;
        tab.error = None;
        tab.last_run_at = None;
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn rename_query_tab(
        &mut self,
        tab_id: &str,
        title: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        let tab = self
            .snapshot
            .tabs
            .iter_mut()
            .find(|item| item.id == tab_id)
            .ok_or_else(|| CommandError::new("tab-missing", "Tab was not found."))?;
        let title = normalize_tab_title(title, &tab.title);

        tab.title = title;
        if tab.saved_query_id.is_some() {
            tab.dirty = true;
        }

        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn save_query_tab(
        &mut self,
        tab_id: &str,
        mut item: SavedWorkItem,
    ) -> Result<BootstrapPayload, CommandError> {
        self.ensure_unlocked()?;

        let tab_index = self
            .snapshot
            .tabs
            .iter()
            .position(|tab| tab.id == tab_id)
            .ok_or_else(|| CommandError::new("tab-missing", "Tab was not found."))?;

        if item.id.trim().is_empty() {
            item.id = generate_id("saved");
        }

        if item.name.trim().is_empty() {
            item.name = self.snapshot.tabs[tab_index].title.clone();
        }

        item.updated_at = timestamp_now();
        let saved_work_id = item.id.clone();
        let saved_query_name = item.name.clone();
        let saved_query_text = item.query_text.clone();

        upsert_saved_work_item(&mut self.snapshot.saved_work, item);

        let tab = &mut self.snapshot.tabs[tab_index];
        tab.saved_query_id = Some(saved_work_id);
        tab.title = saved_query_name;
        if let Some(query_text) = saved_query_text {
            tab.query_text = query_text;
        }
        tab.dirty = false;
        tab.result = None;
        tab.error = None;
        tab.status = "idle".into();

        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn upsert_saved_work(
        &mut self,
        mut item: SavedWorkItem,
    ) -> Result<BootstrapPayload, CommandError> {
        self.ensure_unlocked()?;
        item.updated_at = timestamp_now();
        let saved_work_id = item.id.clone();
        let saved_query_name = item.name.clone();
        let saved_query_text = item.query_text.clone();

        upsert_saved_work_item(&mut self.snapshot.saved_work, item);

        for tab in &mut self.snapshot.tabs {
            if tab.saved_query_id.as_deref() == Some(saved_work_id.as_str()) {
                if let Some(query_text) = &saved_query_text {
                    tab.query_text = query_text.clone();
                }
                tab.title = saved_query_name.clone();
                tab.dirty = false;
                tab.result = None;
                tab.error = None;
                tab.status = "idle".into();
            }
        }

        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn delete_saved_work(
        &mut self,
        saved_work_id: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        self.ensure_unlocked()?;
        self.snapshot
            .saved_work
            .retain(|item| item.id != saved_work_id);
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn open_saved_work(
        &mut self,
        saved_work_id: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        self.ensure_unlocked()?;
        let item = self
            .snapshot
            .saved_work
            .iter()
            .find(|saved| saved.id == saved_work_id)
            .cloned()
            .ok_or_else(|| CommandError::new("saved-work-missing", "Saved work was not found."))?;
        let query_text = item.query_text.clone().ok_or_else(|| {
            CommandError::new(
                "saved-work-not-openable",
                "Saved work does not contain query text.",
            )
        })?;
        let connection_id = item
            .connection_id
            .clone()
            .unwrap_or_else(|| self.snapshot.ui.active_connection_id.clone());
        let connection = self.connection_by_id(&connection_id)?;
        let environment_id = item
            .environment_id
            .clone()
            .or_else(|| connection.environment_ids.first().cloned())
            .unwrap_or_else(|| self.snapshot.ui.active_environment_id.clone());
        let tab = QueryTabState {
            id: generate_id("tab"),
            title: item.name.clone(),
            connection_id: connection.id.clone(),
            environment_id,
            family: connection.family.clone(),
            language: item
                .language
                .clone()
                .unwrap_or_else(|| language_for_connection(&connection)),
            pinned: None,
            saved_query_id: Some(item.id.clone()),
            editor_label: editor_label_for_connection(&connection),
            query_text,
            status: "idle".into(),
            dirty: false,
            last_run_at: None,
            result: None,
            history: Vec::new(),
            error: None,
        };

        self.snapshot.tabs.push(tab.clone());
        self.snapshot.ui.active_connection_id = tab.connection_id.clone();
        self.snapshot.ui.active_environment_id = tab.environment_id.clone();
        self.snapshot.ui.active_tab_id = tab.id.clone();
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn export_bundle(&self, passphrase: &str) -> Result<ExportBundle, CommandError> {
        self.ensure_unlocked()?;
        let serialized = serde_json::to_string_pretty(&sanitize_snapshot(&self.snapshot))?;
        let encrypted_payload = security::encrypt_export_payload(passphrase, &serialized)?;
        Ok(ExportBundle {
            format: "universality-bundle".into(),
            version: persistence::SCHEMA_VERSION,
            encrypted_payload,
        })
    }

    pub fn import_bundle(
        &mut self,
        passphrase: &str,
        encrypted_payload: &str,
    ) -> Result<BootstrapPayload, CommandError> {
        self.ensure_unlocked()?;
        let decrypted = security::decrypt_export_payload(passphrase, encrypted_payload)?;
        let snapshot = serde_json::from_str::<WorkspaceSnapshot>(&decrypted)?;
        self.snapshot = migrate_snapshot(snapshot);
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn connection_by_id(&self, connection_id: &str) -> Result<ConnectionProfile, CommandError> {
        self.snapshot
            .connections
            .iter()
            .find(|item| item.id == connection_id)
            .cloned()
            .ok_or_else(|| CommandError::new("connection-missing", "Connection was not found."))
    }

    pub fn environment_by_id(
        &self,
        environment_id: &str,
    ) -> Result<EnvironmentProfile, CommandError> {
        self.snapshot
            .environments
            .iter()
            .find(|item| item.id == environment_id)
            .cloned()
            .ok_or_else(|| CommandError::new("environment-missing", "Environment was not found."))
    }

    pub fn resolve_connection_profile(
        &self,
        profile: &ConnectionProfile,
        environment_id: &str,
    ) -> Result<(ResolvedConnectionProfile, ResolvedEnvironment, Vec<String>), CommandError> {
        let resolved_environment = self.resolve_environment(environment_id);
        let interpolate = |value: &str| interpolate_value(value, &resolved_environment.variables);
        let password = match &profile.auth.secret_ref {
            Some(secret_ref) => security::resolve_secret_value(secret_ref).ok(),
            None => None,
        };

        let resolved = ResolvedConnectionProfile {
            id: profile.id.clone(),
            name: profile.name.clone(),
            engine: profile.engine.clone(),
            family: profile.family.clone(),
            host: interpolate(&profile.host),
            port: profile.port,
            database: profile.database.as_deref().map(interpolate),
            username: profile.auth.username.as_deref().map(interpolate),
            password,
            connection_string: profile.connection_string.as_deref().map(interpolate),
            read_only: profile.read_only,
        };
        let warnings = build_resolution_warnings(&resolved, &resolved_environment);

        Ok((resolved, resolved_environment, warnings))
    }

    pub async fn test_connection(
        &self,
        request: ConnectionTestRequest,
    ) -> Result<ConnectionTestResult, CommandError> {
        self.ensure_unlocked()?;
        let (resolved, _resolved_environment, warnings) =
            self.resolve_connection_profile(&request.profile, &request.environment_id)?;

        if has_unresolved_tokens(&resolved.host)
            || resolved
                .database
                .as_ref()
                .is_some_and(|value| has_unresolved_tokens(value))
        {
            return Ok(ConnectionTestResult {
                ok: false,
                engine: resolved.engine,
                message: "Connection test detected unresolved variables.".into(),
                warnings,
                resolved_host: resolved.host,
                resolved_database: resolved.database,
                duration_ms: Some(0),
            });
        }

        adapters::test_connection(&resolved, warnings).await
    }

    pub async fn list_explorer_nodes(
        &mut self,
        request: ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        let response = adapters::list_explorer_nodes(&resolved, &request).await?;

        if request.scope.is_none() {
            self.snapshot.explorer_nodes = response.nodes.clone();
            self.snapshot.updated_at = timestamp_now();
            self.persist()?;
        }

        Ok(response)
    }

    pub async fn inspect_explorer_node(
        &self,
        request: ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        adapters::inspect_explorer_node(&resolved, &request).await
    }

    pub async fn load_structure_map(
        &self,
        request: StructureRequest,
    ) -> Result<StructureResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        adapters::load_structure_map(&resolved, &request).await
    }

    pub async fn list_operation_manifests(
        &self,
        request: OperationManifestRequest,
    ) -> Result<OperationManifestResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        let operations = adapters::operation_manifests(&resolved)?;

        Ok(OperationManifestResponse {
            connection_id: request.connection_id,
            environment_id: request.environment_id,
            engine: resolved.engine,
            operations,
        })
    }

    pub async fn plan_operation(
        &self,
        request: OperationPlanRequest,
    ) -> Result<OperationPlanResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        let parameters = request.parameters.as_ref().map(|items| {
            items
                .iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect::<BTreeMap<_, _>>()
        });
        let plan = adapters::plan_operation(
            &resolved,
            &request.operation_id,
            request.object_name.as_deref(),
            parameters.as_ref(),
        )
        .await?;

        Ok(OperationPlanResponse {
            connection_id: request.connection_id,
            environment_id: request.environment_id,
            plan,
        })
    }

    pub async fn execute_operation(
        &self,
        request: OperationExecutionRequest,
    ) -> Result<OperationExecutionResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        adapters::execute_operation(&resolved, &request).await
    }

    pub async fn inspect_permissions(
        &self,
        request: PermissionInspectionRequest,
    ) -> Result<PermissionInspectionResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        let inspection = adapters::inspect_permissions(&resolved).await?;

        Ok(PermissionInspectionResponse {
            connection_id: request.connection_id,
            environment_id: request.environment_id,
            inspection,
        })
    }

    pub async fn collect_adapter_diagnostics(
        &self,
        request: AdapterDiagnosticsRequest,
    ) -> Result<AdapterDiagnosticsResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        let diagnostics =
            adapters::collect_diagnostics(&resolved, request.scope.as_deref()).await?;

        Ok(AdapterDiagnosticsResponse {
            connection_id: request.connection_id,
            environment_id: request.environment_id,
            diagnostics,
        })
    }

    pub async fn execute_query(
        &mut self,
        request: ExecutionRequest,
    ) -> Result<ExecutionResponse, CommandError> {
        self.ensure_unlocked()?;
        let tab_index = self
            .snapshot
            .tabs
            .iter()
            .position(|item| item.id == request.tab_id)
            .ok_or_else(|| CommandError::new("tab-missing", "Tab was not found."))?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let environment = self.environment_by_id(&request.environment_id)?;
        let (resolved_connection, resolved_environment, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        let query_text = if request.mode.as_deref() == Some("selection") {
            request
                .selected_text
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(request.query_text.as_str())
                .to_string()
        } else {
            request.query_text.clone()
        };
        let mut guardrail = security::evaluate_guardrails(
            &profile,
            &environment,
            &resolved_environment,
            &query_text,
            self.snapshot.preferences.safe_mode_enabled,
        );
        if guardrail.status == "confirm" {
            let guardrail_id = confirmation_guardrail_id(
                &profile.id,
                &environment.id,
                request.mode.as_deref().unwrap_or("full"),
                &query_text,
            );
            guardrail.id = Some(guardrail_id.clone());
            guardrail.required_confirmation_text = Some(format!("CONFIRM {}", environment.label));

            if request.confirmed_guardrail_id.as_deref() != Some(guardrail_id.as_str()) {
                let executed_at = timestamp_now();
                let tab_response = {
                    let tab = &mut self.snapshot.tabs[tab_index];
                    tab.query_text = request.query_text.clone();
                    tab.status = "blocked".into();
                    tab.dirty = false;
                    tab.last_run_at = Some(executed_at.clone());
                    tab.history.insert(
                        0,
                        QueryHistoryEntry {
                            id: generate_id("history"),
                            query_text,
                            executed_at,
                            status: "blocked".into(),
                        },
                    );
                    tab.error = Some(UserFacingError {
                        code: "guardrail-confirmation-required".into(),
                        message: guardrail.reasons.join(" "),
                    });
                    tab.result = None;
                    self.snapshot.ui.active_tab_id = tab.id.clone();
                    self.snapshot.ui.active_connection_id = tab.connection_id.clone();
                    self.snapshot.ui.active_environment_id = tab.environment_id.clone();
                    tab.clone()
                };

                self.snapshot.guardrails = vec![guardrail.clone()];
                self.snapshot.ui.bottom_panel_visible = true;
                self.snapshot.ui.active_bottom_panel_tab = "messages".into();
                self.snapshot.updated_at = timestamp_now();
                self.persist()?;

                return Ok(ExecutionResponse {
                    execution_id: request
                        .execution_id
                        .unwrap_or_else(|| generate_id("execution")),
                    tab: tab_response,
                    result: None,
                    guardrail,
                    diagnostics: vec![
                        "Execution requires explicit confirmation before running.".into()
                    ],
                });
            }
        }

        let notices = if guardrail.status == "confirm" {
            vec![QueryExecutionNotice {
                code: "guardrail-confirm".into(),
                level: "warning".into(),
                message: guardrail
                    .reasons
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "Confirmation required.".into()),
            }]
        } else {
            Vec::new()
        };

        let result = if guardrail.status == "block" {
            None
        } else {
            Some(adapters::execute(&resolved_connection, &request, notices.clone()).await?)
        };

        let status = if guardrail.status == "block" {
            "blocked".to_string()
        } else if result.is_some() {
            "success".to_string()
        } else {
            "error".to_string()
        };

        let executed_at = timestamp_now();
        let tab_response = {
            let tab = &mut self.snapshot.tabs[tab_index];
            tab.query_text = request.query_text.clone();
            tab.status = status.clone();
            tab.dirty = false;
            tab.last_run_at = Some(executed_at.clone());
            tab.history.insert(
                0,
                QueryHistoryEntry {
                    id: generate_id("history"),
                    query_text,
                    executed_at,
                    status: status.clone(),
                },
            );
            tab.error = if guardrail.status == "block" {
                Some(UserFacingError {
                    code: "guardrail-blocked".into(),
                    message: guardrail.reasons.join(" "),
                })
            } else {
                None
            };
            tab.result = result.clone();
            self.snapshot.ui.active_tab_id = tab.id.clone();
            self.snapshot.ui.active_connection_id = tab.connection_id.clone();
            self.snapshot.ui.active_environment_id = tab.environment_id.clone();
            tab.clone()
        };
        self.snapshot.guardrails = vec![guardrail.clone()];
        self.snapshot.ui.bottom_panel_visible = true;
        self.snapshot.ui.active_bottom_panel_tab = "results".into();
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;

        Ok(ExecutionResponse {
            execution_id: request
                .execution_id
                .unwrap_or_else(|| generate_id("execution")),
            tab: tab_response,
            result,
            guardrail,
            diagnostics: notices.into_iter().map(|notice| notice.message).collect(),
        })
    }

    pub async fn cancel_execution(
        &self,
        request: CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError> {
        self.ensure_unlocked()?;
        let tab = request
            .tab_id
            .as_ref()
            .and_then(|tab_id| self.snapshot.tabs.iter().find(|item| &item.id == tab_id))
            .cloned()
            .ok_or_else(|| {
                CommandError::new("tab-missing", "Tab was not found for cancellation.")
            })?;
        let profile = self.connection_by_id(&tab.connection_id)?;
        let (resolved, _, _) = self.resolve_connection_profile(&profile, &tab.environment_id)?;
        adapters::cancel(&resolved, &request).await
    }

    pub async fn fetch_result_page(
        &self,
        request: ResultPageRequest,
    ) -> Result<ResultPageResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        adapters::fetch_result_page(&resolved, &request).await
    }

    pub fn set_theme(&mut self, theme: &str) -> Result<BootstrapPayload, CommandError> {
        self.snapshot.preferences.theme = theme.into();
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn set_ui_state(
        &mut self,
        patch: UpdateUiStateRequest,
    ) -> Result<BootstrapPayload, CommandError> {
        if let Some(active_environment_id) = patch.active_environment_id {
            if active_environment_id.is_empty()
                || self
                    .snapshot
                    .environments
                    .iter()
                    .any(|item| item.id == active_environment_id)
            {
                self.snapshot.ui.active_environment_id = active_environment_id;
            }
        }

        if let Some(active_activity) = patch.active_activity.filter(|value| is_activity(value)) {
            self.snapshot.ui.active_activity = active_activity;
        }

        if let Some(sidebar_collapsed) = patch.sidebar_collapsed {
            self.snapshot.ui.sidebar_collapsed = sidebar_collapsed;
        }

        if let Some(active_sidebar_pane) = patch
            .active_sidebar_pane
            .filter(|value| is_sidebar_pane(value))
        {
            self.snapshot.ui.active_sidebar_pane = active_sidebar_pane;
        }

        if let Some(sidebar_width) = patch.sidebar_width {
            self.snapshot.ui.sidebar_width = clamp_sidebar_width(sidebar_width);
        }

        if let Some(explorer_filter) = patch.explorer_filter {
            self.snapshot.ui.explorer_filter = explorer_filter;
        }

        if let Some(explorer_view) = patch.explorer_view.filter(|value| is_explorer_view(value)) {
            self.snapshot.ui.explorer_view = explorer_view;
        }

        if let Some(bottom_panel_visible) = patch.bottom_panel_visible {
            self.snapshot.ui.bottom_panel_visible = bottom_panel_visible;
        }

        if let Some(active_bottom_panel_tab) = patch
            .active_bottom_panel_tab
            .filter(|value| is_bottom_panel_tab(value))
        {
            self.snapshot.ui.active_bottom_panel_tab = active_bottom_panel_tab;
        }

        if let Some(bottom_panel_height) = patch.bottom_panel_height {
            self.snapshot.ui.bottom_panel_height = clamp_bottom_panel_height(bottom_panel_height);
        }

        if let Some(right_drawer) = patch.right_drawer.filter(|value| is_right_drawer(value)) {
            self.snapshot.ui.right_drawer = right_drawer;
        }

        if let Some(right_drawer_width) = patch.right_drawer_width {
            self.snapshot.ui.right_drawer_width = clamp_right_drawer_width(right_drawer_width);
        }

        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn set_locked(&mut self, is_locked: bool) -> Result<BootstrapPayload, CommandError> {
        self.snapshot.lock_state.is_locked = is_locked;
        self.snapshot.lock_state.locked_at = if is_locked {
            Some(timestamp_now())
        } else {
            None
        };
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }
}

fn confirmation_guardrail_id(
    connection_id: &str,
    environment_id: &str,
    mode: &str,
    query_text: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(connection_id.as_bytes());
    hasher.update([0]);
    hasher.update(environment_id.as_bytes());
    hasher.update([0]);
    hasher.update(mode.as_bytes());
    hasher.update([0]);
    hasher.update(query_text.as_bytes());
    let digest = hasher.finalize();
    let short_id = digest
        .iter()
        .take(12)
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("guardrail-{short_id}")
}

fn sanitize_snapshot(snapshot: &WorkspaceSnapshot) -> WorkspaceSnapshot {
    let mut sanitized = snapshot.clone();

    for tab in &mut sanitized.tabs {
        tab.result = None;
    }

    for closed_tab in &mut sanitized.closed_tabs {
        closed_tab.tab.result = None;
    }

    sanitized
}

fn archive_closed_tab(snapshot: &mut WorkspaceSnapshot, mut tab: QueryTabState, reason: &str) {
    const MAX_CLOSED_TABS: usize = 25;

    tab.result = None;
    snapshot
        .closed_tabs
        .retain(|closed_tab| closed_tab.tab.id != tab.id);
    snapshot.closed_tabs.insert(
        0,
        ClosedQueryTabSnapshot {
            tab,
            closed_at: timestamp_now(),
            close_reason: reason.into(),
        },
    );
    snapshot.closed_tabs.truncate(MAX_CLOSED_TABS);
}

fn interpolate_value(value: &str, variables: &HashMap<String, String>) -> String {
    variables
        .iter()
        .fold(value.to_string(), |current, (key, resolved)| {
            current.replace(&format!("${{{key}}}"), resolved)
        })
}

fn has_unresolved_tokens(value: &str) -> bool {
    value.contains("${")
}

fn build_resolution_warnings(
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

fn default_query_text(connection: &ConnectionProfile) -> String {
    match connection.engine.as_str() {
        "mongodb" | "litedb" => "{\n  \"collection\": \"products\",\n  \"filter\": {},\n  \"limit\": 50\n}".into(),
        "dynamodb" => "{\n  \"table\": \"Orders\",\n  \"keyCondition\": \"pk = :pk\",\n  \"values\": { \":pk\": \"CUSTOMER#123\" },\n  \"limit\": 25\n}".into(),
        "cosmosdb" => "select top 50 * from c".into(),
        "redis" | "valkey" => "SCAN 0 MATCH session:* COUNT 25".into(),
        "memcached" => "stats".into(),
        "cassandra" => "select * from keyspace.table limit 25;".into(),
        "neo4j" => "MATCH (n) RETURN n LIMIT 25".into(),
        "neptune" | "janusgraph" => "g.V().limit(25)".into(),
        "arango" => "FOR doc IN collection LIMIT 25 RETURN doc".into(),
        "influxdb" => "SELECT * FROM measurement LIMIT 25".into(),
        "prometheus" => "up".into(),
        "opentsdb" => "{\n  \"start\": \"1h-ago\",\n  \"queries\": [\n    { \"metric\": \"sys.cpu.user\", \"aggregator\": \"avg\" }\n  ]\n}".into(),
        "elasticsearch" | "opensearch" => "{\n  \"query\": { \"match_all\": {} },\n  \"size\": 25\n}".into(),
        _ => "select 1;".into(),
    }
}

fn language_for_connection(connection: &ConnectionProfile) -> String {
    match connection.engine.as_str() {
        "mongodb" => "mongodb".into(),
        "redis" | "valkey" => "redis".into(),
        "cassandra" => "cql".into(),
        "neo4j" => "cypher".into(),
        "neptune" | "janusgraph" => "gremlin".into(),
        "arango" => "aql".into(),
        "prometheus" => "promql".into(),
        "influxdb" => "influxql".into(),
        "opentsdb" => "opentsdb".into(),
        "elasticsearch" | "opensearch" => "query-dsl".into(),
        "bigquery" => "google-sql".into(),
        "snowflake" => "snowflake-sql".into(),
        "clickhouse" => "clickhouse-sql".into(),
        "dynamodb" | "litedb" => "json".into(),
        _ => "sql".into(),
    }
}

fn editor_label_for_connection(connection: &ConnectionProfile) -> String {
    match language_for_connection(connection).as_str() {
        "mongodb" | "json" => "Document query".into(),
        "redis" => {
            if connection.engine == "valkey" {
                "Valkey console".into()
            } else {
                "Redis console".into()
            }
        }
        "cypher" => "Cypher editor".into(),
        "gremlin" => "Gremlin editor".into(),
        "sparql" => "SPARQL editor".into(),
        "aql" => "AQL editor".into(),
        "promql" => "PromQL editor".into(),
        "influxql" | "flux" | "opentsdb" => "Time-series query".into(),
        "query-dsl" => "Search DSL editor".into(),
        "google-sql" => "GoogleSQL editor".into(),
        "snowflake-sql" => "Snowflake SQL editor".into(),
        "clickhouse-sql" => "ClickHouse SQL editor".into(),
        "cql" => "CQL editor".into(),
        _ => "SQL editor".into(),
    }
}

fn query_tab_title_parts(connection: &ConnectionProfile) -> (&'static str, &'static str) {
    match connection.family.as_str() {
        "document" => ("Query", "json"),
        "keyvalue" => ("Console", "redis"),
        _ => ("Query", "sql"),
    }
}

fn normalize_tab_title(title: &str, fallback: &str) -> String {
    let trimmed = title.trim();

    if trimmed.is_empty() {
        fallback.into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn upsert_saved_work_item(saved_work: &mut Vec<SavedWorkItem>, item: SavedWorkItem) {
    if let Some(index) = saved_work
        .iter()
        .position(|existing| existing.id == item.id)
    {
        saved_work[index] = item;
    } else {
        saved_work.push(item);
    }
}

fn build_query_tab(connection: &ConnectionProfile, dirty: bool, title: String) -> QueryTabState {
    QueryTabState {
        id: generate_id("tab"),
        title,
        connection_id: connection.id.clone(),
        environment_id: connection
            .environment_ids
            .first()
            .cloned()
            .unwrap_or_else(|| "env-dev".into()),
        family: connection.family.clone(),
        language: language_for_connection(connection),
        pinned: None,
        saved_query_id: None,
        editor_label: editor_label_for_connection(connection),
        query_text: default_query_text(connection),
        status: "idle".into(),
        dirty,
        last_run_at: None,
        result: None,
        history: Vec::new(),
        error: None,
    }
}

pub fn timestamp_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{timestamp}")
}

pub fn generate_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{prefix}-{nanos}")
}

fn is_activity(value: &str) -> bool {
    matches!(
        value,
        "connections" | "environments" | "explorer" | "saved-work" | "search" | "settings"
    )
}

fn is_sidebar_pane(value: &str) -> bool {
    matches!(
        value,
        "connections" | "environments" | "explorer" | "saved-work" | "search"
    )
}

fn is_bottom_panel_tab(value: &str) -> bool {
    matches!(value, "results" | "messages" | "details")
}

fn is_explorer_view(value: &str) -> bool {
    matches!(value, "tree" | "structure")
}

fn is_right_drawer(value: &str) -> bool {
    matches!(
        value,
        "none" | "connection" | "inspection" | "diagnostics" | "operations"
    )
}

fn clamp_bottom_panel_height(value: u32) -> u32 {
    value.clamp(120, 900)
}

fn clamp_sidebar_width(value: u32) -> u32 {
    value.clamp(220, 420)
}

fn clamp_right_drawer_width(value: u32) -> u32 {
    value.clamp(320, 560)
}

fn normalize_ui_state(snapshot: &WorkspaceSnapshot) -> UiState {
    let active_tab = snapshot
        .tabs
        .iter()
        .find(|item| item.id == snapshot.ui.active_tab_id)
        .cloned()
        .or_else(|| snapshot.tabs.first().cloned());
    let active_connection = snapshot
        .connections
        .iter()
        .find(|item| item.id == snapshot.ui.active_connection_id)
        .cloned()
        .or_else(|| {
            active_tab
                .as_ref()
                .and_then(|tab| {
                    snapshot
                        .connections
                        .iter()
                        .find(|item| item.id == tab.connection_id)
                })
                .cloned()
        })
        .or_else(|| snapshot.connections.first().cloned());
    let active_environment = snapshot
        .environments
        .iter()
        .find(|item| item.id == snapshot.ui.active_environment_id)
        .cloned()
        .or_else(|| {
            active_tab
                .as_ref()
                .and_then(|tab| {
                    snapshot
                        .environments
                        .iter()
                        .find(|item| item.id == tab.environment_id)
                })
                .cloned()
        })
        .or_else(|| snapshot.environments.first().cloned());
    let active_activity = if is_activity(&snapshot.ui.active_activity) {
        snapshot.ui.active_activity.clone()
    } else {
        "connections".into()
    };
    let active_sidebar_pane = if is_sidebar_pane(&snapshot.ui.active_sidebar_pane) {
        snapshot.ui.active_sidebar_pane.clone()
    } else if active_activity == "settings" {
        "connections".into()
    } else {
        active_activity.clone()
    };
    let has_active_tab = active_tab.is_some();
    let active_bottom_panel_tab = if is_bottom_panel_tab(&snapshot.ui.active_bottom_panel_tab) {
        snapshot.ui.active_bottom_panel_tab.clone()
    } else {
        "results".into()
    };

    UiState {
        active_connection_id: active_connection.map(|item| item.id).unwrap_or_default(),
        active_environment_id: active_environment.map(|item| item.id).unwrap_or_default(),
        active_tab_id: active_tab.map(|item| item.id).unwrap_or_default(),
        explorer_filter: snapshot.ui.explorer_filter.clone(),
        explorer_view: if is_explorer_view(&snapshot.ui.explorer_view) {
            snapshot.ui.explorer_view.clone()
        } else {
            "structure".into()
        },
        active_activity,
        sidebar_collapsed: snapshot.ui.sidebar_collapsed,
        active_sidebar_pane,
        sidebar_width: clamp_sidebar_width(snapshot.ui.sidebar_width),
        bottom_panel_visible: snapshot.ui.bottom_panel_visible
            && (has_active_tab || active_bottom_panel_tab == "messages"),
        active_bottom_panel_tab,
        bottom_panel_height: clamp_bottom_panel_height(snapshot.ui.bottom_panel_height),
        right_drawer: if is_right_drawer(&snapshot.ui.right_drawer) {
            snapshot.ui.right_drawer.clone()
        } else {
            "none".into()
        },
        right_drawer_width: clamp_right_drawer_width(snapshot.ui.right_drawer_width),
    }
}

fn migrate_snapshot(mut snapshot: WorkspaceSnapshot) -> WorkspaceSnapshot {
    snapshot.schema_version = persistence::SCHEMA_VERSION;
    snapshot.adapter_manifests = adapters::manifests();
    strip_demo_records(&mut snapshot);

    for tab in &mut snapshot.tabs {
        tab.result = None;
    }

    for closed_tab in &mut snapshot.closed_tabs {
        closed_tab.tab.result = None;
    }

    snapshot.ui = normalize_ui_state(&snapshot);

    snapshot
}

fn strip_demo_records(snapshot: &mut WorkspaceSnapshot) {
    const DEMO_CONNECTIONS: &[&str] = &[
        "conn-analytics",
        "conn-orders",
        "conn-catalog",
        "conn-commerce",
        "conn-local-sqlite",
        "conn-cache",
    ];
    const DEMO_TABS: &[&str] = &[
        "tab-sql-ops",
        "tab-orders-audit",
        "tab-mongo-catalog",
        "tab-commerce-mysql",
        "tab-local-sqlite",
        "tab-redis-session",
    ];
    const DEMO_SAVED_WORK: &[&str] = &["saved-locks", "saved-hotkeys", "saved-catalog"];
    const DEMO_ENVIRONMENTS: &[&str] = &["env-dev", "env-uat", "env-prod"];

    snapshot
        .connections
        .retain(|connection| !DEMO_CONNECTIONS.contains(&connection.id.as_str()));
    snapshot
        .tabs
        .retain(|tab| !DEMO_TABS.contains(&tab.id.as_str()));
    snapshot
        .closed_tabs
        .retain(|tab| !DEMO_TABS.contains(&tab.tab.id.as_str()));
    snapshot
        .saved_work
        .retain(|item| !DEMO_SAVED_WORK.contains(&item.id.as_str()));
    snapshot
        .explorer_nodes
        .retain(|node| !node.id.starts_with("explorer-"));
    snapshot.guardrails.clear();

    let mut referenced_environments: Vec<String> = snapshot
        .connections
        .iter()
        .flat_map(|connection| connection.environment_ids.clone())
        .collect();
    referenced_environments.extend(snapshot.tabs.iter().map(|tab| tab.environment_id.clone()));
    referenced_environments.extend(
        snapshot
            .closed_tabs
            .iter()
            .map(|tab| tab.tab.environment_id.clone()),
    );
    referenced_environments.extend(
        snapshot
            .saved_work
            .iter()
            .filter_map(|item| item.environment_id.clone()),
    );

    snapshot.environments.retain(|environment| {
        !DEMO_ENVIRONMENTS.contains(&environment.id.as_str())
            || referenced_environments
                .iter()
                .any(|environment_id| environment_id == &environment.id)
    });
}

struct FixtureWorkspaceSeed {
    snapshot: WorkspaceSnapshot,
    secrets: Vec<(SecretRef, String)>,
}

struct FixtureConnectionSeed {
    profile: Option<&'static str>,
    id: &'static str,
    name: &'static str,
    engine: &'static str,
    family: &'static str,
    host: &'static str,
    port: Option<u16>,
    database: Option<&'static str>,
    use_sqlite_fixture: bool,
    username: Option<&'static str>,
    password: Option<&'static str>,
    auth_mechanism: Option<&'static str>,
    ssl_mode: Option<&'static str>,
    connection_string: Option<&'static str>,
    group: &'static str,
    color: &'static str,
    icon: &'static str,
    query_title: &'static str,
    query_text: &'static str,
    tags: &'static [&'static str],
}

fn fixture_debug_enabled() -> bool {
    std::env::var("UNIVERSALITY_FIXTURE_RUN")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn workspace_is_empty(snapshot: &WorkspaceSnapshot) -> bool {
    snapshot.connections.is_empty()
        && snapshot.environments.is_empty()
        && snapshot.tabs.is_empty()
        && snapshot.saved_work.is_empty()
}

fn fixture_workspace_seed() -> FixtureWorkspaceSeed {
    let profile_value = std::env::var("UNIVERSALITY_FIXTURE_PROFILE").ok();
    let sqlite_fixture = std::env::var("UNIVERSALITY_SQLITE_FIXTURE")
        .unwrap_or_else(|_| "tests/fixtures/sqlite/universality.sqlite3".into());
    fixture_workspace_seed_for_profile(profile_value.as_deref(), &sqlite_fixture)
}

fn fixture_workspace_seed_for_profile(
    profile_value: Option<&str>,
    sqlite_fixture: &str,
) -> FixtureWorkspaceSeed {
    let created_at = timestamp_now();
    let environments = fixture_environments(&created_at, sqlite_fixture);
    let seeds: Vec<FixtureConnectionSeed> = fixture_connection_seeds()
        .into_iter()
        .filter(|seed| fixture_profile_requested(seed.profile, profile_value))
        .collect();
    let mut secrets = Vec::new();
    let mut connections = Vec::new();

    for seed in &seeds {
        let (connection, secret) = build_fixture_connection(seed, sqlite_fixture, &created_at);
        if let Some(secret) = secret {
            secrets.push(secret);
        }
        connections.push(connection);
    }

    let tabs = connections
        .iter()
        .filter_map(|connection| {
            seeds
                .iter()
                .find(|seed| seed.id == connection.id)
                .map(|seed| fixture_query_tab(connection, seed, &created_at))
        })
        .collect::<Vec<_>>();
    let saved_work = connections
        .iter()
        .filter_map(|connection| {
            seeds
                .iter()
                .find(|seed| seed.id == connection.id)
                .map(|seed| fixture_saved_query(connection, seed, &created_at))
        })
        .chain(fixture_snippets(&created_at))
        .collect::<Vec<_>>();
    let closed_tabs = fixture_closed_tabs(&connections, &created_at);
    let active_connection_id = connections
        .first()
        .map(|connection| connection.id.clone())
        .unwrap_or_default();
    let active_tab_id = tabs.first().map(|tab| tab.id.clone()).unwrap_or_default();

    FixtureWorkspaceSeed {
        snapshot: WorkspaceSnapshot {
            schema_version: persistence::SCHEMA_VERSION,
            connections,
            environments,
            tabs,
            closed_tabs,
            saved_work,
            explorer_nodes: Vec::new(),
            adapter_manifests: adapters::manifests(),
            preferences: AppPreferences {
                theme: "dark".into(),
                telemetry: "opt-in".into(),
                lock_after_minutes: 15,
                safe_mode_enabled: true,
                command_palette_enabled: true,
            },
            guardrails: Vec::new(),
            lock_state: LockState {
                is_locked: false,
                locked_at: None,
            },
            ui: UiState {
                active_connection_id,
                active_environment_id: "env-fixtures".into(),
                active_tab_id,
                explorer_filter: String::new(),
                explorer_view: "structure".into(),
                active_activity: "connections".into(),
                sidebar_collapsed: false,
                active_sidebar_pane: "connections".into(),
                sidebar_width: 300,
                bottom_panel_visible: false,
                active_bottom_panel_tab: "results".into(),
                bottom_panel_height: 300,
                right_drawer: "none".into(),
                right_drawer_width: 380,
            },
            updated_at: created_at,
        },
        secrets,
    }
}

fn seed_fixture_secrets(secrets: &[(SecretRef, String)]) -> Result<(), CommandError> {
    if !security::using_file_secret_store() {
        return Err(CommandError::new(
            "fixture-secret-store",
            "Fixture workspace seeding requires UNIVERSALITY_SECRET_STORE=file.",
        ));
    }

    for (secret_ref, secret) in secrets {
        security::store_secret_value(secret_ref, secret)?;
    }

    Ok(())
}

fn fixture_profile_requested(seed_profile: Option<&str>, profile_value: Option<&str>) -> bool {
    match seed_profile {
        None => true,
        Some(seed_profile) => profile_value
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .any(|profile| profile == "all" || profile.eq_ignore_ascii_case(seed_profile)),
    }
}

fn fixture_environments(created_at: &str, sqlite_fixture: &str) -> Vec<EnvironmentProfile> {
    let mut variables = HashMap::new();
    variables.insert("FIXTURE_HOST".into(), "127.0.0.1".into());
    variables.insert("SQLITE_FIXTURE".into(), sqlite_fixture.into());

    vec![
        EnvironmentProfile {
            id: "env-fixtures".into(),
            label: "Fixtures".into(),
            color: "#2dbf9b".into(),
            risk: "low".into(),
            inherits_from: None,
            variables,
            sensitive_keys: Vec::new(),
            requires_confirmation: false,
            safe_mode: false,
            exportable: true,
            created_at: created_at.into(),
            updated_at: created_at.into(),
        },
        EnvironmentProfile {
            id: "env-fixtures-prod-sim".into(),
            label: "Fixture Prod Sim".into(),
            color: "#ec7b7b".into(),
            risk: "critical".into(),
            inherits_from: Some("env-fixtures".into()),
            variables: HashMap::new(),
            sensitive_keys: Vec::new(),
            requires_confirmation: true,
            safe_mode: true,
            exportable: true,
            created_at: created_at.into(),
            updated_at: created_at.into(),
        },
    ]
}

fn build_fixture_connection(
    seed: &FixtureConnectionSeed,
    _sqlite_fixture: &str,
    created_at: &str,
) -> (ConnectionProfile, Option<(SecretRef, String)>) {
    let database = if seed.use_sqlite_fixture {
        Some("${SQLITE_FIXTURE}".into())
    } else {
        seed.database.map(str::to_string)
    };
    let secret_ref = seed.password.map(|_| SecretRef {
        id: format!("secret-{}", seed.id),
        provider: "file".into(),
        service: "UniversalityFixture".into(),
        account: seed.id.into(),
        label: format!("{} fixture credential", seed.name),
    });
    let secret = secret_ref.clone().zip(seed.password.map(str::to_string));

    (
        ConnectionProfile {
            id: seed.id.into(),
            name: seed.name.into(),
            engine: seed.engine.into(),
            family: seed.family.into(),
            host: seed.host.into(),
            port: seed.port,
            database,
            connection_string: seed.connection_string.map(str::to_string),
            connection_mode: Some(
                if seed.use_sqlite_fixture {
                    "file"
                } else {
                    "host"
                }
                .into(),
            ),
            environment_ids: vec!["env-fixtures".into()],
            tags: seed.tags.iter().map(|tag| (*tag).to_string()).collect(),
            favorite: seed.profile.is_none(),
            read_only: false,
            icon: seed.icon.into(),
            color: Some(seed.color.into()),
            group: Some(seed.group.into()),
            notes: Some("Seeded only for fixture debug workspaces.".into()),
            auth: ConnectionAuth {
                username: seed.username.map(str::to_string),
                auth_mechanism: seed.auth_mechanism.map(str::to_string),
                ssl_mode: seed.ssl_mode.map(str::to_string),
                cloud_provider: None,
                principal: None,
                secret_ref,
            },
            created_at: created_at.into(),
            updated_at: created_at.into(),
        },
        secret,
    )
}

fn fixture_query_tab(
    connection: &ConnectionProfile,
    seed: &FixtureConnectionSeed,
    created_at: &str,
) -> QueryTabState {
    QueryTabState {
        id: format!("tab-{}", seed.id),
        title: seed.query_title.into(),
        connection_id: connection.id.clone(),
        environment_id: "env-fixtures".into(),
        family: connection.family.clone(),
        language: language_for_connection(connection),
        pinned: Some(seed.profile.is_none()),
        saved_query_id: Some(format!("saved-{}", seed.id)),
        editor_label: editor_label_for_connection(connection),
        query_text: seed.query_text.into(),
        status: "idle".into(),
        dirty: false,
        last_run_at: None,
        result: None,
        history: vec![QueryHistoryEntry {
            id: format!("history-{}", seed.id),
            query_text: seed.query_text.into(),
            executed_at: created_at.into(),
            status: "seeded".into(),
        }],
        error: None,
    }
}

fn fixture_saved_query(
    connection: &ConnectionProfile,
    seed: &FixtureConnectionSeed,
    created_at: &str,
) -> SavedWorkItem {
    SavedWorkItem {
        id: format!("saved-{}", seed.id),
        kind: "query".into(),
        name: format!("{} smoke query", seed.name),
        summary: format!("Fixture query for {}", seed.name),
        tags: seed.tags.iter().map(|tag| (*tag).to_string()).collect(),
        updated_at: created_at.into(),
        folder: Some(match seed.profile {
            Some(profile) => format!("Fixture Profiles/{profile}"),
            None => "Fixture Core".into(),
        }),
        favorite: Some(seed.profile.is_none()),
        connection_id: Some(connection.id.clone()),
        environment_id: Some("env-fixtures".into()),
        language: Some(language_for_connection(connection)),
        query_text: Some(seed.query_text.into()),
        snapshot_result_id: None,
    }
}

fn fixture_snippets(created_at: &str) -> impl Iterator<Item = SavedWorkItem> {
    [
        SavedWorkItem {
            id: "saved-fixture-sql-count-snippet".into(),
            kind: "snippet".into(),
            name: "SQL row-count smoke snippet".into(),
            summary: "Quick count pattern for fixture tables.".into(),
            tags: vec!["fixtures".into(), "sql".into()],
            updated_at: created_at.into(),
            folder: Some("Fixture Snippets".into()),
            favorite: Some(false),
            connection_id: None,
            environment_id: Some("env-fixtures".into()),
            language: Some("sql".into()),
            query_text: Some("select count(*) as row_count from <table_name>;".into()),
            snapshot_result_id: None,
        },
        SavedWorkItem {
            id: "saved-fixture-redis-scan-snippet".into(),
            kind: "snippet".into(),
            name: "Redis session scan snippet".into(),
            summary: "Bounded SCAN pattern for cache fixture keys.".into(),
            tags: vec!["fixtures".into(), "redis".into()],
            updated_at: created_at.into(),
            folder: Some("Fixture Snippets".into()),
            favorite: Some(false),
            connection_id: Some("fixture-redis".into()),
            environment_id: Some("env-fixtures".into()),
            language: Some("redis".into()),
            query_text: Some("SCAN 0 MATCH session:* COUNT 25".into()),
            snapshot_result_id: None,
        },
    ]
    .into_iter()
}

fn fixture_closed_tabs(
    connections: &[ConnectionProfile],
    created_at: &str,
) -> Vec<ClosedQueryTabSnapshot> {
    let Some(connection) = connections
        .iter()
        .find(|connection| connection.id == "fixture-postgresql")
        .or_else(|| connections.first())
    else {
        return Vec::new();
    };

    vec![ClosedQueryTabSnapshot {
        tab: QueryTabState {
            id: "tab-fixture-recovery-example".into(),
            title: "Recovered fixture scratch.sql".into(),
            connection_id: connection.id.clone(),
            environment_id: "env-fixtures".into(),
            family: connection.family.clone(),
            language: language_for_connection(connection),
            pinned: None,
            saved_query_id: None,
            editor_label: editor_label_for_connection(connection),
            query_text: "select count(*) as table_count from observability.table_health;".into(),
            status: "idle".into(),
            dirty: true,
            last_run_at: None,
            result: None,
            history: vec![QueryHistoryEntry {
                id: "history-fixture-recovery-example".into(),
                query_text: "select count(*) as table_count from observability.table_health;"
                    .into(),
                executed_at: created_at.into(),
                status: "recovered".into(),
            }],
            error: None,
        },
        closed_at: created_at.into(),
        close_reason: "fixture-recovery-example".into(),
    }]
}

fn fixture_connection_seeds() -> Vec<FixtureConnectionSeed> {
    vec![
        FixtureConnectionSeed {
            profile: None,
            id: "fixture-postgresql",
            name: "Fixture PostgreSQL",
            engine: "postgresql",
            family: "sql",
            host: "127.0.0.1",
            port: Some(54329),
            database: Some("universality"),
            use_sqlite_fixture: false,
            username: Some("universality"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: Some("disable"),
            connection_string: None,
            group: "Core Fixtures",
            color: "#2dbf9b",
            icon: "postgresql",
            query_title: "Fixture PostgreSQL.sql",
            query_text: "select table_name, rows_estimate, last_vacuum from observability.table_health order by rows_estimate desc limit 50;",
            tags: &["fixtures", "core", "sql"],
        },
        FixtureConnectionSeed {
            profile: None,
            id: "fixture-sqlserver",
            name: "Fixture SQL Server",
            engine: "sqlserver",
            family: "sql",
            host: "127.0.0.1",
            port: Some(14333),
            database: Some("universality"),
            use_sqlite_fixture: false,
            username: Some("sa"),
            password: Some("Universality_pwd_123"),
            auth_mechanism: Some("sql-server"),
            ssl_mode: Some("trust"),
            connection_string: None,
            group: "Core Fixtures",
            color: "#4aa3ff",
            icon: "sqlserver",
            query_title: "Fixture SQL Server.sql",
            query_text: "select top 50 order_id, status, updated_at from dbo.orders order by updated_at desc;",
            tags: &["fixtures", "core", "sql"],
        },
        FixtureConnectionSeed {
            profile: None,
            id: "fixture-mysql",
            name: "Fixture MySQL",
            engine: "mysql",
            family: "sql",
            host: "127.0.0.1",
            port: Some(33060),
            database: Some("commerce"),
            use_sqlite_fixture: false,
            username: Some("universality"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: Some("disable"),
            connection_string: None,
            group: "Core Fixtures",
            color: "#f0a95b",
            icon: "mysql",
            query_title: "Fixture MySQL.sql",
            query_text: "select sku, inventory_available, updated_at from inventory_items order by updated_at desc limit 50;",
            tags: &["fixtures", "core", "sql"],
        },
        FixtureConnectionSeed {
            profile: None,
            id: "fixture-sqlite",
            name: "Fixture SQLite",
            engine: "sqlite",
            family: "sql",
            host: "localhost",
            port: None,
            database: None,
            use_sqlite_fixture: true,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Core Fixtures",
            color: "#c9a86a",
            icon: "sqlite",
            query_title: "Fixture SQLite.sql",
            query_text: "select id, name, status, updated_at from accounts order by id;",
            tags: &["fixtures", "core", "local"],
        },
        FixtureConnectionSeed {
            profile: None,
            id: "fixture-mongodb",
            name: "Fixture MongoDB",
            engine: "mongodb",
            family: "document",
            host: "127.0.0.1",
            port: Some(27018),
            database: Some("catalog"),
            use_sqlite_fixture: false,
            username: Some("universality"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: None,
            connection_string: None,
            group: "Core Fixtures",
            color: "#5abf6f",
            icon: "mongodb",
            query_title: "Fixture MongoDB.json",
            query_text: "{\n  \"collection\": \"products\",\n  \"filter\": {},\n  \"limit\": 50\n}",
            tags: &["fixtures", "core", "document"],
        },
        FixtureConnectionSeed {
            profile: None,
            id: "fixture-redis",
            name: "Fixture Redis",
            engine: "redis",
            family: "keyvalue",
            host: "127.0.0.1",
            port: Some(6380),
            database: Some("0"),
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Core Fixtures",
            color: "#d15b5b",
            icon: "redis",
            query_title: "Fixture Redis.redis",
            query_text: "SCAN 0 MATCH session:* COUNT 25",
            tags: &["fixtures", "core", "cache"],
        },
        FixtureConnectionSeed {
            profile: Some("cache"),
            id: "fixture-valkey",
            name: "Fixture Valkey",
            engine: "valkey",
            family: "keyvalue",
            host: "127.0.0.1",
            port: Some(6381),
            database: Some("0"),
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Cache Fixtures",
            color: "#c9463c",
            icon: "valkey",
            query_title: "Fixture Valkey.redis",
            query_text: "SCAN 0 MATCH session:* COUNT 25",
            tags: &["fixtures", "cache"],
        },
        FixtureConnectionSeed {
            profile: Some("cache"),
            id: "fixture-memcached",
            name: "Fixture Memcached",
            engine: "memcached",
            family: "keyvalue",
            host: "127.0.0.1",
            port: Some(11212),
            database: None,
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Cache Fixtures",
            color: "#8ac16f",
            icon: "memcached",
            query_title: "Fixture Memcached.txt",
            query_text: "stats",
            tags: &["fixtures", "cache"],
        },
        FixtureConnectionSeed {
            profile: Some("sqlplus"),
            id: "fixture-mariadb",
            name: "Fixture MariaDB",
            engine: "mariadb",
            family: "sql",
            host: "127.0.0.1",
            port: Some(33061),
            database: Some("commerce"),
            use_sqlite_fixture: false,
            username: Some("universality"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: Some("disable"),
            connection_string: None,
            group: "SQL+ Fixtures",
            color: "#b98edb",
            icon: "mariadb",
            query_title: "Fixture MariaDB.sql",
            query_text: "select order_id, account_id, status, total_amount, updated_at from orders order by updated_at desc limit 50;",
            tags: &["fixtures", "sqlplus", "sql"],
        },
        FixtureConnectionSeed {
            profile: Some("sqlplus"),
            id: "fixture-cockroachdb",
            name: "Fixture CockroachDB",
            engine: "cockroachdb",
            family: "sql",
            host: "127.0.0.1",
            port: Some(26257),
            database: Some("universality"),
            use_sqlite_fixture: false,
            username: Some("root"),
            password: None,
            auth_mechanism: Some("password"),
            ssl_mode: Some("disable"),
            connection_string: None,
            group: "SQL+ Fixtures",
            color: "#6eb7ff",
            icon: "cockroachdb",
            query_title: "Fixture CockroachDB.sql",
            query_text: "select id, name, status, updated_at from accounts order by id limit 50;",
            tags: &["fixtures", "sqlplus", "sql"],
        },
        FixtureConnectionSeed {
            profile: Some("sqlplus"),
            id: "fixture-timescaledb",
            name: "Fixture TimescaleDB",
            engine: "timescaledb",
            family: "timeseries",
            host: "127.0.0.1",
            port: Some(54330),
            database: Some("metrics"),
            use_sqlite_fixture: false,
            username: Some("universality"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: Some("disable"),
            connection_string: None,
            group: "SQL+ Fixtures",
            color: "#55a8e6",
            icon: "timescaledb",
            query_title: "Fixture TimescaleDB.sql",
            query_text: "select time, account_id, region, orders, latency_ms from order_metrics order by time desc limit 50;",
            tags: &["fixtures", "sqlplus", "timeseries"],
        },
        FixtureConnectionSeed {
            profile: Some("analytics"),
            id: "fixture-clickhouse",
            name: "Fixture ClickHouse",
            engine: "clickhouse",
            family: "warehouse",
            host: "127.0.0.1",
            port: Some(8124),
            database: Some("analytics"),
            use_sqlite_fixture: false,
            username: Some("universality"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: None,
            connection_string: None,
            group: "Analytics Fixtures",
            color: "#f3d74f",
            icon: "clickhouse",
            query_title: "Fixture ClickHouse.sql",
            query_text: "select event_time, account_id, event_type, latency_ms from analytics.events order by event_time desc limit 50;",
            tags: &["fixtures", "analytics", "warehouse"],
        },
        FixtureConnectionSeed {
            profile: Some("analytics"),
            id: "fixture-influxdb",
            name: "Fixture InfluxDB",
            engine: "influxdb",
            family: "timeseries",
            host: "127.0.0.1",
            port: Some(8087),
            database: Some("metrics"),
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Analytics Fixtures",
            color: "#8d74ff",
            icon: "influxdb",
            query_title: "Fixture InfluxDB.influxql",
            query_text: "SELECT * FROM order_latency LIMIT 25",
            tags: &["fixtures", "analytics", "timeseries"],
        },
        FixtureConnectionSeed {
            profile: Some("analytics"),
            id: "fixture-prometheus",
            name: "Fixture Prometheus",
            engine: "prometheus",
            family: "timeseries",
            host: "127.0.0.1",
            port: Some(9091),
            database: None,
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Analytics Fixtures",
            color: "#e87941",
            icon: "prometheus",
            query_title: "Fixture Prometheus.promql",
            query_text: "up",
            tags: &["fixtures", "analytics", "timeseries"],
        },
        FixtureConnectionSeed {
            profile: Some("search"),
            id: "fixture-opensearch",
            name: "Fixture OpenSearch",
            engine: "opensearch",
            family: "search",
            host: "127.0.0.1",
            port: Some(9201),
            database: None,
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Search Fixtures",
            color: "#5cb3ff",
            icon: "opensearch",
            query_title: "Fixture OpenSearch.json",
            query_text: "{\n  \"index\": \"orders\",\n  \"query\": { \"match_all\": {} },\n  \"size\": 25\n}",
            tags: &["fixtures", "search"],
        },
        FixtureConnectionSeed {
            profile: Some("search"),
            id: "fixture-elasticsearch",
            name: "Fixture Elasticsearch",
            engine: "elasticsearch",
            family: "search",
            host: "127.0.0.1",
            port: Some(9202),
            database: None,
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Search Fixtures",
            color: "#f0bf4f",
            icon: "elasticsearch",
            query_title: "Fixture Elasticsearch.json",
            query_text: "{\n  \"index\": \"orders\",\n  \"query\": { \"match_all\": {} },\n  \"size\": 25\n}",
            tags: &["fixtures", "search"],
        },
        FixtureConnectionSeed {
            profile: Some("graph"),
            id: "fixture-neo4j",
            name: "Fixture Neo4j",
            engine: "neo4j",
            family: "graph",
            host: "127.0.0.1",
            port: Some(7688),
            database: Some("neo4j"),
            use_sqlite_fixture: false,
            username: Some("neo4j"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: None,
            connection_string: None,
            group: "Graph Fixtures",
            color: "#4f8dff",
            icon: "neo4j",
            query_title: "Fixture Neo4j.cypher",
            query_text: "MATCH (n) RETURN n LIMIT 25",
            tags: &["fixtures", "graph"],
        },
        FixtureConnectionSeed {
            profile: Some("graph"),
            id: "fixture-arangodb",
            name: "Fixture ArangoDB",
            engine: "arango",
            family: "graph",
            host: "127.0.0.1",
            port: Some(8529),
            database: Some("universality"),
            use_sqlite_fixture: false,
            username: Some("root"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: None,
            connection_string: None,
            group: "Graph Fixtures",
            color: "#75b84d",
            icon: "arangodb",
            query_title: "Fixture ArangoDB.aql",
            query_text: "FOR doc IN accounts LIMIT 25 RETURN doc",
            tags: &["fixtures", "graph"],
        },
        FixtureConnectionSeed {
            profile: Some("graph"),
            id: "fixture-janusgraph",
            name: "Fixture JanusGraph",
            engine: "janusgraph",
            family: "graph",
            host: "127.0.0.1",
            port: Some(8183),
            database: None,
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Graph Fixtures",
            color: "#9a7bd7",
            icon: "janusgraph",
            query_title: "Fixture JanusGraph.gremlin",
            query_text: "g.V().limit(25)",
            tags: &["fixtures", "graph"],
        },
        FixtureConnectionSeed {
            profile: Some("widecolumn"),
            id: "fixture-cassandra",
            name: "Fixture Cassandra",
            engine: "cassandra",
            family: "widecolumn",
            host: "127.0.0.1",
            port: Some(9043),
            database: Some("universality"),
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: None,
            group: "Wide Column Fixtures",
            color: "#64a6d8",
            icon: "cassandra",
            query_title: "Fixture Cassandra.cql",
            query_text: "select * from universality.orders limit 25;",
            tags: &["fixtures", "widecolumn"],
        },
        FixtureConnectionSeed {
            profile: Some("oracle"),
            id: "fixture-oracle",
            name: "Fixture Oracle",
            engine: "oracle",
            family: "sql",
            host: "127.0.0.1",
            port: Some(1522),
            database: Some("FREEPDB1"),
            use_sqlite_fixture: false,
            username: Some("universality"),
            password: Some("universality"),
            auth_mechanism: Some("password"),
            ssl_mode: None,
            connection_string: None,
            group: "Oracle Fixtures",
            color: "#d85f4f",
            icon: "oracle",
            query_title: "Fixture Oracle.sql",
            query_text: "select order_id, account_id, status, total_amount, updated_at from orders fetch first 50 rows only",
            tags: &["fixtures", "oracle", "sql"],
        },
        FixtureConnectionSeed {
            profile: Some("cloud-contract"),
            id: "fixture-dynamodb",
            name: "Fixture DynamoDB Local",
            engine: "dynamodb",
            family: "widecolumn",
            host: "127.0.0.1",
            port: Some(8001),
            database: Some("sharedDb"),
            use_sqlite_fixture: false,
            username: Some("local"),
            password: Some("local"),
            auth_mechanism: Some("local"),
            ssl_mode: None,
            connection_string: None,
            group: "Cloud Contract Fixtures",
            color: "#5487e8",
            icon: "dynamodb",
            query_title: "Fixture DynamoDB.json",
            query_text: "{\n  \"table\": \"orders\",\n  \"limit\": 25\n}",
            tags: &["fixtures", "cloud-contract", "widecolumn"],
        },
        FixtureConnectionSeed {
            profile: Some("cloud-contract"),
            id: "fixture-bigquery",
            name: "Fixture BigQuery Mock",
            engine: "bigquery",
            family: "warehouse",
            host: "127.0.0.1",
            port: Some(19050),
            database: Some("analytics"),
            use_sqlite_fixture: false,
            username: Some("universality-project"),
            password: Some("fixture-token"),
            auth_mechanism: Some("mock-token"),
            ssl_mode: None,
            connection_string: Some("http://127.0.0.1:19050"),
            group: "Cloud Contract Fixtures",
            color: "#669df6",
            icon: "bigquery",
            query_title: "Fixture BigQuery.sql",
            query_text: "select * from analytics.orders limit 25;",
            tags: &["fixtures", "cloud-contract", "warehouse"],
        },
        FixtureConnectionSeed {
            profile: Some("cloud-contract"),
            id: "fixture-snowflake",
            name: "Fixture Snowflake Mock",
            engine: "snowflake",
            family: "warehouse",
            host: "127.0.0.1",
            port: Some(19060),
            database: Some("UNIVERSALITY"),
            use_sqlite_fixture: false,
            username: Some("PUBLIC"),
            password: Some("fixture-token"),
            auth_mechanism: Some("mock-token"),
            ssl_mode: None,
            connection_string: Some("http://127.0.0.1:19060"),
            group: "Cloud Contract Fixtures",
            color: "#7dd3fc",
            icon: "snowflake",
            query_title: "Fixture Snowflake.sql",
            query_text: "select * from orders limit 25;",
            tags: &["fixtures", "cloud-contract", "warehouse"],
        },
        FixtureConnectionSeed {
            profile: Some("cloud-contract"),
            id: "fixture-cosmosdb",
            name: "Fixture Cosmos DB Mock",
            engine: "cosmosdb",
            family: "document",
            host: "127.0.0.1",
            port: Some(19070),
            database: Some("universality"),
            use_sqlite_fixture: false,
            username: None,
            password: Some("fixture-token"),
            auth_mechanism: Some("mock-token"),
            ssl_mode: None,
            connection_string: Some("http://127.0.0.1:19070"),
            group: "Cloud Contract Fixtures",
            color: "#58a6ff",
            icon: "cosmosdb",
            query_title: "Fixture Cosmos DB.sql",
            query_text: "select top 25 * from c",
            tags: &["fixtures", "cloud-contract", "document"],
        },
        FixtureConnectionSeed {
            profile: Some("cloud-contract"),
            id: "fixture-neptune",
            name: "Fixture Neptune Mock",
            engine: "neptune",
            family: "graph",
            host: "127.0.0.1",
            port: Some(19080),
            database: None,
            use_sqlite_fixture: false,
            username: None,
            password: None,
            auth_mechanism: None,
            ssl_mode: None,
            connection_string: Some("http://127.0.0.1:19080"),
            group: "Cloud Contract Fixtures",
            color: "#64d2ff",
            icon: "neptune",
            query_title: "Fixture Neptune.gremlin",
            query_text: "g.V().limit(25)",
            tags: &["fixtures", "cloud-contract", "graph"],
        },
    ]
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

fn reorder_query_tabs_in_place(
    tabs: &mut Vec<QueryTabState>,
    ordered_tab_ids: Vec<String>,
) -> Result<(), CommandError> {
    let current_ids = tabs
        .iter()
        .map(|tab| tab.id.as_str())
        .collect::<HashSet<_>>();
    let requested_ids = ordered_tab_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();

    if ordered_tab_ids.len() != tabs.len()
        || requested_ids.len() != ordered_tab_ids.len()
        || requested_ids != current_ids
    {
        return Err(CommandError::new(
            "tab-reorder-invalid",
            "Tab order was rejected because it does not match the open query tabs.",
        ));
    }

    let mut tabs_by_id = tabs
        .drain(..)
        .map(|tab| (tab.id.clone(), tab))
        .collect::<HashMap<_, _>>();
    *tabs = ordered_tab_ids
        .into_iter()
        .filter_map(|tab_id| tabs_by_id.remove(&tab_id))
        .collect();

    Ok(())
}

pub fn blank_workspace_snapshot() -> WorkspaceSnapshot {
    let created_at = timestamp_now();

    WorkspaceSnapshot {
        schema_version: persistence::SCHEMA_VERSION,
        connections: Vec::new(),
        environments: Vec::new(),
        tabs: Vec::new(),
        closed_tabs: Vec::new(),
        saved_work: Vec::new(),
        explorer_nodes: Vec::new(),
        adapter_manifests: adapters::manifests(),
        preferences: AppPreferences {
            theme: "dark".into(),
            telemetry: "opt-in".into(),
            lock_after_minutes: 15,
            safe_mode_enabled: true,
            command_palette_enabled: true,
        },
        guardrails: Vec::new(),
        lock_state: LockState {
            is_locked: false,
            locked_at: None,
        },
        ui: UiState {
            active_connection_id: String::new(),
            active_environment_id: String::new(),
            active_tab_id: String::new(),
            explorer_filter: String::new(),
            explorer_view: "structure".into(),
            active_activity: "connections".into(),
            sidebar_collapsed: false,
            active_sidebar_pane: "connections".into(),
            sidebar_width: 280,
            bottom_panel_visible: false,
            active_bottom_panel_tab: "results".into(),
            bottom_panel_height: 260,
            right_drawer: "none".into(),
            right_drawer_width: 360,
        },
        updated_at: created_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf, sync::Mutex as TestMutex};

    static ENV_LOCK: TestMutex<()> = TestMutex::new(());

    #[test]
    fn normal_blank_workspace_has_no_fixture_user_data() {
        let snapshot = blank_workspace_snapshot();

        assert!(workspace_is_empty(&snapshot));
        assert!(snapshot.connections.is_empty());
        assert!(snapshot.environments.is_empty());
        assert!(snapshot.tabs.is_empty());
        assert!(snapshot.saved_work.is_empty());
    }

    #[test]
    fn fixture_core_seed_preloads_connections_tabs_and_saved_work() {
        let seed = fixture_workspace_seed_for_profile(None, "fixture.sqlite3");

        assert!(!workspace_is_empty(&seed.snapshot));
        assert!(seed
            .snapshot
            .connections
            .iter()
            .any(|connection| connection.name == "Fixture PostgreSQL"));
        assert!(seed
            .snapshot
            .connections
            .iter()
            .any(|connection| connection.name == "Fixture Redis"));
        assert!(seed
            .snapshot
            .tabs
            .iter()
            .any(|tab| tab.query_text.contains("observability.table_health")));
        assert!(seed
            .snapshot
            .saved_work
            .iter()
            .any(|item| item.name == "Fixture PostgreSQL smoke query"));
        assert!(seed.snapshot.explorer_nodes.is_empty());
    }

    #[test]
    fn fixture_profile_seed_includes_selected_profile_without_all_profiles() {
        let seed = fixture_workspace_seed_for_profile(Some("sqlplus"), "fixture.sqlite3");

        assert!(seed
            .snapshot
            .connections
            .iter()
            .any(|connection| connection.name == "Fixture MariaDB"));
        assert!(!seed
            .snapshot
            .connections
            .iter()
            .any(|connection| connection.name == "Fixture Neo4j"));
    }

    #[test]
    fn fixture_all_seed_includes_every_documented_profile() {
        let seed = fixture_workspace_seed_for_profile(Some("all"), "fixture.sqlite3");
        let connection_names = seed
            .snapshot
            .connections
            .iter()
            .map(|connection| connection.name.as_str())
            .collect::<Vec<_>>();

        for expected in [
            "Fixture Valkey",
            "Fixture TimescaleDB",
            "Fixture ClickHouse",
            "Fixture OpenSearch",
            "Fixture Neo4j",
            "Fixture Cassandra",
            "Fixture Oracle",
            "Fixture BigQuery Mock",
        ] {
            assert!(
                connection_names.contains(&expected),
                "missing fixture connection {expected}"
            );
        }
    }

    #[test]
    fn existing_debug_workspace_is_not_empty_and_should_be_preserved() {
        let mut snapshot = blank_workspace_snapshot();
        snapshot.connections.push(ConnectionProfile {
            id: "user-fixture-debug-connection".into(),
            name: "My debug connection".into(),
            engine: "sqlite".into(),
            family: "sql".into(),
            host: "localhost".into(),
            port: None,
            database: Some("local.sqlite3".into()),
            connection_string: None,
            connection_mode: Some("file".into()),
            environment_ids: Vec::new(),
            tags: Vec::new(),
            favorite: false,
            read_only: false,
            icon: "sqlite".into(),
            color: None,
            group: None,
            notes: None,
            auth: ConnectionAuth::default(),
            created_at: timestamp_now(),
            updated_at: timestamp_now(),
        });

        assert!(!workspace_is_empty(&snapshot));
    }

    #[test]
    fn fixture_workspace_json_contains_secret_refs_but_never_raw_passwords() {
        let seed = fixture_workspace_seed_for_profile(Some("all"), "fixture.sqlite3");
        let serialized = serde_json::to_string(&seed.snapshot).expect("serialize fixture snapshot");

        for raw_secret in ["Universality_pwd_123", "fixture-token"] {
            assert!(
                !serialized.contains(raw_secret),
                "workspace JSON leaked {raw_secret}"
            );
        }
        assert!(serialized.contains("secret-fixture-sqlserver"));
        assert!(serialized.contains("secret-fixture-bigquery"));
    }

    #[test]
    fn fixture_secrets_are_written_to_file_secret_store() {
        let _guard = ENV_LOCK.lock().expect("env test lock");
        let path = temp_secret_file_path();
        std::env::set_var("UNIVERSALITY_SECRET_STORE", "file");
        std::env::set_var("UNIVERSALITY_SECRET_FILE", &path);

        let seed = fixture_workspace_seed_for_profile(Some("cloud-contract"), "fixture.sqlite3");
        seed_fixture_secrets(&seed.secrets).expect("store fixture secrets");
        let secret_file = fs::read_to_string(&path).expect("read fixture secrets file");

        assert!(secret_file.contains("UniversalityFixture:fixture-sqlserver"));
        assert!(secret_file.contains("Universality_pwd_123"));
        assert!(secret_file.contains("fixture-token"));

        std::env::remove_var("UNIVERSALITY_SECRET_STORE");
        std::env::remove_var("UNIVERSALITY_SECRET_FILE");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn tab_reorder_accepts_same_tab_set_and_preserves_requested_order() {
        let mut tabs = tabs_for_reorder_tests();

        reorder_query_tabs_in_place(
            &mut tabs,
            vec!["tab-three".into(), "tab-one".into(), "tab-two".into()],
        )
        .expect("valid reorder");

        assert_eq!(
            tabs.iter().map(|tab| tab.id.as_str()).collect::<Vec<_>>(),
            vec!["tab-three", "tab-one", "tab-two"]
        );
    }

    #[test]
    fn tab_reorder_rejects_duplicate_missing_or_unknown_ids() {
        for order in [
            vec!["tab-one", "tab-one", "tab-two"],
            vec!["tab-one", "tab-two"],
            vec!["tab-one", "tab-two", "tab-unknown"],
        ] {
            let mut tabs = tabs_for_reorder_tests();

            assert!(reorder_query_tabs_in_place(
                &mut tabs,
                order.into_iter().map(String::from).collect(),
            )
            .is_err());
            assert_eq!(
                tabs.iter().map(|tab| tab.id.as_str()).collect::<Vec<_>>(),
                vec!["tab-one", "tab-two", "tab-three"]
            );
        }
    }

    fn tabs_for_reorder_tests() -> Vec<QueryTabState> {
        ["tab-one", "tab-two", "tab-three"]
            .into_iter()
            .map(|id| QueryTabState {
                id: id.into(),
                title: id.into(),
                ..QueryTabState::default()
            })
            .collect()
    }

    fn temp_secret_file_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "universality-fixture-secrets-{}.json",
            generate_id("test")
        ))
    }
}
