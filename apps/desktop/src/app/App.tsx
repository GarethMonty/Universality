import { useDeferredValue, useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import type {
  ConnectionProfile,
  ExecutionCapabilities,
  ResultPayload,
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
import { WarningIcon } from './components/workbench/icons'
import { AppStateProvider, useAppState } from './state/app-state'

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
    executionStatus,
    lastExecution,
    lastExecutionRequest,
    connectionTests,
    errorMessage,
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

  const snapshot = payload?.snapshot
  const activeConnection =
    snapshot?.connections.find((item) => item.id === snapshot.ui.activeConnectionId) ??
    snapshot?.connections[0]
  const activeTab =
    snapshot?.tabs.find((item) => item.id === snapshot.ui.activeTabId) ?? snapshot?.tabs[0]
  const activeEnvironment =
    snapshot?.environments.find((item) => item.id === snapshot.ui.activeEnvironmentId) ??
    snapshot?.environments[0]
  const loadExplorer = actions.loadExplorer
  const activeSidebarPane = snapshot?.ui.activeSidebarPane
  const sidebarCollapsed = snapshot?.ui.sidebarCollapsed
  const activeConnectionId = activeConnection?.id
  const activeEnvironmentId = activeEnvironment?.id

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
        void actions.executeQuery(activeTab.id)
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
        void actions.executeQuery(activeTab.id, 'explain')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actions, activeTab, commandPaletteOpen, snapshot])

  useEffect(() => {
    if (
      !activeConnectionId ||
      !activeEnvironmentId ||
      activeSidebarPane !== 'explorer' ||
      sidebarCollapsed
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
    loadExplorer,
    sidebarCollapsed,
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
        copy={errorMessage ?? 'Unexpected desktop startup failure.'}
      />
    )
  }

  if (!activeConnection || !activeTab || !activeEnvironment) {
    return (
      <BootSurface
        title="Workspace seed is incomplete."
        copy="Universality needs at least one connection, environment, and query tab to open the desktop shell."
      />
    )
  }

  const resolvedTheme = resolveThemeMode(snapshot.preferences.theme)
  const runtimeCapabilities =
    explorer?.capabilities ?? deriveCapabilities(snapshot, activeConnection)
  const explorerFilter = snapshot.ui.explorerFilter
  const explorerItems = (explorer?.nodes ?? snapshot.explorerNodes).filter((node) => {
    const matchesFamily =
      node.family === 'shared' || node.family === activeConnection.family
    const filter = explorerFilter.toLowerCase()
    const searchable = `${node.label} ${node.kind} ${node.detail} ${(node.path ?? []).join(' ')}`.toLowerCase()
    return matchesFamily && searchable.includes(filter)
  })
  const commandItems = [
    'Open command palette',
    'Open connections',
    'Open explorer',
    'Open saved work',
    'Create query tab',
    'Save current query',
    'Run current query',
    'Explain current query',
    'Open connection drawer',
    'Refresh explorer',
    'Refresh diagnostics',
    'Toggle theme',
    'Toggle sidebar',
    'Toggle bottom panel',
    'Lock workspace',
  ].filter((item) => item.toLowerCase().includes(deferredCommandQuery.toLowerCase()))
  const connectionTest = connectionTests[activeConnection.id]
  const activeRenderer =
    rendererPreference.tabId === activeTab.id &&
    activeTab.result?.rendererModes.some((mode) => mode === rendererPreference.renderer)
      ? rendererPreference.renderer
      : activeTab.result?.defaultRenderer
  const activePayload = selectPayload(activeTab.result?.payloads ?? [], activeRenderer)
  const canCancelExecution = Boolean(
    runtimeCapabilities.canCancel && lastExecution?.executionId,
  )

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
    void actions.updateUiState({
      activeActivity: 'connections',
      activeSidebarPane: 'connections',
      sidebarCollapsed: false,
      rightDrawer: 'connection',
    })
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

    if (command === 'Open explorer') {
      setActivity('explorer')
      return
    }

    if (command === 'Open saved work') {
      setActivity('saved-work')
      return
    }

    if (command === 'Create query tab') {
      void actions.createTab(activeConnection.id)
      return
    }

    if (command === 'Save current query') {
      void actions.saveCurrentQuery(activeTab.id)
      setActivity('saved-work')
      return
    }

    if (command === 'Run current query') {
      void actions.executeQuery(activeTab.id)
      return
    }

    if (command === 'Explain current query') {
      void actions.executeQuery(activeTab.id, 'explain')
      return
    }

    if (command === 'Open connection drawer') {
      openConnectionDrawer()
      return
    }

    if (command === 'Refresh explorer') {
      void actions.loadExplorer({
        connectionId: activeConnection.id,
        environmentId: activeEnvironment.id,
        limit: 50,
      })
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
      {errorMessage ? (
        <div className="workbench-alert" role="status">
          <WarningIcon className="alert-icon" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

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

      <div className="ads-workbench">
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
            connections={snapshot.connections}
            environments={snapshot.environments}
            savedWork={snapshot.savedWork}
            explorerItems={explorerItems}
            explorerSummary={explorer?.summary ?? explorerError}
            explorerStatus={explorerStatus}
            activeConnectionId={activeConnection.id}
            commandPaletteEnabled={snapshot.preferences.commandPaletteEnabled}
            commandQuery={commandQuery}
            commandItems={commandItems}
            onCommandQueryChange={setCommandQuery}
            onRunCommand={runCommand}
            onSelectConnection={(connectionId) => void actions.selectConnection(connectionId)}
            onCreateTab={() => void actions.createTab(activeConnection.id)}
            onOpenConnectionDrawer={openConnectionDrawer}
            onSaveCurrentQuery={() => void actions.saveCurrentQuery(activeTab.id)}
            onOpenSavedWork={(savedWorkId) => void actions.openSavedWork(savedWorkId)}
            onDeleteSavedWork={(savedWorkId) => void actions.deleteSavedWork(savedWorkId)}
            onExplorerFilterChange={(value) =>
              void actions.updateUiState({ explorerFilter: value })
            }
            onRefreshExplorer={() =>
              void actions.loadExplorer({
                connectionId: activeConnection.id,
                environmentId: activeEnvironment.id,
                limit: 50,
              })
            }
            onSelectExplorerNode={handleExplorerSelection}
          />
        ) : null}

        <div className="workbench-center">
          <main className="editor-workspace">
            <EditorTabs
              tabs={snapshot.tabs}
              activeTabId={activeTab.id}
              connections={snapshot.connections}
              onSelectTab={(tabId) => void actions.selectTab(tabId)}
              onCreateTab={() => void actions.createTab(activeConnection.id)}
            />

            <EditorToolbar
              connections={snapshot.connections}
              activeConnection={activeConnection}
              activeEnvironment={activeEnvironment}
              executionStatus={executionStatus}
              capabilities={runtimeCapabilities}
              canCancelExecution={canCancelExecution}
              bottomPanelVisible={snapshot.ui.bottomPanelVisible}
              onExecute={() => void actions.executeQuery(activeTab.id)}
              onExplain={() => void actions.executeQuery(activeTab.id, 'explain')}
              onCancel={() =>
                lastExecution?.executionId
                  ? void actions.cancelExecution(lastExecution.executionId, activeTab.id)
                  : undefined
              }
              onSelectConnection={(connectionId) => void actions.selectConnection(connectionId)}
              onOpenConnectionDrawer={openConnectionDrawer}
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
              <DesktopCodeEditor
                value={activeTab.queryText}
                language={runtimeCapabilities.editorLanguage}
                theme={resolvedTheme}
                onChange={(value) => void actions.updateQuery(activeTab.id, value)}
              />
            </div>
          </main>

          {snapshot.ui.bottomPanelVisible ? (
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
              onSelectPanelTab={(tab) =>
                void actions.updateUiState({
                  activeBottomPanelTab: tab,
                  bottomPanelVisible: true,
                })
              }
              onSelectRenderer={(renderer) =>
                setRendererPreference({ renderer, tabId: activeTab.id })
              }
              onResize={(delta) =>
                void actions.updateUiState({
                  bottomPanelHeight: snapshot.ui.bottomPanelHeight + delta,
                })
              }
              onClose={() =>
                void actions.updateUiState({
                  bottomPanelVisible: false,
                })
              }
              onConfirmExecution={(guardrailId, mode) =>
                void actions.executeQuery(activeTab.id, mode, guardrailId)
              }
            />
          ) : null}
        </div>

        {snapshot.ui.rightDrawer !== 'none' ? (
          <RightDrawer
            key={`${snapshot.ui.rightDrawer}-${activeConnection.id}-${activeEnvironment.id}`}
            view={snapshot.ui.rightDrawer}
            health={payload.health}
            theme={snapshot.preferences.theme}
            activeConnection={activeConnection}
            activeEnvironment={activeEnvironment}
            resolvedEnvironment={payload.resolvedEnvironment}
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
            onSaveConnection={(profile) => void actions.saveConnection(profile)}
            onSaveEnvironment={(profile) => void actions.saveEnvironment(profile)}
            onTestConnection={(profile) => void actions.testConnection(profile, activeEnvironment.id)}
            onRefreshDiagnostics={() => void actions.refreshDiagnostics()}
            onExportWorkspace={() => void actions.exportWorkspace(exportPassphrase)}
            onImportWorkspace={() =>
              void actions.importWorkspace(exportPassphrase, importPayload)
            }
            onApplyTemplate={(queryTemplate) =>
              queryTemplate
                ? void actions.updateQuery(activeTab.id, queryTemplate)
                : undefined
            }
            onToggleTheme={() =>
              void actions.setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
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
        onToggleBottomPanel={() =>
          void actions.updateUiState({
            bottomPanelVisible: !snapshot.ui.bottomPanelVisible,
          })
        }
        onOpenDiagnostics={openDiagnosticsDrawer}
      />
    </div>
  )
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

function resolveThemeMode(theme: WorkspaceSnapshot['preferences']['theme']) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }

  return theme
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
      capabilities.has('supports_document_view'),
    editorLanguage:
      connection.family === 'document'
        ? 'json'
        : connection.family === 'keyvalue'
          ? 'plaintext'
          : 'sql',
    defaultRowLimit: connection.family === 'document' ? 100 : 200,
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

function DesktopCodeEditor({
  value,
  language,
  theme,
  onChange,
}: {
  value: string
  language: string
  theme: 'light' | 'dark'
  onChange(value: string): void
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

  if (!LoadedEditor) {
    return (
      <textarea
        className="editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  return (
    <div className="editor-monaco-frame">
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
