use std::collections::{HashMap, HashSet};

use super::query_tabs::{
    build_query_tab, build_scoped_query_tab, next_query_tab_title, normalize_tab_title,
};
use super::ui::focus_query_tab;
use super::{generate_id, timestamp_now, ManagedAppState};
use crate::domain::{
    error::CommandError,
    models::{
        BootstrapPayload, ClosedQueryTabSnapshot, CreateScopedQueryTabRequest,
        QueryTabReorderRequest, QueryTabState, UpdateQueryBuilderStateRequest, WorkspaceSnapshot,
    },
};

impl ManagedAppState {
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
        let title = next_query_tab_title(&self.snapshot, &connection);
        let tab = build_query_tab(&connection, true, title);
        self.snapshot.tabs.push(tab.clone());
        focus_query_tab(&mut self.snapshot.ui, &tab);
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn create_scoped_query_tab(
        &mut self,
        request: CreateScopedQueryTabRequest,
    ) -> Result<BootstrapPayload, CommandError> {
        let connection = self
            .snapshot
            .connections
            .iter()
            .find(|item| item.id == request.connection_id)
            .cloned()
            .ok_or_else(|| CommandError::new("connection-missing", "Connection was not found."))?;
        let tab = build_scoped_query_tab(&self.snapshot, &connection, request);

        self.snapshot.tabs.push(tab.clone());
        focus_query_tab(&mut self.snapshot.ui, &tab);
        self.snapshot.ui.active_activity = "connections".into();
        self.snapshot.ui.active_sidebar_pane = "connections".into();
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
        tab.error = None;
        if tab.result.is_none() {
            tab.status = "idle".into();
            tab.last_run_at = None;
        }
        self.snapshot.updated_at = timestamp_now();
        self.persist()?;
        Ok(self.bootstrap_payload())
    }

    pub fn update_query_builder_state(
        &mut self,
        request: UpdateQueryBuilderStateRequest,
    ) -> Result<BootstrapPayload, CommandError> {
        let tab = self
            .snapshot
            .tabs
            .iter_mut()
            .find(|item| item.id == request.tab_id)
            .ok_or_else(|| CommandError::new("tab-missing", "Tab was not found."))?;

        tab.builder_state = Some(request.builder_state);
        if let Some(query_text) = request.query_text {
            tab.query_text = query_text;
        }
        tab.dirty = true;
        tab.error = None;
        if tab.result.is_none() {
            tab.status = "idle".into();
            tab.last_run_at = None;
        }
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

pub(super) fn reorder_query_tabs_in_place(
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
