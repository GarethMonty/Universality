use super::environments::{build_resolution_warnings, has_unresolved_tokens, interpolate_value};
use super::query_tabs::{build_query_tab, next_query_tab_title};
use super::{timestamp_now, ManagedAppState};
use crate::{
    adapters,
    domain::{
        error::CommandError,
        models::{
            BootstrapPayload, ConnectionProfile, ConnectionTestRequest, ConnectionTestResult,
            EnvironmentProfile, ResolvedConnectionProfile, ResolvedEnvironment,
        },
    },
    security,
};

impl ManagedAppState {
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
            .cloned();
        let active_environment_id = tab
            .as_ref()
            .map(|tab| tab.environment_id.clone())
            .unwrap_or_else(|| {
                connection
                    .environment_ids
                    .first()
                    .cloned()
                    .unwrap_or_default()
            });

        self.snapshot.ui.active_connection_id = connection.id;
        self.snapshot.ui.active_environment_id = active_environment_id;
        self.snapshot.ui.active_tab_id = tab.map_or(String::new(), |tab| tab.id);
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
                let title = next_query_tab_title(&self.snapshot, &connection);
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
}
