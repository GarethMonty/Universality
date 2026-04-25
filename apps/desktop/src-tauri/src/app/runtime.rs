use std::{
    collections::{BTreeMap, HashMap},
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
            ClosedQueryTabSnapshot, ConnectionProfile, ConnectionTestRequest, ConnectionTestResult,
            DiagnosticsCounts, DiagnosticsReport, EnvironmentProfile, ExecutionRequest,
            ExecutionResponse, ExplorerInspectRequest, ExplorerInspectResponse, ExplorerRequest,
            ExplorerResponse, ExportBundle, LockState, OperationManifestRequest,
            OperationManifestResponse, OperationPlanRequest, OperationPlanResponse,
            PermissionInspectionRequest, PermissionInspectionResponse, QueryExecutionNotice,
            QueryHistoryEntry, QueryTabState, ResolvedConnectionProfile, ResolvedEnvironment,
            ResultPageRequest, ResultPageResponse, SavedWorkItem, StructureRequest,
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
        let snapshot = persistence::load_snapshot(&app)
            .ok()
            .flatten()
            .map(migrate_snapshot)
            .unwrap_or_else(blank_workspace_snapshot);
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
            app_version: "0.2.0".into(),
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
        let mut title = format!("{prefix}_{index}.{extension}");

        while self.snapshot.tabs.iter().any(|tab| tab.title == title) {
            index += 1;
            title = format!("{prefix}_{index}.{extension}");
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
        "document" => ("MongoQuery", "json"),
        "keyvalue" => ("RedisConsole", "redis"),
        _ => ("SQLQuery", "sql"),
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
    matches!(value, "none" | "connection" | "inspection" | "diagnostics")
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
        bottom_panel_visible: snapshot.ui.bottom_panel_visible && has_active_tab,
        active_bottom_panel_tab: if is_bottom_panel_tab(&snapshot.ui.active_bottom_panel_tab) {
            snapshot.ui.active_bottom_panel_tab.clone()
        } else {
            "results".into()
        },
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
