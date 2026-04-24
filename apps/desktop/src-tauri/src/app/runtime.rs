use std::{collections::HashMap, sync::Mutex};

use sha2::{Digest, Sha256};
use tauri::AppHandle;

use crate::{
    adapters,
    domain::{
        error::CommandError,
        models::{
            AppHealth, AppPreferences, BootstrapPayload, CancelExecutionRequest,
            CancelExecutionResult, ConnectionAuth, ConnectionProfile, ConnectionTestRequest,
            ConnectionTestResult, DiagnosticsCounts, DiagnosticsReport, EnvironmentProfile,
            ExecutionRequest, ExecutionResponse, ExplorerInspectRequest, ExplorerInspectResponse,
            ExplorerNode, ExplorerRequest, ExplorerResponse, ExportBundle, GuardrailDecision,
            LockState, QueryExecutionNotice, QueryHistoryEntry, QueryTabState,
            ResolvedConnectionProfile, ResolvedEnvironment, SavedWorkItem, SecretRef, UiState,
            UpdateUiStateRequest, UserFacingError, WorkspaceSnapshot,
        },
    },
    persistence,
    security::{self, KeyringSecretStore, SecretStore},
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
            .unwrap_or_else(seed_snapshot);
        let managed = Self { app, snapshot };
        let _ = persistence::save_snapshot(&managed.app, &sanitize_snapshot(&managed.snapshot));
        managed
    }

    pub fn health(&self) -> AppHealth {
        AppHealth::desktop("keyring")
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
        let tab = self
            .snapshot
            .tabs
            .iter()
            .find(|item| item.connection_id == connection.id)
            .cloned()
            .ok_or_else(|| CommandError::new("tab-missing", "No tab exists for the connection."))?;
        self.snapshot.ui.active_connection_id = connection.id;
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
        let tab = QueryTabState {
            id: generate_id("tab"),
            title: format!("{} scratch", connection.name),
            connection_id: connection.id.clone(),
            environment_id: connection
                .environment_ids
                .first()
                .cloned()
                .unwrap_or_else(|| "env-dev".into()),
            family: connection.family.clone(),
            language: if connection.family == "document" {
                "mongodb".into()
            } else if connection.family == "keyvalue" {
                "redis".into()
            } else {
                "sql".into()
            },
            pinned: None,
            saved_query_id: None,
            editor_label: if connection.family == "document" {
                "Document query".into()
            } else if connection.family == "keyvalue" {
                "Redis console".into()
            } else {
                "SQL editor".into()
            },
            query_text: default_query_text(&connection),
            status: "idle".into(),
            dirty: true,
            last_run_at: None,
            result: None,
            history: Vec::new(),
            error: None,
        };
        self.snapshot.tabs.push(tab.clone());
        self.snapshot.ui.active_connection_id = tab.connection_id;
        self.snapshot.ui.active_environment_id = tab.environment_id;
        self.snapshot.ui.active_tab_id = tab.id;
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

    pub fn upsert_saved_work(
        &mut self,
        mut item: SavedWorkItem,
    ) -> Result<BootstrapPayload, CommandError> {
        self.ensure_unlocked()?;
        item.updated_at = timestamp_now();

        if let Some(index) = self
            .snapshot
            .saved_work
            .iter()
            .position(|existing| existing.id == item.id)
        {
            self.snapshot.saved_work[index] = item;
        } else {
            self.snapshot.saved_work.push(item);
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
        let store = KeyringSecretStore;
        let interpolate = |value: &str| interpolate_value(value, &resolved_environment.variables);
        let password = match &profile.auth.secret_ref {
            Some(secret_ref) => store.resolve_secret(secret_ref).ok(),
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

        if let Some(explorer_filter) = patch.explorer_filter {
            self.snapshot.ui.explorer_filter = explorer_filter;
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

    sanitized
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
    match connection.family.as_str() {
        "document" => "{\n  \"collection\": \"products\",\n  \"pipeline\": [\n    { \"$match\": {} },\n    { \"$limit\": 50 }\n  ]\n}".to_string(),
        "keyvalue" => "SCAN 0 MATCH session:* COUNT 25".into(),
        _ => "select 1;".into(),
    }
}

fn language_for_connection(connection: &ConnectionProfile) -> String {
    match connection.family.as_str() {
        "document" => "mongodb".into(),
        "keyvalue" => "redis".into(),
        _ => "sql".into(),
    }
}

fn editor_label_for_connection(connection: &ConnectionProfile) -> String {
    match connection.family.as_str() {
        "document" => "Document query".into(),
        "keyvalue" => "Redis console".into(),
        _ => "SQL editor".into(),
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
        "connections" | "explorer" | "saved-work" | "search" | "settings"
    )
}

fn is_sidebar_pane(value: &str) -> bool {
    matches!(value, "connections" | "explorer" | "saved-work" | "search")
}

fn is_bottom_panel_tab(value: &str) -> bool {
    matches!(value, "results" | "messages" | "details")
}

fn is_right_drawer(value: &str) -> bool {
    matches!(value, "none" | "connection" | "inspection" | "diagnostics")
}

fn clamp_bottom_panel_height(value: u32) -> u32 {
    value.clamp(180, 420)
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

    UiState {
        active_connection_id: active_connection.map(|item| item.id).unwrap_or_default(),
        active_environment_id: active_environment.map(|item| item.id).unwrap_or_default(),
        active_tab_id: active_tab.map(|item| item.id).unwrap_or_default(),
        explorer_filter: snapshot.ui.explorer_filter.clone(),
        active_activity,
        sidebar_collapsed: snapshot.ui.sidebar_collapsed,
        active_sidebar_pane,
        bottom_panel_visible: snapshot.ui.bottom_panel_visible,
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
    }
}

fn migrate_snapshot(mut snapshot: WorkspaceSnapshot) -> WorkspaceSnapshot {
    snapshot.schema_version = persistence::SCHEMA_VERSION;
    snapshot.adapter_manifests = adapters::manifests();

    if snapshot.explorer_nodes.is_empty() {
        snapshot.explorer_nodes = seed_snapshot().explorer_nodes;
    }

    for tab in &mut snapshot.tabs {
        tab.result = None;
    }

    if snapshot.connections.is_empty()
        || snapshot.environments.is_empty()
        || snapshot.tabs.is_empty()
    {
        return seed_snapshot();
    }

    snapshot.ui = normalize_ui_state(&snapshot);

    snapshot
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

pub fn seed_snapshot() -> WorkspaceSnapshot {
    let created_at = "2026-04-23T18:30:00.000Z".to_string();
    let connections = vec![
        ConnectionProfile {
            id: "conn-analytics".into(),
            name: "Analytics Postgres".into(),
            engine: "postgresql".into(),
            family: "sql".into(),
            host: "${DB_HOST}".into(),
            port: Some(5432),
            database: Some("${DB_NAME}".into()),
            connection_string: None,
            environment_ids: vec!["env-dev".into(), "env-prod".into()],
            tags: vec!["analytics".into(), "primary".into()],
            favorite: true,
            read_only: false,
            icon: "PG".into(),
            color: None,
            group: Some("Platform".into()),
            notes: None,
            auth: ConnectionAuth {
                username: Some("${USERNAME}".into()),
                auth_mechanism: None,
                ssl_mode: Some("require".into()),
                secret_ref: Some(SecretRef {
                    id: "secret-postgres-prod".into(),
                    provider: "os-keyring".into(),
                    service: "Universality".into(),
                    account: "analytics-prod".into(),
                    label: "Analytics prod credential".into(),
                }),
            },
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
        ConnectionProfile {
            id: "conn-orders".into(),
            name: "Orders SQL Server".into(),
            engine: "sqlserver".into(),
            family: "sql".into(),
            host: "${ORDERS_HOST}".into(),
            port: Some(1433),
            database: Some("orders".into()),
            connection_string: None,
            environment_ids: vec!["env-uat".into()],
            tags: vec!["orders".into(), "support".into()],
            favorite: false,
            read_only: true,
            icon: "MS".into(),
            color: None,
            group: Some("Operations".into()),
            notes: None,
            auth: ConnectionAuth {
                username: Some("${USERNAME}".into()),
                auth_mechanism: None,
                ssl_mode: Some("require".into()),
                secret_ref: Some(SecretRef {
                    id: "secret-orders-uat".into(),
                    provider: "os-keyring".into(),
                    service: "Universality".into(),
                    account: "orders-uat".into(),
                    label: "Orders UAT credential".into(),
                }),
            },
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
        ConnectionProfile {
            id: "conn-commerce".into(),
            name: "Commerce MySQL".into(),
            engine: "mysql".into(),
            family: "sql".into(),
            host: "${MYSQL_HOST}".into(),
            port: Some(3306),
            database: Some("commerce".into()),
            connection_string: None,
            environment_ids: vec!["env-dev".into()],
            tags: vec!["commerce".into(), "mysql".into()],
            favorite: false,
            read_only: false,
            icon: "MY".into(),
            color: None,
            group: Some("Applications".into()),
            notes: None,
            auth: ConnectionAuth {
                username: Some("${USERNAME}".into()),
                auth_mechanism: None,
                ssl_mode: Some("prefer".into()),
                secret_ref: Some(SecretRef {
                    id: "secret-mysql-dev".into(),
                    provider: "os-keyring".into(),
                    service: "Universality".into(),
                    account: "commerce-dev".into(),
                    label: "Commerce dev credential".into(),
                }),
            },
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
        ConnectionProfile {
            id: "conn-local-sqlite".into(),
            name: "Local SQLite".into(),
            engine: "sqlite".into(),
            family: "sql".into(),
            host: "${SQLITE_PATH}".into(),
            port: None,
            database: Some("${SQLITE_PATH}".into()),
            connection_string: None,
            environment_ids: vec!["env-dev".into()],
            tags: vec!["local".into(), "sqlite".into()],
            favorite: true,
            read_only: false,
            icon: "SQ".into(),
            color: None,
            group: Some("Local".into()),
            notes: None,
            auth: ConnectionAuth::default(),
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
        ConnectionProfile {
            id: "conn-catalog".into(),
            name: "Catalog Mongo".into(),
            engine: "mongodb".into(),
            family: "document".into(),
            host: "${MONGO_HOST}".into(),
            port: Some(27017),
            database: Some("catalog".into()),
            connection_string: None,
            environment_ids: vec!["env-dev".into()],
            tags: vec!["catalog".into(), "documents".into()],
            favorite: true,
            read_only: false,
            icon: "MG".into(),
            color: None,
            group: Some("Applications".into()),
            notes: None,
            auth: ConnectionAuth {
                username: Some("${USERNAME}".into()),
                auth_mechanism: Some("SCRAM-SHA-256".into()),
                ssl_mode: None,
                secret_ref: Some(SecretRef {
                    id: "secret-mongo-dev".into(),
                    provider: "os-keyring".into(),
                    service: "Universality".into(),
                    account: "catalog-dev".into(),
                    label: "Catalog dev credential".into(),
                }),
            },
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
        ConnectionProfile {
            id: "conn-cache".into(),
            name: "Session Redis".into(),
            engine: "redis".into(),
            family: "keyvalue".into(),
            host: "${REDIS_HOST}".into(),
            port: Some(6379),
            database: Some("0".into()),
            connection_string: None,
            environment_ids: vec!["env-prod".into()],
            tags: vec!["cache".into(), "sessions".into()],
            favorite: true,
            read_only: true,
            icon: "RD".into(),
            color: None,
            group: Some("Platform".into()),
            notes: None,
            auth: ConnectionAuth {
                username: Some("default".into()),
                auth_mechanism: None,
                ssl_mode: None,
                secret_ref: Some(SecretRef {
                    id: "secret-redis-prod".into(),
                    provider: "os-keyring".into(),
                    service: "Universality".into(),
                    account: "redis-prod".into(),
                    label: "Redis prod credential".into(),
                }),
            },
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
    ];

    let mut dev_vars = HashMap::new();
    dev_vars.insert("DB_HOST".into(), "analytics-dev.internal".into());
    dev_vars.insert("DB_NAME".into(), "universality_dev".into());
    dev_vars.insert("USERNAME".into(), "developer".into());
    dev_vars.insert("MONGO_HOST".into(), "catalog-dev.internal".into());
    dev_vars.insert("MYSQL_HOST".into(), "commerce-dev.internal".into());
    dev_vars.insert(
        "SQLITE_PATH".into(),
        "C:\\Users\\gmont\\source\\repos\\Universality\\tests\\fixtures\\sqlite\\universality.db"
            .into(),
    );

    let mut uat_vars = HashMap::new();
    uat_vars.insert("ORDERS_HOST".into(), "orders-uat.internal".into());

    let mut prod_vars = HashMap::new();
    prod_vars.insert("DB_HOST".into(), "analytics-prod.internal".into());
    prod_vars.insert("REDIS_HOST".into(), "session-prod.internal".into());
    prod_vars.insert("PASSWORD_REF".into(), "keyring://universality/prod".into());

    let environments = vec![
        EnvironmentProfile {
            id: "env-dev".into(),
            label: "Dev".into(),
            color: "#2dbf9b".into(),
            risk: "low".into(),
            inherits_from: None,
            variables: dev_vars,
            sensitive_keys: Vec::new(),
            requires_confirmation: false,
            safe_mode: false,
            exportable: true,
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
        EnvironmentProfile {
            id: "env-uat".into(),
            label: "UAT".into(),
            color: "#f3a952".into(),
            risk: "medium".into(),
            inherits_from: Some("env-dev".into()),
            variables: uat_vars,
            sensitive_keys: Vec::new(),
            requires_confirmation: true,
            safe_mode: true,
            exportable: true,
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
        EnvironmentProfile {
            id: "env-prod".into(),
            label: "Prod".into(),
            color: "#ec7b7b".into(),
            risk: "critical".into(),
            inherits_from: Some("env-dev".into()),
            variables: prod_vars,
            sensitive_keys: vec!["PASSWORD_REF".into()],
            requires_confirmation: true,
            safe_mode: true,
            exportable: false,
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
        },
    ];

    WorkspaceSnapshot {
        schema_version: persistence::SCHEMA_VERSION,
        connections,
        environments,
        tabs: vec![
            QueryTabState {
                id: "tab-sql-ops".into(),
                title: "Ops dashboard".into(),
                connection_id: "conn-analytics".into(),
                environment_id: "env-prod".into(),
                family: "sql".into(),
                language: "sql".into(),
                pinned: Some(true),
                saved_query_id: None,
                editor_label: "SQL editor".into(),
                query_text: "select table_name, rows_estimate, last_vacuum from observability.table_health order by rows_estimate desc limit 20;".into(),
                status: "idle".into(),
                dirty: false,
                last_run_at: None,
                result: None,
                history: Vec::new(),
                error: None,
            },
            QueryTabState {
                id: "tab-orders-audit".into(),
                title: "Orders audit".into(),
                connection_id: "conn-orders".into(),
                environment_id: "env-uat".into(),
                family: "sql".into(),
                language: "sql".into(),
                pinned: None,
                saved_query_id: None,
                editor_label: "SQL editor".into(),
                query_text: "select top 50 order_id, status, updated_at from dbo.orders where updated_at >= dateadd(hour, -12, sysutcdatetime()) order by updated_at desc;".into(),
                status: "idle".into(),
                dirty: false,
                last_run_at: None,
                result: None,
                history: Vec::new(),
                error: None,
            },
            QueryTabState {
                id: "tab-commerce-mysql".into(),
                title: "Commerce inventory".into(),
                connection_id: "conn-commerce".into(),
                environment_id: "env-dev".into(),
                family: "sql".into(),
                language: "sql".into(),
                pinned: None,
                saved_query_id: None,
                editor_label: "SQL editor".into(),
                query_text: "select sku, inventory_available, updated_at from inventory_items order by updated_at desc limit 50;".into(),
                status: "idle".into(),
                dirty: false,
                last_run_at: None,
                result: None,
                history: Vec::new(),
                error: None,
            },
            QueryTabState {
                id: "tab-local-sqlite".into(),
                title: "SQLite scratch".into(),
                connection_id: "conn-local-sqlite".into(),
                environment_id: "env-dev".into(),
                family: "sql".into(),
                language: "sql".into(),
                pinned: None,
                saved_query_id: None,
                editor_label: "SQL editor".into(),
                query_text: "select name from sqlite_master where type = 'table' order by name;".into(),
                status: "idle".into(),
                dirty: false,
                last_run_at: None,
                result: None,
                history: Vec::new(),
                error: None,
            },
            QueryTabState {
                id: "tab-mongo-catalog".into(),
                title: "Catalog inventory".into(),
                connection_id: "conn-catalog".into(),
                environment_id: "env-dev".into(),
                family: "document".into(),
                language: "mongodb".into(),
                pinned: None,
                saved_query_id: None,
                editor_label: "Document query".into(),
                query_text: "{\n  \"collection\": \"products\",\n  \"pipeline\": [\n    { \"$match\": { \"channels\": \"web\" } },\n    { \"$project\": { \"sku\": 1, \"inventory\": 1, \"channels\": 1 } },\n    { \"$limit\": 50 }\n  ]\n}".into(),
                status: "idle".into(),
                dirty: false,
                last_run_at: None,
                result: None,
                history: Vec::new(),
                error: None,
            },
            QueryTabState {
                id: "tab-redis-session".into(),
                title: "Session inspector".into(),
                connection_id: "conn-cache".into(),
                environment_id: "env-prod".into(),
                family: "keyvalue".into(),
                language: "redis".into(),
                pinned: None,
                saved_query_id: None,
                editor_label: "Redis console".into(),
                query_text: "SCAN 0 MATCH session:* COUNT 25\nHGETALL session:9f2d7e1a\nTTL session:9f2d7e1a".into(),
                status: "idle".into(),
                dirty: false,
                last_run_at: None,
                result: None,
                history: Vec::new(),
                error: None,
            },
        ],
        saved_work: vec![
            SavedWorkItem {
                id: "saved-locks".into(),
                kind: "query".into(),
                name: "Prod lock sweep".into(),
                summary: "Checks blocking sessions with environment-resolved variables.".into(),
                tags: vec!["postgresql".into(), "ops".into()],
                updated_at: created_at.clone(),
                folder: Some("Runbooks".into()),
                favorite: Some(true),
                connection_id: Some("conn-analytics".into()),
                environment_id: Some("env-prod".into()),
                language: Some("sql".into()),
                query_text: Some(
                    "select pid, usename, wait_event_type, wait_event, query from pg_stat_activity where state <> 'idle' order by query_start asc limit 100;".into(),
                ),
                snapshot_result_id: None,
            },
            SavedWorkItem {
                id: "saved-hotkeys".into(),
                kind: "template".into(),
                name: "Redis hot key pack".into(),
                summary: "Reusable prefix, TTL, and memory inspection workflow.".into(),
                tags: vec!["redis".into(), "incident".into()],
                updated_at: created_at.clone(),
                folder: Some("Cache".into()),
                favorite: None,
                connection_id: Some("conn-cache".into()),
                environment_id: Some("env-prod".into()),
                language: Some("redis".into()),
                query_text: Some("SCAN 0 MATCH session:* COUNT 50".into()),
                snapshot_result_id: None,
            },
            SavedWorkItem {
                id: "saved-catalog".into(),
                kind: "investigation-pack".into(),
                name: "Catalog variance".into(),
                summary: "Saved filters, notes, and snapshots for inventory drift.".into(),
                tags: vec!["mongodb".into(), "support".into()],
                updated_at: created_at.clone(),
                folder: Some("Applications".into()),
                favorite: None,
                connection_id: Some("conn-catalog".into()),
                environment_id: Some("env-dev".into()),
                language: Some("mongodb".into()),
                query_text: Some(
                    "{\n  \"collection\": \"products\",\n  \"filter\": { \"status\": \"active\" },\n  \"limit\": 50\n}".into(),
                ),
                snapshot_result_id: None,
            },
        ],
        explorer_nodes: vec![
            ExplorerNode {
                id: "explorer-postgres-schema".into(),
                family: "sql".into(),
                label: "public".into(),
                kind: "schema".into(),
                detail: "Core application objects".into(),
                scope: Some("schema:public".into()),
                path: Some(vec!["Analytics Postgres".into()]),
                query_template: Some("select table_name from information_schema.tables where table_schema = 'public';".into()),
                expandable: Some(true),
            },
            ExplorerNode {
                id: "explorer-mongo-products".into(),
                family: "document".into(),
                label: "products".into(),
                kind: "collection".into(),
                detail: "Documents, indexes, and samples".into(),
                scope: Some("collection:products".into()),
                path: Some(vec!["Catalog Mongo".into()]),
                query_template: Some("{\n  \"collection\": \"products\",\n  \"filter\": {},\n  \"limit\": 50\n}".into()),
                expandable: Some(true),
            },
            ExplorerNode {
                id: "explorer-redis-sessions".into(),
                family: "keyvalue".into(),
                label: "session:*".into(),
                kind: "prefix".into(),
                detail: "Read-heavy session hashes".into(),
                scope: Some("prefix:session:".into()),
                path: Some(vec!["Session Redis".into()]),
                query_template: Some("SCAN 0 MATCH session:* COUNT 50".into()),
                expandable: Some(true),
            },
        ],
        adapter_manifests: adapters::manifests(),
        preferences: AppPreferences {
            theme: "dark".into(),
            telemetry: "opt-in".into(),
            lock_after_minutes: 15,
            safe_mode_enabled: true,
            command_palette_enabled: true,
        },
        guardrails: vec![GuardrailDecision {
            id: None,
            status: "confirm".into(),
            reasons: vec!["Prod sessions require explicit confirmation before writes.".into()],
            safe_mode_applied: true,
            required_confirmation_text: Some("CONFIRM Prod".into()),
        }],
        lock_state: LockState {
            is_locked: false,
            locked_at: None,
        },
        ui: UiState {
            active_connection_id: "conn-analytics".into(),
            active_environment_id: "env-prod".into(),
            active_tab_id: "tab-sql-ops".into(),
            explorer_filter: String::new(),
            active_activity: "connections".into(),
            sidebar_collapsed: false,
            active_sidebar_pane: "connections".into(),
            bottom_panel_visible: true,
            active_bottom_panel_tab: "results".into(),
            bottom_panel_height: 260,
            right_drawer: "none".into(),
        },
        updated_at: created_at,
    }
}
