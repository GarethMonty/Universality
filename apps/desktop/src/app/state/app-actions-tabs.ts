import { useCallback, useMemo } from 'react'
import { desktopClient } from '../../services/runtime/client'
import { ensureWorkspaceUnlocked } from './app-state-factories'
import { savedWorkItemForTab } from './app-state-selectors'
import type { Actions, AppActionContext } from './app-state-types'

type QueryTabActions = Pick<
  Actions,
  | 'selectTab'
  | 'createTab'
  | 'createScopedTab'
  | 'closeTab'
  | 'reopenClosedTab'
  | 'reorderTabs'
  | 'updateQuery'
  | 'updateQueryBuilderState'
  | 'renameTab'
  | 'saveCurrentQuery'
  | 'saveAndCloseTab'
  | 'openSavedWork'
  | 'deleteSavedWork'
>

export function useQueryTabActions({
  state,
  applyPayload,
  handleError,
}: AppActionContext): QueryTabActions {
  const selectTab = useCallback<Actions['selectTab']>(
    async (tabId) => {
      try {
        applyPayload(await desktopClient.setActiveTab(tabId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const createTab = useCallback<Actions['createTab']>(
    async (connectionId) => {
      try {
        applyPayload(await desktopClient.createQueryTab(connectionId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const createScopedTab = useCallback<Actions['createScopedTab']>(
    async (request) => {
      try {
        applyPayload(await desktopClient.createScopedQueryTab(request))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const closeTab = useCallback<Actions['closeTab']>(
    async (tabId) => {
      try {
        applyPayload(await desktopClient.closeQueryTab(tabId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const reopenClosedTab = useCallback<Actions['reopenClosedTab']>(
    async (closedTabId) => {
      try {
        applyPayload(await desktopClient.reopenClosedQueryTab(closedTabId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const reorderTabs = useCallback<Actions['reorderTabs']>(
    async (orderedTabIds) => {
      try {
        applyPayload(await desktopClient.reorderQueryTabs(orderedTabIds))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const updateQuery = useCallback<Actions['updateQuery']>(
    async (tabId, queryText) => {
      try {
        applyPayload(await desktopClient.updateQueryTab(tabId, queryText))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const updateQueryBuilderState = useCallback<Actions['updateQueryBuilderState']>(
    async (request) => {
      try {
        applyPayload(await desktopClient.updateQueryBuilderState(request))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const renameTab = useCallback<Actions['renameTab']>(
    async (tabId, title) => {
      try {
        applyPayload(await desktopClient.renameQueryTab(tabId, title))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const saveCurrentQuery = useCallback<Actions['saveCurrentQuery']>(
    async (tabId) => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for saved work.')
        }
        ensureWorkspaceUnlocked(state.payload)

        const savedWorkItem = savedWorkItemForTab(state.payload.snapshot, tabId)

        applyPayload(await desktopClient.saveQueryTab(tabId, savedWorkItem))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const saveAndCloseTab = useCallback<Actions['saveAndCloseTab']>(
    async (tabId) => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for saved work.')
        }
        ensureWorkspaceUnlocked(state.payload)

        const savedWorkItem = savedWorkItemForTab(state.payload.snapshot, tabId)
        await desktopClient.saveQueryTab(tabId, savedWorkItem)
        applyPayload(await desktopClient.closeQueryTab(tabId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const openSavedWork = useCallback<Actions['openSavedWork']>(
    async (savedWorkId) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        applyPayload(await desktopClient.openSavedWork(savedWorkId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const deleteSavedWork = useCallback<Actions['deleteSavedWork']>(
    async (savedWorkId) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        applyPayload(await desktopClient.deleteSavedWork(savedWorkId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  return useMemo(
    () => ({
      selectTab,
      createTab,
      createScopedTab,
      closeTab,
      reopenClosedTab,
      reorderTabs,
      updateQuery,
      updateQueryBuilderState,
      renameTab,
      saveCurrentQuery,
      saveAndCloseTab,
      openSavedWork,
      deleteSavedWork,
    }),
    [
      closeTab,
      createScopedTab,
      createTab,
      deleteSavedWork,
      openSavedWork,
      renameTab,
      reorderTabs,
      reopenClosedTab,
      saveAndCloseTab,
      saveCurrentQuery,
      selectTab,
      updateQuery,
      updateQueryBuilderState,
    ],
  )
}
