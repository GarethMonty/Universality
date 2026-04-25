use async_trait::async_trait;

use super::*;

#[async_trait]
pub trait DatastoreAdapter: Send + Sync {
    fn manifest(&self) -> AdapterManifest;
    fn execution_capabilities(&self) -> ExecutionCapabilities;
    fn operation_manifests(&self) -> Vec<DatastoreOperationManifest> {
        operation_manifests_for_manifest(&self.manifest())
    }
    async fn plan_operation(
        &self,
        connection: &ResolvedConnectionProfile,
        operation_id: &str,
        object_name: Option<&str>,
        parameters: Option<&BTreeMap<String, Value>>,
    ) -> Result<OperationPlan, CommandError> {
        Ok(default_operation_plan(
            connection,
            &self.manifest(),
            operation_id,
            object_name,
            parameters,
        ))
    }
    async fn inspect_permissions(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<PermissionInspection, CommandError> {
        Ok(default_permission_inspection(
            connection,
            &self.manifest(),
            &self.operation_manifests(),
        ))
    }
    async fn collect_diagnostics(
        &self,
        connection: &ResolvedConnectionProfile,
        scope: Option<&str>,
    ) -> Result<AdapterDiagnostics, CommandError> {
        Ok(default_adapter_diagnostics(
            connection,
            &self.manifest(),
            scope,
        ))
    }
    async fn test_connection(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<ConnectionTestResult, CommandError>;
    async fn list_explorer_nodes(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError>;
    async fn inspect_explorer_node(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError>;
    async fn load_structure_map(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &StructureRequest,
    ) -> Result<StructureResponse, CommandError> {
        load_structure_map_for_connection(connection, request).await
    }
    async fn execute(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExecutionRequest,
        notices: Vec<QueryExecutionNotice>,
    ) -> Result<ExecutionResultEnvelope, CommandError>;
    async fn fetch_result_page(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ResultPageRequest,
    ) -> Result<ResultPageResponse, CommandError> {
        fetch_result_page_for_connection(connection, request).await
    }
    async fn cancel(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError>;
}
