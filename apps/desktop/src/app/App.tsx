import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type {
  ConnectionProfile,
  ExecutionRequest,
  QueryBuilderState,
  QueryTabState,
  ScopedQueryTarget,
  WorkspaceSnapshot,
} from '@datanaut/shared-types'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ActivityBar } from './components/workbench/ActivityBar'
import { CloseSavedTabDialog, DeleteConnectionDialog } from './components/workbench/AppDialogs'
import { BootSurface, WelcomeSurface } from './components/workbench/BootSurfaces'
import { BottomPanel } from './components/workbench/BottomPanel'
import { CommandPalette } from './components/workbench/CommandPalette'
import { DesktopCodeEditor } from './components/workbench/DesktopCodeEditor'
import { EditorTabs } from './components/workbench/EditorTabs'
import { EditorToolbar } from './components/workbench/EditorToolbar'
import { EnvironmentWorkspace } from './components/workbench/EnvironmentWorkspace'
import { RightDrawer } from './components/workbench/RightDrawer'
import { SideBar } from './components/workbench/SideBar'
import { StatusBar } from './components/workbench/StatusBar'
import { StructureWorkspace } from './components/workbench/StructureWorkspace'
import { QueryBuilderPanel } from './components/workbench/query-builder/QueryBuilderPanel'
import {
  buildMongoFindQueryText,
  isMongoFindBuilderState,
  parseMongoFindQueryText,
} from './components/workbench/query-builder/mongo-find'
import { AppStateProvider, useAppState } from './state/app-state'
import {
  appendFieldToQueryText,
  builderStateForTab,
  defaultCapabilities,
  deriveCapabilities,
  mongoCollectionOptions,
  resolveThemeMode,
  selectPayload,
} from './workspace-helpers'

export function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <DesktopWorkspace />
      </AppStateProvider>
    </ErrorBoundary>
  )
}

function DesktopWorkspace() {
  const {
    status,
    payload,
    diagnostics,
    exportBundle,
    explorer,
    explorerError,
    explorerInspection,
    explorerStatus,
    structure,
    structureError,
    structureStatus,
    executionStatus,
    lastExecution,
    lastExecutionRequest,
    connectionTests,
    startupErrorMessage,
    workbenchMessages,
    actions,
  } = useAppState()
  const [exportPassphrase, setExportPassphrase] = useState('datanaut-desktop')
  const [importPayload, setImportPayload] = useState('')
  const [commandQuery, setCommandQuery] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [rendererPreference, setRendererPreference] = useState<{
    renderer?: string
    tabId?: string
  }>({})
  const [queryWindowMode, setQueryWindowMode] = useState<'both' | 'builder' | 'raw'>(
    'both',
  )
  const hasBuilderTabEverLoaded = useRef(false)
  const builderStateDraftRef = useRef<Record<string, QueryBuilderState>>({})
  const [builderStateDrafts, setBuilderStateDrafts] = useState<
    Record<string, QueryBuilderState>
  >({})
  const queryTextDraftRef = useRef<Record<string, string>>({})
  const [pendingTabClose, setPendingTabClose] = useState<
    | {
        tab: QueryTabState
        remainingTabIds: string[]
      }
    | undefined
  >()
  const [pendingConnectionDelete, setPendingConnectionDelete] = useState<
    ConnectionProfile | undefined
  >()
  const deferredCommandQuery = useDeferredValue(commandQuery)

  const openCommandPalette = () => {
    setCommandQuery('')
    setCommandPaletteOpen(true)
  }

  useEffect(() => {
    if (!payload) {
      return
    }

    const theme = resolveThemeMode(payload.snapshot.preferences.theme)
    document.documentElement.dataset.theme = theme
  }, [payload])

  useEffect(() => {
    builderStateDraftRef.current = builderStateDrafts
  }, [builderStateDrafts])

  const snapshot = payload?.snapshot
  const activeConnection =
    snapshot?.connections.find((item) => item.id === snapshot.ui.activeConnectionId) ??
    snapshot?.connections[0]
  const activeTabFromSelection = snapshot?.tabs.find(
    (item) =>
      item.id === snapshot.ui.activeTabId &&
      (!activeConnection || item.connectionId === activeConnection.id),
  )
  const activeTab =
    activeTabFromSelection ??
    (activeConnection
      ? snapshot?.tabs.find((item) => item.connectionId === activeConnection.id)
      : undefined)
  const activeEnvironment =
    snapshot?.environments.find((item) => item.id === snapshot.ui.activeEnvironmentId) ??
    snapshot?.environments[0]
  const loadExplorer = actions.loadExplorer
  const activeSidebarPane = snapshot?.ui.activeSidebarPane
  const sidebarCollapsed = snapshot?.ui.sidebarCollapsed
  const activeConnectionId = activeConnection?.id
  const activeEnvironmentId = activeEnvironment?.id
  const activeBuilderState =
    activeTab && activeConnection
      ? builderStateForTab(activeTab, activeConnection, builderStateDrafts)
      : undefined
  const hasBuilderQuery = Boolean(activeBuilderState)
  const activeQueryWindowMode: 'both' | 'builder' | 'raw' = hasBuilderQuery
    ? queryWindowMode
    : 'raw'
  const activeEditorQueryText =
    activeTab &&
    activeBuilderState &&
    isMongoFindBuilderState(activeBuilderState) &&
    activeQueryWindowMode !== 'raw'
      ? buildMongoFindQueryText(activeBuilderState)
      : activeTab?.queryText

  const resolveBuilderQueryText = useCallback((tab: QueryTabState): string | undefined => {
    const builderState =
      activeConnection && builderStateForTab(tab, activeConnection, builderStateDraftRef.current)

    if (!builderState) {
      return undefined
    }

    if (!isMongoFindBuilderState(builderState)) {
      return undefined
    }

    if (activeQueryWindowMode === 'raw') {
      return undefined
    }

    return buildMongoFindQueryText(builderState)
  }, [activeConnection, activeQueryWindowMode])
  const resolveQueryText = useCallback((tab: QueryTabState): string => {
    const hasDraftText =
      Object.prototype.hasOwnProperty.call(queryTextDraftRef.current, tab.id) &&
      typeof queryTextDraftRef.current[tab.id] === 'string'

    return hasDraftText ? (queryTextDraftRef.current[tab.id] ?? tab.queryText) : tab.queryText
  }, [])

  const runCurrentTabQuery = useCallback((mode?: ExecutionRequest['mode'], guardrailId?: string) => {
    if (!activeTab) {
      return
    }

    const generatedQueryText = resolveBuilderQueryText(activeTab)
    const builderState =
      activeConnection &&
      builderStateForTab(activeTab, activeConnection, builderStateDraftRef.current)

    if (!generatedQueryText) {
      void actions.executeQuery(activeTab.id, mode, guardrailId, resolveQueryText(activeTab))
      return
    }

    if (!isMongoFindBuilderState(builderState)) {
      void actions.executeQuery(activeTab.id, mode, guardrailId)
      return
    }

    void actions.updateQueryBuilderState({
      tabId: activeTab.id,
      builderState: {
        ...builderState,
        lastAppliedQueryText: generatedQueryText,
      },
      queryText: generatedQueryText,
    })
    void actions.executeQuery(activeTab.id, mode, guardrailId, generatedQueryText)
  }, [actions, activeConnection, activeTab, resolveBuilderQueryText, resolveQueryText])

  const persistBuilderState = (tabId: string, builderState: QueryBuilderState) => {
    if (!snapshot) {
      return
    }

    const targetTab = snapshot.tabs.find((item) => item.id === tabId)

    if (!targetTab) {
      return
    }

    const liveQueryText = isMongoFindBuilderState(builderState)
      ? buildMongoFindQueryText(builderState)
      : undefined
    const nextBuilderState =
      isMongoFindBuilderState(builderState) && liveQueryText
        ? {
            ...builderState,
            lastAppliedQueryText: liveQueryText,
          }
        : builderState

    builderStateDraftRef.current[tabId] = nextBuilderState
    if (liveQueryText !== undefined) {
      queryTextDraftRef.current[tabId] = liveQueryText
    }
    setBuilderStateDrafts((current) => ({
      ...current,
      [tabId]: nextBuilderState,
    }))
    const currentBuilderState = targetTab.builderState

    if (
      currentBuilderState &&
      JSON.stringify(currentBuilderState) === JSON.stringify(nextBuilderState) &&
      liveQueryText === targetTab.queryText
    ) {
      return
    }

    void actions.updateQueryBuilderState({
      tabId,
      builderState: nextBuilderState,
      queryText: liveQueryText,
    })
  }

  useEffect(() => {
    if (!hasBuilderQuery) {
      return
    }

    if (!hasBuilderTabEverLoaded.current) {
      setQueryWindowMode('both')
      hasBuilderTabEverLoaded.current = true
    }
  }, [activeTab?.id, hasBuilderQuery])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()

      if (key === 'escape' && commandPaletteOpen) {
        event.preventDefault()
        setCommandPaletteOpen(false)
        return
      }

      const hasPrimaryModifier = event.metaKey || event.ctrlKey

      if (!hasPrimaryModifier || event.altKey) {
        return
      }

      if (key === 'k') {
        event.preventDefault()

        if (snapshot?.preferences.commandPaletteEnabled) {
          openCommandPalette()
        }

        return
      }

      if (!snapshot || !activeTab) {
        return
      }

      if (key === 'enter') {
        event.preventDefault()
        runCurrentTabQuery()
        return
      }

      if (key === 'j') {
        event.preventDefault()
        void actions.updateUiState({
          bottomPanelVisible: !snapshot.ui.bottomPanelVisible,
        })
        return
      }

      if (key === 'b') {
        event.preventDefault()
        void actions.updateUiState({
          sidebarCollapsed: !snapshot.ui.sidebarCollapsed,
        })
        return
      }

      if (key === 'e' && event.shiftKey) {
        event.preventDefault()
        runCurrentTabQuery('explain')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actions, activeTab, commandPaletteOpen, runCurrentTabQuery, snapshot])

  useEffect(() => {
    if (
      !activeConnectionId ||
      !activeEnvironmentId ||
      activeSidebarPane !== 'explorer' ||
      sidebarCollapsed ||
      (explorer?.connectionId === activeConnectionId &&
        explorer.environmentId === activeEnvironmentId &&
        (explorer.nodes.length > 0 || explorerStatus === 'loading'))
    ) {
      return
    }

    void loadExplorer({
      connectionId: activeConnectionId,
      environmentId: activeEnvironmentId,
      limit: 50,
    })
  }, [
    activeConnectionId,
    activeEnvironmentId,
    activeSidebarPane,
    explorer,
    explorerStatus,
    loadExplorer,
    sidebarCollapsed,
  ])

  useEffect(() => {
    if (
      !activeConnectionId ||
      !activeEnvironmentId ||
      snapshot?.ui.activeActivity !== 'explorer' ||
      snapshot.ui.explorerView !== 'structure'
    ) {
      return
    }

    void actions.loadStructureMap({
      connectionId: activeConnectionId,
      environmentId: activeEnvironmentId,
      limit: 120,
    })
  }, [
    actions,
    activeConnectionId,
    activeEnvironmentId,
    snapshot?.ui.activeActivity,
    snapshot?.ui.explorerView,
  ])

  if (status === 'booting' || !payload || !snapshot) {
    return (
      <BootSurface
        title="Loading Datanaut workspace..."
        copy="Connections, environments, tabs, and workbench layout are being restored."
      />
    )
  }

  if (status === 'error') {
    return (
      <BootSurface
        title="Unable to load workspace."
        copy={startupErrorMessage ?? 'Unexpected desktop startup failure.'}
      />
    )
  }

  const resolvedTheme = resolveThemeMode(snapshot.preferences.theme)
  const runtimeCapabilities =
    activeConnection && explorer?.capabilities
      ? explorer.capabilities
      : activeConnection
        ? deriveCapabilities(snapshot, activeConnection)
        : defaultCapabilities()
  const explorerFilter = snapshot.ui.explorerFilter
  const explorerItems = activeConnection ? (explorer?.nodes ?? snapshot.explorerNodes).filter((node) => {
    const matchesFamily =
      node.family === 'shared' || node.family === activeConnection.family
    const filter = explorerFilter.toLowerCase()
    const searchable = `${node.label} ${node.kind} ${node.detail} ${(node.path ?? []).join(' ')}`.toLowerCase()
    return matchesFamily && searchable.includes(filter)
  }) : []
  const queryBuilderCollectionOptions = mongoCollectionOptions(activeConnection, explorerItems)
  const commandItems = [
    'Open command palette',
    'Open connections',
    'New connection',
    ...(activeConnection
      ? [
          'Duplicate active connection',
          'Open connection operations',
          'Delete active connection',
        ]
      : []),
    'Open explorer',
    'Open saved work',
    ...(activeConnection ? ['Create query tab', 'Open connection drawer', 'Refresh explorer'] : []),
    ...(activeTab
      ? ['Save current query', 'Close current tab', 'Run current query', 'Explain current query']
      : []),
    ...(snapshot.closedTabs.length > 0 ? ['Recover last closed tab'] : []),
    'Refresh diagnostics',
    'Toggle theme',
    'Toggle sidebar',
    'Toggle bottom panel',
    'Lock workspace',
    'Open environments',
    'New environment',
  ].filter((item) => item.toLowerCase().includes(deferredCommandQuery.toLowerCase()))
  const connectionTest = activeConnection ? connectionTests[activeConnection.id] : undefined
  const activeRenderer =
    activeTab &&
    rendererPreference.tabId === activeTab.id &&
    activeTab.result?.rendererModes.some((mode) => mode === rendererPreference.renderer)
      ? rendererPreference.renderer
      : activeTab?.result?.defaultRenderer
  const activePayload = selectPayload(activeTab?.result?.payloads ?? [], activeRenderer)
  const canCancelExecution = Boolean(
    runtimeCapabilities.canCancel && lastExecution?.executionId,
  )
  const showingEnvironmentWorkspace = snapshot.ui.activeActivity === 'environments'
  const showingExplorerWorkspace = snapshot.ui.activeActivity === 'explorer'
  const hasWorkbenchMessages = workbenchMessages.length > 0
  const hasActiveQueryContext = Boolean(activeTab && activeConnection && activeEnvironment)
  const isMessagePanelRequested = snapshot.ui.activeBottomPanelTab === 'messages'
  const shouldShowBottomPanel =
    snapshot.ui.bottomPanelVisible &&
    (hasWorkbenchMessages ||
      isMessagePanelRequested ||
      (!showingEnvironmentWorkspace &&
        !showingExplorerWorkspace &&
        hasActiveQueryContext))

  const requestCloseTabQueue = (tabIds: string[]) => {
    const [tabId, ...remainingTabIds] = tabIds

    if (!tabId) {
      return
    }

    const tab = snapshot.tabs.find((item) => item.id === tabId)

    if (!tab) {
      requestCloseTabQueue(remainingTabIds)
      return
    }

    if (tab.savedQueryId && tab.dirty) {
      setPendingTabClose({ tab, remainingTabIds })
      return
    }

    void actions.closeTab(tab.id).then(() => requestCloseTabQueue(remainingTabIds))
  }

  const requestCloseTab = (tabId: string) => {
    requestCloseTabQueue([tabId])
  }

  const requestCloseTabs = (tabIds: string[]) => {
    requestCloseTabQueue(tabIds)
  }

  const continuePendingTabClose = (remainingTabIds: string[]) => {
    if (remainingTabIds.length > 0) {
      requestCloseTabQueue(remainingTabIds)
    }
  }

  const setActivity = (activity: WorkspaceSnapshot['ui']['activeActivity']) => {
    if (activity === 'settings') {
      void actions.updateUiState({
        activeActivity: 'settings',
        sidebarCollapsed: false,
        rightDrawer: 'diagnostics',
      })
      return
    }

    void actions.updateUiState({
      activeActivity: activity,
      activeSidebarPane: activity,
      sidebarCollapsed: false,
      rightDrawer: snapshot.ui.rightDrawer === 'diagnostics' ? 'none' : snapshot.ui.rightDrawer,
    })
  }

  const openConnectionDrawer = () => {
    if (snapshot?.ui.activeConnectionId) {
      void actions.updateUiState({
        activeActivity: 'connections',
        activeSidebarPane: 'connections',
        sidebarCollapsed: false,
        rightDrawer: 'connection',
      })
    }
  }

  const openConnectionDrawerFor = (connectionId: string) => {
    if (connectionId === snapshot?.ui.activeConnectionId) {
      openConnectionDrawer()
      return
    }

    void (async () => {
      await actions.selectConnection(connectionId)
      await actions.updateUiState({
        activeActivity: 'connections',
        activeSidebarPane: 'connections',
        sidebarCollapsed: false,
        rightDrawer: 'connection',
      })
    })()
  }

  const openOperationsDrawer = (connectionId: string) => {
    void (async () => {
      await actions.selectConnection(connectionId)
      await actions.updateUiState({
        activeActivity: 'connections',
        activeSidebarPane: 'connections',
        sidebarCollapsed: false,
        rightDrawer: 'operations',
      })
    })()
  }

  const requestDeleteConnection = (connectionId: string) => {
    const connection = snapshot.connections.find((item) => item.id === connectionId)

    if (connection) {
      setPendingConnectionDelete(connection)
    }
  }

  const openDiagnosticsDrawer = () => {
    void actions.updateUiState({
      activeActivity: 'settings',
      rightDrawer: 'diagnostics',
      sidebarCollapsed: false,
    })
  }

  const closeDrawer = () => {
    void actions.updateUiState({
      activeActivity:
        snapshot.ui.activeActivity === 'settings'
          ? snapshot.ui.activeSidebarPane
          : snapshot.ui.activeActivity,
      rightDrawer: 'none',
    })
  }

  const handleExplorerSelection = (node: NonNullable<typeof explorerItems>[number]) => {
    if (!activeConnection || !activeEnvironment) {
      return
    }

    void actions.inspectExplorer({
      connectionId: activeConnection.id,
      environmentId: activeEnvironment.id,
      nodeId: node.id,
    })

    if (node.expandable || node.scope) {
      void actions.loadExplorer({
        connectionId: activeConnection.id,
        environmentId: activeEnvironment.id,
        scope: node.scope,
        limit: 50,
      })
    }

    void actions.updateUiState({
      activeActivity: 'explorer',
      activeSidebarPane: 'explorer',
      sidebarCollapsed: false,
      rightDrawer: 'inspection',
    })
  }

  const openConnectionExplorer = (connectionId: string) => {
    void (async () => {
      await actions.selectConnection(connectionId)
      await actions.updateUiState({
        activeActivity: 'explorer',
        activeSidebarPane: 'explorer',
        sidebarCollapsed: false,
        rightDrawer: snapshot.ui.rightDrawer === 'diagnostics' ? 'none' : snapshot.ui.rightDrawer,
      })
    })()
  }

  const openQueryTab = (connectionId: string | undefined) => {
    if (!connectionId) {
      return
    }

    void (async () => {
      await actions.createTab(connectionId)
      await actions.updateUiState({
        rightDrawer: 'none',
      })
    })()
  }

  const openScopedQuery = (connectionId: string, target: ScopedQueryTarget) => {
    const environmentId =
      snapshot.ui.activeEnvironmentId ||
      snapshot.connections.find((connection) => connection.id === connectionId)?.environmentIds[0]

    void (async () => {
      await actions.createScopedTab({
        connectionId,
        environmentId,
        target,
      })
      await actions.updateUiState({
        rightDrawer: 'none',
      })
    })()
  }

  const runCommand = (command: string) => {
    setCommandPaletteOpen(false)

    if (command === 'Open command palette') {
      openCommandPalette()
      return
    }

    if (command === 'Open connections') {
      setActivity('connections')
      return
    }

    if (command === 'New connection') {
      void actions.createConnection()
      return
    }

    if (command === 'Open environments') {
      setActivity('environments')
      return
    }

    if (command === 'New environment') {
      void actions.createEnvironment()
      return
    }

    if (command === 'Duplicate active connection') {
      if (activeConnection) {
        void actions.duplicateConnection(activeConnection.id)
      }
      return
    }

    if (command === 'Delete active connection') {
      if (activeConnection) {
        requestDeleteConnection(activeConnection.id)
      }
      return
    }

    if (command === 'Open connection operations') {
      if (activeConnection) {
        openOperationsDrawer(activeConnection.id)
      }
      return
    }

    if (command === 'Open explorer') {
      setActivity('explorer')
      return
    }

    if (command === 'Open saved work') {
      setActivity('saved-work')
      return
    }

    if (command === 'Create query tab') {
      if (activeConnection) {
        openQueryTab(activeConnection.id)
      }
      return
    }

    if (command === 'Save current query') {
      if (activeTab) {
        void actions.saveCurrentQuery(activeTab.id)
      }
      setActivity('saved-work')
      return
    }

    if (command === 'Close current tab') {
      if (activeTab) {
        requestCloseTab(activeTab.id)
      }
      return
    }

    if (command === 'Recover last closed tab') {
      const closedTab = snapshot.closedTabs[0]

      if (closedTab) {
        void actions.reopenClosedTab(closedTab.id)
      }
      return
    }

    if (command === 'Run current query') {
      if (activeTab) {
        runCurrentTabQuery()
      }
      return
    }

    if (command === 'Explain current query') {
      if (activeTab) {
        runCurrentTabQuery('explain')
      }
      return
    }

    if (command === 'Open connection drawer') {
      openConnectionDrawer()
      return
    }

    if (command === 'Refresh explorer') {
      if (activeConnection && activeEnvironment) {
        void actions.loadExplorer({
          connectionId: activeConnection.id,
          environmentId: activeEnvironment.id,
          limit: 50,
        })
      }
      setActivity('explorer')
      return
    }

    if (command === 'Refresh diagnostics') {
      void actions.refreshDiagnostics()
      openDiagnosticsDrawer()
      return
    }

    if (command === 'Toggle theme') {
      void actions.setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
      return
    }

    if (command === 'Toggle sidebar') {
      void actions.updateUiState({
        sidebarCollapsed: !snapshot.ui.sidebarCollapsed,
      })
      return
    }

    if (command === 'Toggle bottom panel') {
      void actions.updateUiState({
        bottomPanelVisible: !snapshot.ui.bottomPanelVisible,
      })
      return
    }

    if (command === 'Lock workspace') {
      void actions.setLocked(true)
    }
  }

  return (
    <div className="ads-shell">
      {snapshot.preferences.commandPaletteEnabled && commandPaletteOpen ? (
        <CommandPalette
          commands={commandItems}
          query={commandQuery}
          onClose={() => setCommandPaletteOpen(false)}
          onQueryChange={setCommandQuery}
          onRunCommand={runCommand}
        />
      ) : null}

      {snapshot.lockState.isLocked ? (
        <div className="lock-overlay">
          <div className="lock-dialog">
            <p className="sidebar-eyebrow">Locked Session</p>
            <h2>Workspace is locked.</h2>
            <p>Secrets stay protected until the desktop session is unlocked again.</p>
            <button
              type="button"
              className="drawer-button drawer-button--primary"
              onClick={() => void actions.setLocked(false)}
            >
              Unlock Workspace
            </button>
          </div>
        </div>
      ) : null}

      {pendingTabClose ? (
        <CloseSavedTabDialog
          tab={pendingTabClose.tab}
          onCancel={() => setPendingTabClose(undefined)}
          onDiscard={() => {
            const tabId = pendingTabClose.tab.id
            const remainingTabIds = pendingTabClose.remainingTabIds
            setPendingTabClose(undefined)
            void actions.closeTab(tabId).then(() => continuePendingTabClose(remainingTabIds))
          }}
          onSaveAndClose={() => {
            const tabId = pendingTabClose.tab.id
            const remainingTabIds = pendingTabClose.remainingTabIds
            setPendingTabClose(undefined)
            void actions
              .saveAndCloseTab(tabId)
              .then(() => continuePendingTabClose(remainingTabIds))
          }}
        />
      ) : null}

      {pendingConnectionDelete ? (
        <DeleteConnectionDialog
          connection={pendingConnectionDelete}
          onCancel={() => setPendingConnectionDelete(undefined)}
          onConfirm={() => {
            const connectionId = pendingConnectionDelete.id
            setPendingConnectionDelete(undefined)
            void actions.deleteConnection(connectionId)
          }}
        />
      ) : null}

      <div
        className="ads-workbench"
        style={
          {
            '--sidebar-width': `${snapshot.ui.sidebarWidth}px`,
            '--drawer-width': `${snapshot.ui.rightDrawerWidth}px`,
          } as CSSProperties
        }
      >
        <ActivityBar
          activeActivity={snapshot.ui.activeActivity}
          sidebarCollapsed={snapshot.ui.sidebarCollapsed}
          commandPaletteEnabled={snapshot.preferences.commandPaletteEnabled}
          isLocked={snapshot.lockState.isLocked}
          theme={snapshot.preferences.theme}
          onToggleSidebar={() =>
            void actions.updateUiState({
              sidebarCollapsed: !snapshot.ui.sidebarCollapsed,
            })
          }
          onSelectActivity={setActivity}
          onToggleTheme={() =>
            void actions.setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
          }
          onToggleLock={() => void actions.setLocked(!snapshot.lockState.isLocked)}
        />

        {!snapshot.ui.sidebarCollapsed ? (
          <SideBar
            ui={snapshot.ui}
            width={snapshot.ui.sidebarWidth}
            connections={snapshot.connections}
            environments={snapshot.environments}
            savedWork={snapshot.savedWork}
            closedTabs={snapshot.closedTabs}
            explorerItems={explorerItems}
            explorerSummary={explorer?.summary ?? explorerError}
            explorerStatus={explorerStatus}
            activeConnectionId={activeConnection?.id ?? ''}
            activeEnvironmentId={activeEnvironment?.id ?? ''}
            commandPaletteEnabled={snapshot.preferences.commandPaletteEnabled}
            commandQuery={commandQuery}
            commandItems={commandItems}
            onCommandQueryChange={setCommandQuery}
            onRunCommand={runCommand}
            onSelectConnection={(connectionId) => void actions.selectConnection(connectionId)}
            onSelectEnvironment={(environmentId) =>
              void actions.updateUiState({
                activeEnvironmentId: environmentId,
                activeActivity: 'environments',
                activeSidebarPane: 'environments',
                sidebarCollapsed: false,
              })
            }
            onCreateConnection={() => void actions.createConnection()}
            onCreateEnvironment={() => void actions.createEnvironment()}
            onConnectionGroupModeChange={(connectionGroupMode) =>
              void actions.updateUiState({ connectionGroupMode })
            }
            onSidebarSectionExpandedChange={(sectionId, expanded) =>
              void actions.updateUiState({
                sidebarSectionStates: {
                  ...(snapshot.ui.sidebarSectionStates ?? {}),
                  [sectionId]: expanded,
                },
              })
            }
            onDuplicateConnection={(connectionId) =>
              void actions.duplicateConnection(connectionId)
            }
            onDeleteConnection={requestDeleteConnection}
            onOpenConnectionOperations={openOperationsDrawer}
            onOpenConnectionExplorer={openConnectionExplorer}
            onOpenConnectionDrawer={openConnectionDrawerFor}
            onOpenScopedQuery={openScopedQuery}
            onCreateTab={(connectionId) => openQueryTab(connectionId ?? activeConnection?.id)}
            onSaveCurrentQuery={() =>
              activeTab ? void actions.saveCurrentQuery(activeTab.id) : undefined
            }
            onOpenSavedWork={(savedWorkId) => void actions.openSavedWork(savedWorkId)}
            onDeleteSavedWork={(savedWorkId) => void actions.deleteSavedWork(savedWorkId)}
            onReopenClosedTab={(closedTabId) => void actions.reopenClosedTab(closedTabId)}
            onExplorerFilterChange={(value) =>
              void actions.updateUiState({ explorerFilter: value })
            }
            onRefreshExplorer={() =>
              activeConnection && activeEnvironment
                ? void actions.loadExplorer({
                    connectionId: activeConnection.id,
                    environmentId: activeEnvironment.id,
                    limit: 50,
                  })
                : undefined
            }
            onSelectExplorerNode={handleExplorerSelection}
            onResize={(width) =>
              void actions.updateUiState({
                sidebarWidth: width,
              })
            }
          />
        ) : null}

        <div className="workbench-center">
          <main className="editor-workspace">
            {showingEnvironmentWorkspace ? (
              <EnvironmentWorkspace
                key={`${activeEnvironment?.id ?? 'none'}-${activeEnvironment?.updatedAt ?? ''}`}
                activeEnvironment={activeEnvironment}
                environments={snapshot.environments}
                onCreateEnvironment={() => void actions.createEnvironment()}
                onSaveEnvironment={(environment) => void actions.saveEnvironment(environment)}
              />
            ) : showingExplorerWorkspace ? (
              <StructureWorkspace
                activeConnection={activeConnection}
                activeEnvironment={activeEnvironment}
                explorerView={snapshot.ui.explorerView}
                status={structureStatus}
                structure={structure}
                error={structureError}
                onExplorerViewChange={(view) =>
                  void actions.updateUiState({ explorerView: view })
                }
                onRefresh={() =>
                  activeConnection && activeEnvironment
                    ? void actions.loadStructureMap({
                        connectionId: activeConnection.id,
                        environmentId: activeEnvironment.id,
                        limit: 120,
                      })
                    : undefined
                }
                onInspectNode={(node) => {
                  if (!activeConnection || !activeEnvironment) {
                    return
                  }

                  void actions.inspectExplorer({
                    connectionId: activeConnection.id,
                    environmentId: activeEnvironment.id,
                    nodeId: node.id,
                  })
                  void actions.updateUiState({ rightDrawer: 'inspection' })
                }}
              />
            ) : (
              <>
                <EditorTabs
                  tabs={snapshot.tabs}
                  activeTabId={activeTab?.id ?? ''}
                  connections={snapshot.connections}
                  environments={snapshot.environments}
                  canCreateTab={Boolean(activeConnection)}
                  onSelectTab={(tabId) => void actions.selectTab(tabId)}
                  onCloseTab={requestCloseTab}
                  onCloseTabs={requestCloseTabs}
                  onCreateTab={() => openQueryTab(activeConnection?.id)}
                  onRenameTab={(tabId, title) => void actions.renameTab(tabId, title)}
                  onSaveTab={(tabId) => void actions.saveCurrentQuery(tabId)}
                  onReorderTabs={(orderedTabIds) =>
                    void actions.reorderTabs(orderedTabIds)
                  }
                />

                {activeConnection && activeEnvironment && activeTab ? (
                  <>
                    <EditorToolbar
                      executionStatus={executionStatus}
                      capabilities={runtimeCapabilities}
                      canCancelExecution={canCancelExecution}
                      bottomPanelVisible={snapshot.ui.bottomPanelVisible}
                      onExecute={() => runCurrentTabQuery()}
                      onExplain={() => runCurrentTabQuery('explain')}
                      onCancel={() =>
                        lastExecution?.executionId
                          ? void actions.cancelExecution(lastExecution.executionId, activeTab.id)
                          : undefined
                      }
                      onOpenConnectionDrawer={openConnectionDrawer}
                      canToggleBuilderView={hasBuilderQuery}
                      queryWindowMode={queryWindowMode}
                      onToggleQueryWindowMode={setQueryWindowMode}
                      onToggleBottomPanel={() =>
                        void actions.updateUiState({
                          bottomPanelVisible: !snapshot.ui.bottomPanelVisible,
                        })
                      }
                    />

                    <div className="editor-surface">
                      <div className="editor-surface-meta">
                        <span>
                          {activeConnection.name} / {activeEnvironment.label}
                        </span>
                      </div>
                      <div
                        className={`editor-query-layout query-layout--${activeQueryWindowMode}`}
                        role="presentation"
                      >
                        {hasBuilderQuery && activeQueryWindowMode !== 'raw' ? (
                          <QueryBuilderPanel
                            tab={activeTab}
                            builderState={activeBuilderState}
                            collectionOptions={queryBuilderCollectionOptions}
                            onBuilderStateChange={persistBuilderState}
                          />
                        ) : null}
                        {!hasBuilderQuery || activeQueryWindowMode !== 'builder' ? (
                          <DesktopCodeEditor
                            value={activeEditorQueryText ?? activeTab.queryText}
                            language={runtimeCapabilities.editorLanguage}
                            theme={resolvedTheme}
                            onChange={(value) => {
                              const nextQueryText = value ?? ''
                              queryTextDraftRef.current[activeTab.id] = nextQueryText
                              if (
                                activeBuilderState &&
                                isMongoFindBuilderState(activeBuilderState) &&
                                activeQueryWindowMode === 'both'
                              ) {
                                const parsedBuilderState =
                                  parseMongoFindQueryText(nextQueryText)

                                if (parsedBuilderState) {
                                  persistBuilderState(activeTab.id, parsedBuilderState)
                                  return
                                }
                              }
                              void actions.updateQuery(activeTab.id, nextQueryText)
                            }}
                            onDropField={(fieldPath) => {
                              const nextQueryText = appendFieldToQueryText(
                                activeTab.queryText,
                                fieldPath,
                              )
                              queryTextDraftRef.current[activeTab.id] = nextQueryText
                              void actions.updateQuery(activeTab.id, nextQueryText)
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <WelcomeSurface
                    onCreateConnection={() => void actions.createConnection()}
                    onImportWorkspace={openDiagnosticsDrawer}
                    onOpenDiagnostics={openDiagnosticsDrawer}
                  />
                )}
              </>
            )}
          </main>

          {shouldShowBottomPanel ? (
            <BottomPanel
              activeTab={activeTab}
              activeConnection={activeConnection}
              activeEnvironment={activeEnvironment}
              activePanelTab={snapshot.ui.activeBottomPanelTab}
              height={snapshot.ui.bottomPanelHeight}
              activePayload={activePayload}
              activeRenderer={activeRenderer}
              diagnostics={diagnostics}
              explorerInspection={explorerInspection}
              lastExecution={lastExecution}
              lastExecutionRequest={lastExecutionRequest}
              capabilities={runtimeCapabilities}
              workbenchMessages={workbenchMessages}
              onSelectPanelTab={(tab) =>
                void actions.updateUiState({
                  activeBottomPanelTab: tab,
                  bottomPanelVisible: true,
                })
              }
              onSelectRenderer={(renderer) =>
                activeTab
                  ? setRendererPreference({ renderer, tabId: activeTab.id })
                  : undefined
              }
              onLoadNextPage={() =>
                activeTab
                  ? void actions.fetchResultPage(activeTab.id, activeRenderer)
                  : undefined
              }
              onResize={(nextHeight) =>
                void actions.updateUiState({
                  bottomPanelHeight: nextHeight,
                })
              }
              onClose={() =>
                void actions.updateUiState({
                  bottomPanelVisible: false,
                })
              }
              onConfirmExecution={(guardrailId, mode) =>
                activeTab
                  ? runCurrentTabQuery(mode, guardrailId)
                  : undefined
              }
              onRestoreHistory={(queryText) =>
                activeTab ? void actions.updateQuery(activeTab.id, queryText) : undefined
              }
              onExecuteDataEdit={actions.executeDataEdit}
              onDismissWorkbenchMessage={actions.dismissWorkbenchMessage}
              onClearWorkbenchMessages={actions.clearWorkbenchMessages}
            />
          ) : null}
        </div>

        {snapshot.ui.rightDrawer !== 'none' ? (
          <RightDrawer
            key={[
              snapshot.ui.rightDrawer,
              activeConnection?.id ?? 'none',
              activeConnection?.updatedAt ?? 'none',
              activeEnvironment?.id ?? 'none',
              activeEnvironment?.updatedAt ?? 'none',
            ].join('-')}
            view={snapshot.ui.rightDrawer}
            width={snapshot.ui.rightDrawerWidth}
            health={payload.health}
            theme={snapshot.preferences.theme}
            activeConnection={activeConnection}
            activeEnvironment={activeEnvironment}
            environments={snapshot.environments}
            connectionTest={connectionTest}
            diagnostics={diagnostics}
            explorerInspection={explorerInspection}
            exportBundle={exportBundle}
            capabilities={runtimeCapabilities}
            exportPassphrase={exportPassphrase}
            importPayload={importPayload}
            onExportPassphraseChange={setExportPassphrase}
            onImportPayloadChange={setImportPayload}
            onClose={closeDrawer}
            onSaveConnection={(profile, secret) =>
              void actions.saveConnection(profile, secret)
            }
            onTestConnection={(profile, environmentId) =>
              void actions.testConnection(
                profile,
                environmentId || activeEnvironment?.id || '',
              )
            }
            onRefreshDiagnostics={() => void actions.refreshDiagnostics()}
            onExportWorkspace={() => void actions.exportWorkspace(exportPassphrase)}
            onImportWorkspace={() =>
              void actions.importWorkspace(exportPassphrase, importPayload)
            }
            onApplyTemplate={(queryTemplate) =>
              queryTemplate && activeTab
                ? void actions.updateQuery(activeTab.id, queryTemplate)
                : undefined
            }
            onListOperations={actions.listDatastoreOperations}
            onPlanOperation={actions.planDatastoreOperation}
            onExecuteOperation={actions.executeDatastoreOperation}
            onToggleTheme={() =>
              void actions.setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
            }
            onPickLocalDatabaseFile={actions.pickLocalDatabaseFile}
            onCreateLocalDatabase={actions.createLocalDatabase}
            onResize={(width) =>
              void actions.updateUiState({
                rightDrawerWidth: width,
              })
            }
          />
        ) : null}
      </div>

      <StatusBar
        health={payload.health}
        theme={snapshot.preferences.theme}
        activeConnection={activeConnection}
        activeEnvironment={activeEnvironment}
        activeTab={activeTab}
        bottomPanelVisible={snapshot.ui.bottomPanelVisible}
        messageCount={workbenchMessages.length}
        onToggleBottomPanel={() =>
          void actions.updateUiState({
            bottomPanelVisible: !snapshot.ui.bottomPanelVisible,
          })
        }
        onOpenMessages={actions.openWorkbenchMessages}
        onOpenDiagnostics={openDiagnosticsDrawer}
      />
    </div>
  )
}

export default App

