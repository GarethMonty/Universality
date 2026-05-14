import type { BootstrapPayload, CreateScopedQueryTabRequest, QueryTabReorderRequest, UpdateQueryBuilderStateRequest } from '@datapadplusplus/shared-types'
import { closeQueryTab, createQueryTabForConnection, createScopedQueryTabInSnapshot, renameQueryTab, reopenClosedQueryTab, reorderQueryTabsInSnapshot, upsertTab } from './browser-tabs'
import { buildBrowserPayload, cloneSnapshot, findConnection, findTab, loadBrowserSnapshot, saveBrowserSnapshot } from './browser-store'
import { isTauriRuntime, invokeDesktop } from './desktop-bridge'

export const clientTabs = {
  async setActiveTab(tabId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('set_active_tab', { tabId })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const tab = findTab(next, tabId)

    if (!tab) {
      return buildBrowserPayload(next)
    }

    next.ui.activeTabId = tab.id
    next.ui.activeConnectionId = tab.connectionId
    next.ui.activeEnvironmentId = tab.environmentId
    next.updatedAt = new Date().toISOString()
    saveBrowserSnapshot(next)
    return buildBrowserPayload(next)
  },

  async setTabEnvironment(
    tabId: string,
    environmentId: string,
  ): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('set_tab_environment', {
        tabId,
        environmentId,
      })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const tab = findTab(next, tabId)
    const environment = next.environments.find((item) => item.id === environmentId)

    if (!tab || !environment) {
      return buildBrowserPayload(next)
    }

    tab.environmentId = environment.id
    tab.status = 'idle'
    tab.error = undefined
    tab.result = undefined
    tab.lastRunAt = undefined
    next.ui.activeTabId = tab.id
    next.ui.activeConnectionId = tab.connectionId
    next.ui.activeEnvironmentId = tab.environmentId
    next.updatedAt = new Date().toISOString()
    saveBrowserSnapshot(next)
    return buildBrowserPayload(next)
  },

  async createQueryTab(connectionId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('create_query_tab', { connectionId })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const connection = findConnection(next, connectionId)

    if (!connection) {
      return buildBrowserPayload(next)
    }

    const tab = createQueryTabForConnection(next, connection, true)
    const snapshot = upsertTab(next, tab)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async createScopedQueryTab(
    request: CreateScopedQueryTabRequest,
  ): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('create_scoped_query_tab', { request })
    }

    const snapshot = createScopedQueryTabInSnapshot(loadBrowserSnapshot(), request)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async closeQueryTab(tabId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('close_query_tab', { tabId })
    }

    const snapshot = closeQueryTab(loadBrowserSnapshot(), tabId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async reorderQueryTabs(orderedTabIds: string[]): Promise<BootstrapPayload> {
    const request: QueryTabReorderRequest = { orderedTabIds }

    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('reorder_query_tabs', { request })
    }

    const snapshot = reorderQueryTabsInSnapshot(loadBrowserSnapshot(), request)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async reopenClosedQueryTab(closedTabId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('reopen_closed_query_tab', {
        closedTabId,
      })
    }

    const snapshot = reopenClosedQueryTab(loadBrowserSnapshot(), closedTabId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async updateQueryTab(tabId: string, queryText: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('update_query_tab', { tabId, queryText })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const tab = findTab(next, tabId)

    if (tab) {
      tab.queryText = queryText
      tab.dirty = true
      tab.error = undefined
      if (!tab.result) {
        tab.status = 'idle'
        tab.lastRunAt = undefined
      }
    }

    next.updatedAt = new Date().toISOString()
    saveBrowserSnapshot(next)
    return buildBrowserPayload(next)
  },

  async updateQueryBuilderState(
    request: UpdateQueryBuilderStateRequest,
  ): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('update_query_builder_state', { request })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const tab = findTab(next, request.tabId)

    if (tab) {
      tab.builderState = request.builderState
      if (request.queryText !== undefined) {
        tab.queryText = request.queryText
      }
      tab.dirty = true
      tab.error = undefined
      if (!tab.result) {
        tab.status = 'idle'
        tab.lastRunAt = undefined
      }
      next.updatedAt = new Date().toISOString()
    }

    saveBrowserSnapshot(next)
    return buildBrowserPayload(next)
  },

  async renameQueryTab(tabId: string, title: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('rename_query_tab', { tabId, title })
    }

    const snapshot = renameQueryTab(loadBrowserSnapshot(), tabId, title)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },
}
