import type { AdapterDiagnosticsRequest, AdapterDiagnosticsResponse, DataEditExecutionRequest, DataEditExecutionResponse, DataEditPlanRequest, DataEditPlanResponse, DatastoreExperienceResponse, ExplorerInspectRequest, ExplorerInspectResponse, ExplorerRequest, ExplorerResponse, OperationExecutionRequest, OperationExecutionResponse, OperationManifestRequest, OperationManifestResponse, OperationPlanRequest, OperationPlanResponse, PermissionInspectionRequest, PermissionInspectionResponse, StructureRequest, StructureResponse } from '@datapadplusplus/shared-types'
import { buildDatastoreExperiences, executeDataEditLocally, planDataEditLocally } from './browser-datastore-platform'
import { createExplorerNodes, inspectExplorerNodeLocally } from './browser-explorer'
import { buildOperationManifestsForConnection, collectDiagnosticsLocally, executeOperationLocally, inspectPermissionsLocally, planOperationLocally } from './browser-operations'
import { createStructureResponseLocally } from './browser-structure'
import { buildExecutionCapabilities, findConnection, loadBrowserSnapshot } from './browser-store'
import { isTauriRuntime, invokeDesktop } from './desktop-bridge'

export const clientAdapters = {
  async loadExplorer(request: ExplorerRequest): Promise<ExplorerResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ExplorerResponse>('list_explorer_nodes', { request })
    }

    const snapshot = loadBrowserSnapshot()
    const connection = findConnection(snapshot, request.connectionId)

    if (!connection) {
      throw new Error('Connection was not found.')
    }

    const nodes = createExplorerNodes(connection, request.scope).slice(
      0,
      request.limit ?? 50,
    )

    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      scope: request.scope,
      summary: `Preview explorer loaded ${nodes.length} node(s) for ${connection.name}.`,
      capabilities: buildExecutionCapabilities(connection, snapshot),
      nodes,
    }
  },

  async loadStructureMap(request: StructureRequest): Promise<StructureResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<StructureResponse>('load_structure_map', { request })
    }

    return createStructureResponseLocally(loadBrowserSnapshot(), request)
  },

  async inspectExplorer(
    request: ExplorerInspectRequest,
  ): Promise<ExplorerInspectResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ExplorerInspectResponse>('inspect_explorer_node', { request })
    }

    return inspectExplorerNodeLocally(loadBrowserSnapshot(), request)
  },

  async listDatastoreExperiences(): Promise<DatastoreExperienceResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<DatastoreExperienceResponse>('list_datastore_experiences')
    }

    return { experiences: buildDatastoreExperiences() }
  },

  async listDatastoreOperations(
    request: OperationManifestRequest,
  ): Promise<OperationManifestResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<OperationManifestResponse>('list_datastore_operations', { request })
    }

    const snapshot = loadBrowserSnapshot()
    const connection = findConnection(snapshot, request.connectionId)

    if (!connection) {
      throw new Error('Connection was not found.')
    }

    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      engine: connection.engine,
      operations: buildOperationManifestsForConnection(connection),
    }
  },

  async planDatastoreOperation(
    request: OperationPlanRequest,
  ): Promise<OperationPlanResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<OperationPlanResponse>('plan_datastore_operation', { request })
    }

    return planOperationLocally(loadBrowserSnapshot(), request)
  },

  async executeDatastoreOperation(
    request: OperationExecutionRequest,
  ): Promise<OperationExecutionResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<OperationExecutionResponse>('execute_datastore_operation', {
        request,
      })
    }

    return executeOperationLocally(loadBrowserSnapshot(), request)
  },

  async planDataEdit(request: DataEditPlanRequest): Promise<DataEditPlanResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<DataEditPlanResponse>('plan_data_edit', { request })
    }

    const connection = findConnection(loadBrowserSnapshot(), request.connectionId)

    if (!connection) {
      throw new Error('Connection was not found.')
    }

    return planDataEditLocally(connection, request)
  },

  async executeDataEdit(
    request: DataEditExecutionRequest,
  ): Promise<DataEditExecutionResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<DataEditExecutionResponse>('execute_data_edit', { request })
    }

    const connection = findConnection(loadBrowserSnapshot(), request.connectionId)

    if (!connection) {
      throw new Error('Connection was not found.')
    }

    return executeDataEditLocally(connection, request)
  },

  async inspectConnectionPermissions(
    request: PermissionInspectionRequest,
  ): Promise<PermissionInspectionResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<PermissionInspectionResponse>(
        'inspect_connection_permissions',
        { request },
      )
    }

    return inspectPermissionsLocally(loadBrowserSnapshot(), request)
  },

  async collectAdapterDiagnostics(
    request: AdapterDiagnosticsRequest,
  ): Promise<AdapterDiagnosticsResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<AdapterDiagnosticsResponse>('collect_adapter_diagnostics', { request })
    }

    return collectDiagnosticsLocally(loadBrowserSnapshot(), request)
  },
}
