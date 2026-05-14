import type { BootstrapPayload, SavedWorkItem } from '@datapadplusplus/shared-types'
import { deleteSavedWork, openSavedWork, saveQueryTab, upsertSavedWork } from './browser-saved-work'
import { buildBrowserPayload, loadBrowserSnapshot, saveBrowserSnapshot } from './browser-store'
import { isTauriRuntime, invokeDesktop } from './desktop-bridge'

export const clientSavedWork = {
  async upsertSavedWork(item: SavedWorkItem): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('upsert_saved_work_item', { item })
    }

    const snapshot = upsertSavedWork(loadBrowserSnapshot(), item)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async saveQueryTab(tabId: string, item: SavedWorkItem): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('save_query_tab', { tabId, item })
    }

    const snapshot = saveQueryTab(loadBrowserSnapshot(), tabId, item)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async deleteSavedWork(savedWorkId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('delete_saved_work_item', {
        savedWorkId,
      })
    }

    const snapshot = deleteSavedWork(loadBrowserSnapshot(), savedWorkId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async openSavedWork(savedWorkId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('open_saved_work_item', {
        savedWorkId,
      })
    }

    const snapshot = openSavedWork(loadBrowserSnapshot(), savedWorkId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },
}
