use std::collections::BTreeMap;

use super::{timestamp_now, ManagedAppState};
use crate::{
    adapters,
    domain::{
        error::CommandError,
        models::{
            AdapterDiagnosticsRequest, AdapterDiagnosticsResponse, DataEditExecutionRequest,
            DataEditExecutionResponse, DataEditPlanRequest, DataEditPlanResponse,
            DatastoreExperienceResponse, ExplorerInspectRequest, ExplorerInspectResponse,
            ExplorerRequest, ExplorerResponse, OperationExecutionRequest,
            OperationExecutionResponse, OperationManifestRequest, OperationManifestResponse,
            OperationPlanRequest, OperationPlanResponse, PermissionInspectionRequest,
            PermissionInspectionResponse, StructureRequest, StructureResponse,
        },
    },
};

impl ManagedAppState {
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

    pub fn list_datastore_experiences(&self) -> Result<DatastoreExperienceResponse, CommandError> {
        self.ensure_unlocked()?;

        Ok(DatastoreExperienceResponse {
            experiences: adapters::experience_manifests(),
        })
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

    pub async fn plan_data_edit(
        &self,
        request: DataEditPlanRequest,
    ) -> Result<DataEditPlanResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        adapters::plan_data_edit(&resolved, &request).await
    }

    pub async fn execute_data_edit(
        &self,
        request: DataEditExecutionRequest,
    ) -> Result<DataEditExecutionResponse, CommandError> {
        self.ensure_unlocked()?;
        let profile = self.connection_by_id(&request.connection_id)?;
        let (resolved, _, _) =
            self.resolve_connection_profile(&profile, &request.environment_id)?;
        adapters::execute_data_edit(&resolved, &request).await
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
}
