import type { ExecutionRequest, ExecutionResponse, LocalDatabaseCreateRequest, LocalDatabaseCreateResult, LocalDatabasePickRequest, LocalDatabasePickResult, ResultPageRequest, ResultPageResponse } from '@datanaut/shared-types'
import { applyExecutionRequestLocally } from './browser-execution'
import { fetchResultPageLocally } from './browser-structure'
import { findConnection, findTab, loadBrowserSnapshot, saveBrowserSnapshot } from './browser-store'
import { isTauriRuntime, invokeDesktop } from './desktop-bridge'

export const clientExecution = {
  async executeQuery(request: ExecutionRequest): Promise<ExecutionResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ExecutionResponse>('execute_query_request', { request })
    }

    const { snapshot, response } = applyExecutionRequestLocally(
      loadBrowserSnapshot(),
      request,
    )
    saveBrowserSnapshot(snapshot)
    return response
  },

  async fetchResultPage(request: ResultPageRequest): Promise<ResultPageResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ResultPageResponse>('fetch_result_page', { request })
    }

    return fetchResultPageLocally(loadBrowserSnapshot(), request)
  },

  async cancelExecution(
    request: { executionId: string; tabId?: string },
  ): Promise<{ ok: boolean; supported: boolean; message: string }> {
    if (isTauriRuntime()) {
      return invokeDesktop('cancel_execution_request', { request })
    }

    const snapshot = loadBrowserSnapshot()
    const tab = request.tabId ? findTab(snapshot, request.tabId) : undefined
    const engine = tab
      ? findConnection(snapshot, tab.connectionId)?.engine
      : undefined
    const supported = engine === 'postgresql' || engine === 'sqlserver'

    return {
      ok: supported,
      supported,
      message: supported
        ? 'Preview mode has no long-running execution to cancel right now.'
        : 'Cancellation is not supported for this adapter in preview mode.',
    }
  },

  async pickLocalDatabaseFile(
    request: LocalDatabasePickRequest,
  ): Promise<LocalDatabasePickResult> {
    if (isTauriRuntime()) {
      return invokeDesktop<LocalDatabasePickResult>('pick_local_database_file', { request })
    }

    if (request.engine !== 'sqlite') {
      return { canceled: true }
    }

    const filename =
      request.purpose === 'create'
        ? 'datanaut-preview-local.sqlite'
        : 'datanaut-preview-existing.sqlite'

    return {
      canceled: false,
      path: `C:\\Users\\gmont\\Datanaut\\${filename}`,
    }
  },

  async createLocalDatabase(
    request: LocalDatabaseCreateRequest,
  ): Promise<LocalDatabaseCreateResult> {
    if (isTauriRuntime()) {
      return invokeDesktop<LocalDatabaseCreateResult>('create_local_database', { request })
    }

    return {
      engine: request.engine,
      path: request.path,
      message:
        request.mode === 'starter'
          ? 'Preview SQLite starter database prepared.'
          : 'Preview SQLite empty database prepared.',
      warnings:
        request.engine === 'sqlite'
          ? []
          : ['This local database engine is reserved for future adapter work.'],
    }
  },
}
