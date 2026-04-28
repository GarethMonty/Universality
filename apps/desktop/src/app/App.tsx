import { useDeferredValue, useEffect, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, DragEvent } from 'react'
import type {
  ConnectionProfile,
  EnvironmentProfile,
  ExecutionRequest,
  ExecutionCapabilities,
  QueryBuilderState,
  QueryTabState,
  ResultPayload,
  ScopedQueryTarget,
  WorkspaceSnapshot,
} from '@universality/shared-types'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ActivityBar } from './components/workbench/ActivityBar'
import { BottomPanel } from './components/workbench/BottomPanel'
import { CommandPalette } from './components/workbench/CommandPalette'
import { EditorTabs } from './components/workbench/EditorTabs'
import { EditorToolbar } from './components/workbench/EditorToolbar'
import { RightDrawer } from './components/workbench/RightDrawer'
import { SideBar } from './components/workbench/SideBar'
import { StatusBar } from './components/workbench/StatusBar'
import { StructureWorkspace } from './components/workbench/StructureWorkspace'
import { QueryBuilderPanel } from './components/workbench/query-builder/QueryBuilderPanel'
import {
  buildMongoFindQueryText,
  createDefaultMongoFindBuilderState,
  isMongoFindBuilderState,
  parseMongoFindQueryText,
} from './components/workbench/query-builder/mongo-find'
import { readFieldDragData } from './components/workbench/results/field-drag'
import { AppStateProvider, useAppState } from './state/app-state'
import {
  defaultRowLimitForConnection,
  editorLanguageForConnection,
} from './state/helpers'

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
  const [exportPassphrase, setExportPassphrase] = useState('universality-desktop')
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

  const resolveBuilderQueryText = (tab: QueryTabState): string | undefined => {
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
  }
  const resolveQueryText = (tab: QueryTabState): string => {
    const hasDraftText =
      Object.prototype.hasOwnProperty.call(queryTextDraftRef.current, tab.id) &&
      typeof queryTextDraftRef.current[tab.id] === 'string'

    return hasDraftText ? (queryTextDraftRef.current[tab.id] ?? tab.queryText) : tab.queryText
  }

  const runCurrentTabQuery = (mode?: ExecutionRequest['mode'], guardrailId?: string) => {
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
  }

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
  }, [activeTab, commandPaletteOpen, runCurrentTabQuery, snapshot])

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
        title="Loading Universality workspace..."
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
                      connections={snapshot.connections}
                      environments={snapshot.environments}
                      activeConnection={activeConnection}
                      activeEnvironment={activeEnvironment}
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
                      onSelectConnection={(connectionId) =>
                        void actions.selectConnection(connectionId)
                      }
                      onSelectEnvironment={(environmentId) =>
                        void actions.selectEnvironment(activeTab.id, environmentId)
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
                        <span>{activeTab.editorLabel}</span>
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

function CloseSavedTabDialog({
  tab,
  onCancel,
  onDiscard,
  onSaveAndClose,
}: {
  tab: QueryTabState
  onCancel(): void
  onDiscard(): void
  onSaveAndClose(): void
}) {
  return (
    <div className="workbench-modal-overlay" role="presentation">
      <section
        className="workbench-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-tab-dialog-title"
      >
        <p className="sidebar-eyebrow">Unsaved Saved Query</p>
        <h2 id="close-tab-dialog-title">Save changes before closing?</h2>
        <p>
          {tab.title} has edits that are not saved to its saved query. Ephemeral
          tabs close immediately, but saved work needs an explicit choice.
        </p>
        <div className="workbench-dialog-actions">
          <button type="button" className="drawer-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="drawer-button" onClick={onDiscard}>
            Discard Changes
          </button>
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            onClick={onSaveAndClose}
          >
            Save and Close
          </button>
        </div>
      </section>
    </div>
  )
}

function DeleteConnectionDialog({
  connection,
  onCancel,
  onConfirm,
}: {
  connection: ConnectionProfile
  onCancel(): void
  onConfirm(): void
}) {
  return (
    <div className="workbench-modal-overlay" role="presentation">
      <section
        className="workbench-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-connection-dialog-title"
      >
        <p className="sidebar-eyebrow">Delete Connection</p>
        <h2 id="delete-connection-dialog-title">Remove {connection.name}?</h2>
        <p>
          This removes the local connection profile from this workspace. Secrets
          referenced by the profile are not shown or exported by this action.
        </p>
        <div className="workbench-dialog-actions">
          <button type="button" className="drawer-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="drawer-button drawer-button--danger"
            onClick={onConfirm}
          >
            Delete Connection
          </button>
        </div>
      </section>
    </div>
  )
}

function resolveEnvironmentPreview(
  environments: EnvironmentProfile[],
  draft: EnvironmentProfile,
) {
  const environmentMap = new Map(
    environments.map((environment) => [environment.id, environment]),
  )
  environmentMap.set(draft.id, draft)

  const resolvedChain: EnvironmentProfile[] = []
  const visited = new Set<string>()
  let current: EnvironmentProfile | undefined = draft

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    resolvedChain.unshift(current)
    current = current.inheritsFrom
      ? environmentMap.get(current.inheritsFrom)
      : undefined
  }

  const variables: Record<string, string> = {}
  const inheritedChain: string[] = []
  const sensitiveKeys = new Set<string>()

  for (const environment of resolvedChain) {
    inheritedChain.push(environment.label)
    Object.assign(variables, environment.variables)

    for (const key of environment.sensitiveKeys) {
      sensitiveKeys.add(key)
    }
  }

  const unresolvedKeys = Object.entries(variables)
    .filter(([, value]) => value.includes('${'))
    .map(([key]) => key)

  return {
    variables,
    sensitiveKeys: [...sensitiveKeys],
    unresolvedKeys,
    inheritedChain,
  }
}

function normalizeColor(value: string | undefined) {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : '#2dbf9b'
}

function BootSurface({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="boot-surface">
      <div className="boot-dialog">
        <p className="sidebar-eyebrow">Desktop Workbench</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
    </div>
  )
}

function EnvironmentWorkspace({
  activeEnvironment,
  environments,
  onCreateEnvironment,
  onSaveEnvironment,
}: {
  activeEnvironment?: EnvironmentProfile
  environments: EnvironmentProfile[]
  onCreateEnvironment(): void
  onSaveEnvironment(environment: EnvironmentProfile): void
}) {
  const [environmentDraft, setEnvironmentDraft] = useState(activeEnvironment)
  const [newVariableKey, setNewVariableKey] = useState('')
  const [newVariableValue, setNewVariableValue] = useState('')
  const [newVariableSecret, setNewVariableSecret] = useState(false)

  if (!environmentDraft) {
    return (
      <section className="environment-workspace" aria-label="Environment workspace">
        <div className="environment-empty">
          <p className="sidebar-eyebrow">Environments</p>
          <h1>Create an environment.</h1>
          <p>
            Environments hold variables, risk settings, and safety behavior. Add one,
            then assign it from a connection profile.
          </p>
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            onClick={onCreateEnvironment}
          >
            New Environment
          </button>
        </div>
      </section>
    )
  }

  const environmentOptions = environments.filter((item) => item.id !== environmentDraft.id)
  const variableEntries = Object.entries(environmentDraft.variables).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const resolvedPreview = resolveEnvironmentPreview(environments, environmentDraft)
  const resolvedEntries = Object.entries(resolvedPreview.variables).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const sensitiveKeys = new Set(environmentDraft.sensitiveKeys)
  const resolvedSensitiveKeys = new Set(resolvedPreview.sensitiveKeys)
  const unresolvedKeys = new Set(resolvedPreview.unresolvedKeys)

  const updateDraft = (patch: Partial<EnvironmentProfile>) => {
    setEnvironmentDraft((current) =>
      current
        ? {
            ...current,
            ...patch,
            updatedAt: new Date().toISOString(),
          }
        : current,
    )
  }

  const updateVariableKey = (currentKey: string, nextKey: string) => {
    setEnvironmentDraft((current) => {
      if (!current) {
        return current
      }

      const variables = { ...current.variables }
      const value = variables[currentKey] ?? ''
      delete variables[currentKey]

      if (nextKey) {
        variables[nextKey] = value
      }

      return {
        ...current,
        variables,
        sensitiveKeys: current.sensitiveKeys
          .map((key) => (key === currentKey ? nextKey : key))
          .filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index),
        updatedAt: new Date().toISOString(),
      }
    })
  }

  const updateVariableValue = (key: string, value: string) => {
    setEnvironmentDraft((current) =>
      current
        ? {
            ...current,
            variables: {
              ...current.variables,
              [key]: value,
            },
            updatedAt: new Date().toISOString(),
          }
        : current,
    )
  }

  const toggleSensitiveKey = (key: string) => {
    setEnvironmentDraft((current) =>
      current
        ? {
            ...current,
            sensitiveKeys: current.sensitiveKeys.includes(key)
              ? current.sensitiveKeys.filter((item) => item !== key)
              : [...current.sensitiveKeys, key],
            updatedAt: new Date().toISOString(),
          }
        : current,
    )
  }

  const deleteVariable = (key: string) => {
    setEnvironmentDraft((current) => {
      if (!current) {
        return current
      }

      const variables = { ...current.variables }
      delete variables[key]

      return {
        ...current,
        variables,
        sensitiveKeys: current.sensitiveKeys.filter((item) => item !== key),
        updatedAt: new Date().toISOString(),
      }
    })
  }

  const addVariable = () => {
    const key = newVariableKey.trim()

    if (!key) {
      return
    }

    const shouldMarkSensitive =
      newVariableSecret || /password|secret|token|key|pwd/i.test(key)

    setEnvironmentDraft((current) =>
      current
        ? {
            ...current,
            variables: {
              ...current.variables,
              [key]: newVariableValue,
            },
            sensitiveKeys:
              shouldMarkSensitive && !current.sensitiveKeys.includes(key)
                ? [...current.sensitiveKeys, key]
                : current.sensitiveKeys,
            updatedAt: new Date().toISOString(),
          }
        : current,
    )
    setNewVariableKey('')
    setNewVariableValue('')
    setNewVariableSecret(false)
  }

  return (
    <section className="environment-workspace" aria-label="Environment workspace">
      <div className="environment-header">
        <div>
          <p className="sidebar-eyebrow">Environment</p>
          <h1>{environmentDraft.label}</h1>
        </div>
        <div className="environment-actions">
          <button type="button" className="drawer-button" onClick={onCreateEnvironment}>
            New Environment
          </button>
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            onClick={() => onSaveEnvironment(environmentDraft)}
          >
            Save Environment
          </button>
        </div>
      </div>

      <div className="environment-body">
        <section className="environment-card">
          <div className="environment-section-header">
            <strong>Profile</strong>
            <span>{environmentDraft.risk}</span>
          </div>
          <div className="environment-form-grid">
            <label className="environment-field">
              <span>Label</span>
              <input
                value={environmentDraft.label}
                onChange={(event) => updateDraft({ label: event.target.value })}
              />
            </label>
            <label className="environment-field">
              <span>Color</span>
              <span className="environment-color-picker">
                <input
                  type="color"
                  aria-label="Environment color"
                  value={normalizeColor(environmentDraft.color)}
                  onChange={(event) => updateDraft({ color: event.target.value })}
                />
                <span
                  className="environment-color-swatch"
                  style={{ backgroundColor: normalizeColor(environmentDraft.color) }}
                />
              </span>
            </label>
            <label className="environment-field">
              <span>Risk</span>
              <select
                value={environmentDraft.risk}
                onChange={(event) =>
                  updateDraft({ risk: event.target.value as EnvironmentProfile['risk'] })
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <label className="environment-field">
              <span>Inherits from</span>
              <select
                value={environmentDraft.inheritsFrom ?? ''}
                onChange={(event) =>
                  updateDraft({ inheritsFrom: event.target.value || undefined })
                }
              >
                <option value="">None</option>
                {environmentOptions.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="drawer-toggle-row">
            <button
              type="button"
              className={`drawer-toggle${environmentDraft.requiresConfirmation ? ' is-active' : ''}`}
              onClick={() =>
                updateDraft({
                  requiresConfirmation: !environmentDraft.requiresConfirmation,
                })
              }
            >
              Confirm risky actions
            </button>
            <button
              type="button"
              className={`drawer-toggle${environmentDraft.safeMode ? ' is-active' : ''}`}
              onClick={() => updateDraft({ safeMode: !environmentDraft.safeMode })}
            >
              Safe mode
            </button>
          </div>
        </section>

        <section className="environment-card">
          <div className="environment-section-header">
            <strong>Variables</strong>
            <span>{variableEntries.length}</span>
          </div>

          <div className="environment-variable-grid">
            {variableEntries.map(([key, value]) => {
              const secret = sensitiveKeys.has(key)
              return (
                <div key={key} className="environment-variable-row">
                  <input
                    aria-label={`Environment variable key ${key}`}
                    value={key}
                    onChange={(event) => updateVariableKey(key, event.target.value)}
                  />
                  <input
                    aria-label={`Environment variable value ${key}`}
                    value={value}
                    onChange={(event) => updateVariableValue(key, event.target.value)}
                  />
                  <button
                    type="button"
                    className={`drawer-toggle${secret ? ' is-active' : ''}`}
                    aria-label={
                      secret
                        ? `Unmark ${key} as secret`
                        : `Mark ${key} as secret`
                    }
                    onClick={() => toggleSensitiveKey(key)}
                  >
                    Secret
                  </button>
                  <button
                    type="button"
                    className="drawer-mini-button"
                    aria-label={`Delete variable ${key}`}
                    onClick={() => deleteVariable(key)}
                  >
                    x
                  </button>
                </div>
              )
            })}

            <div className="environment-variable-row environment-variable-row--new">
              <input
                aria-label="New variable key"
                placeholder="DB_HOST"
                value={newVariableKey}
                onChange={(event) => setNewVariableKey(event.target.value)}
              />
              <input
                aria-label="New variable value"
                placeholder="localhost"
                value={newVariableValue}
                onChange={(event) => setNewVariableValue(event.target.value)}
              />
              <button
                type="button"
                className={`drawer-toggle${newVariableSecret ? ' is-active' : ''}`}
                aria-label="Mark new variable as secret"
                onClick={() => setNewVariableSecret((current) => !current)}
              >
                Secret
              </button>
              <button type="button" className="drawer-button" onClick={addVariable}>
                Add
              </button>
            </div>
          </div>
        </section>

        <section className="environment-card">
          <div className="environment-section-header">
            <strong>Resolved Preview</strong>
            <span>{resolvedPreview.inheritedChain.join(' / ') || environmentDraft.label}</span>
          </div>

          {resolvedPreview.unresolvedKeys.length > 0 ? (
            <div className="drawer-callout is-error">
              <strong>Unresolved variables</strong>
              <span>{resolvedPreview.unresolvedKeys.join(', ')}</span>
            </div>
          ) : null}

          <div className="drawer-variables">
            {resolvedEntries.map(([key, value]) => {
              const hidden = resolvedSensitiveKeys.has(key)
              return (
                <div
                  key={key}
                  className={`drawer-variable-row${unresolvedKeys.has(key) ? ' is-unresolved' : ''}`}
                >
                  <span>{key}</span>
                  <code>{hidden ? '********' : value}</code>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </section>
  )
}

function WelcomeSurface({
  onCreateConnection,
  onImportWorkspace,
  onOpenDiagnostics,
}: {
  onCreateConnection(): void
  onImportWorkspace(): void
  onOpenDiagnostics(): void
}) {
  return (
    <section className="welcome-surface" aria-label="First run onboarding">
      <div className="welcome-panel">
        <p className="sidebar-eyebrow">Universality Desktop</p>
        <h1>Connect to your first datastore.</h1>
        <p>
          Start with a real connection. Universality will keep credentials in the
          desktop secret store and keep this workspace local to your machine.
        </p>
        <div className="welcome-actions">
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            onClick={onCreateConnection}
          >
            New Connection
          </button>
          <button type="button" className="drawer-button" onClick={onImportWorkspace}>
            Import Workspace
          </button>
          <button type="button" className="drawer-button" onClick={onOpenDiagnostics}>
            Open Diagnostics
          </button>
        </div>
      </div>
    </section>
  )
}

function resolveThemeMode(theme: WorkspaceSnapshot['preferences']['theme']) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }

  return theme
}

function builderStateForTab(
  tab: QueryTabState,
  connection: ConnectionProfile,
  draftStates: Record<string, QueryBuilderState>,
): QueryBuilderState | undefined {
  if (connection.engine !== 'mongodb') {
    return undefined
  }

  const draftState = draftStates[tab.id]

  if (isMongoFindBuilderState(draftState)) {
    return draftState
  }

  if (isMongoFindBuilderState(tab.builderState)) {
    return tab.builderState
  }

  return createDefaultMongoFindBuilderState(
    mongoCollectionFromQueryText(tab.queryText),
    mongoLimitFromQueryText(tab.queryText),
  )
}

function mongoCollectionFromQueryText(queryText: string) {
  try {
    const parsed = JSON.parse(queryText) as { collection?: unknown }
    return typeof parsed.collection === 'string' ? parsed.collection : ''
  } catch {
    return ''
  }
}

function mongoLimitFromQueryText(queryText: string) {
  try {
    const parsed = JSON.parse(queryText) as { limit?: unknown }
    return typeof parsed.limit === 'number' && Number.isFinite(parsed.limit) && parsed.limit > 0
      ? Math.floor(parsed.limit)
      : 50
  } catch {
    return 50
  }
}

function defaultCapabilities(): ExecutionCapabilities {
  return {
    canCancel: false,
    canExplain: false,
    supportsLiveMetadata: false,
    editorLanguage: 'sql',
    defaultRowLimit: 200,
  }
}

function deriveCapabilities(
  snapshot: WorkspaceSnapshot,
  connection: ConnectionProfile,
): ExecutionCapabilities {
  const manifest = snapshot.adapterManifests.find(
    (item) => item.engine === connection.engine,
  )
  const capabilities = new Set(manifest?.capabilities ?? [])

  return {
    canCancel: capabilities.has('supports_query_cancellation'),
    canExplain: capabilities.has('supports_explain_plan'),
    supportsLiveMetadata:
      capabilities.has('supports_schema_browser') ||
      capabilities.has('supports_key_browser') ||
      capabilities.has('supports_document_view') ||
      capabilities.has('supports_graph_view') ||
      capabilities.has('supports_index_management') ||
      capabilities.has('supports_metrics_collection'),
    editorLanguage: editorLanguageForConnection(connection),
    defaultRowLimit: defaultRowLimitForConnection(connection),
  }
}

function selectPayload(payloads: ResultPayload[], selectedRenderer?: string) {
  if (payloads.length === 0) {
    return undefined
  }

  return (
    payloads.find((payload) => payload.renderer === selectedRenderer) ?? payloads[0]
  )
}

function appendFieldToQueryText(queryText: string, fieldPath: string) {
  const trimmedField = fieldPath.trim()

  if (!trimmedField) {
    return queryText
  }

  if (!queryText.trim()) {
    return trimmedField
  }

  return `${queryText.trimEnd()}\n${trimmedField}`
}

function DesktopCodeEditor({
  value,
  language,
  theme,
  onChange,
  onDropField,
}: {
  value: string
  language: string
  theme: 'light' | 'dark'
  onChange(value: string): void
  onDropField?(fieldPath: string): void
}) {
  const [LoadedEditor, setLoadedEditor] = useState<null | ComponentType<{
    height: string
    language: string
    value: string
    theme: string
    options: Record<string, unknown>
    onChange(value: string | undefined): void
  }>>(null)

  useEffect(() => {
    let mounted = true

    void import('@monaco-editor/react')
      .then((module) => {
        if (mounted) {
          setLoadedEditor(() => module.default)
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadedEditor(null)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    const fieldPath = readFieldDragData(event)

    if (fieldPath) {
      onDropField(fieldPath)
    }
  }

  if (!LoadedEditor) {
    return (
      <textarea
        aria-label="Query editor"
        className="editor-textarea"
        value={value}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  return (
    <div className="editor-monaco-frame" onDragOver={handleDragOver} onDrop={handleDrop}>
      <LoadedEditor
        height="100%"
        language={language}
        value={value}
        theme={theme === 'light' ? 'vs' : 'vs-dark'}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          lineNumbersMinChars: 3,
          padding: { top: 12 },
        }}
        onChange={(nextValue) => onChange(nextValue ?? '')}
      />
    </div>
  )
}

export default App
