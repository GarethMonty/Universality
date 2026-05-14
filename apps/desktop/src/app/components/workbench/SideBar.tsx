import { useMemo, useRef, useState } from 'react'
import type {
  ClosedQueryTabSnapshot,
  ConnectionGroupMode,
  ConnectionProfile,
  EnvironmentProfile,
  ExplorerNode,
  SavedWorkItem,
  ScopedQueryTarget,
  UiState,
} from '@datapadplusplus/shared-types'
import { ConnectionsPane } from './SideBar.connections-pane'
import { connectionGroupLabel } from './SideBar.helpers'
import { EnvironmentsPane } from './SideBar.environments-pane'
import { ExplorerPane } from './SideBar.explorer-pane'
import { SavedWorkPane } from './SideBar.saved-work-pane'
import { SearchPane } from './SideBar.search-pane'

interface SideBarProps {
  ui: UiState
  width: number
  connections: ConnectionProfile[]
  environments: EnvironmentProfile[]
  savedWork: SavedWorkItem[]
  closedTabs: ClosedQueryTabSnapshot[]
  explorerItems: ExplorerNode[]
  explorerSummary?: string
  explorerStatus: 'idle' | 'loading' | 'ready'
  activeConnectionId: string
  activeEnvironmentId: string
  commandPaletteEnabled: boolean
  commandQuery: string
  commandItems: string[]
  onCommandQueryChange(value: string): void
  onRunCommand(command: string): void
  onSelectConnection(connectionId: string): void
  onSelectEnvironment(environmentId: string): void
  onCreateConnection(): void
  onCreateEnvironment(): void
  onConnectionGroupModeChange(value: ConnectionGroupMode): void
  onSidebarSectionExpandedChange(sectionId: string, expanded: boolean): void
  onDuplicateConnection(connectionId: string): void
  onDeleteConnection(connectionId: string): void
  onOpenConnectionOperations(connectionId: string): void
  onOpenConnectionExplorer(connectionId: string): void
  onOpenConnectionDrawer(connectionId: string): void
  onOpenScopedQuery(connectionId: string, target: ScopedQueryTarget): void
  onCreateTab(connectionId?: string): void
  onSaveCurrentQuery(): void
  onOpenSavedWork(savedWorkId: string): void
  onDeleteSavedWork(savedWorkId: string): void
  onReopenClosedTab(closedTabId: string): void
  onExplorerFilterChange(value: string): void
  onRefreshExplorer(): void
  onSelectExplorerNode(node: ExplorerNode): void
  onResize(width: number): void
}

export function SideBar({
  ui,
  width,
  connections,
  environments,
  savedWork,
  closedTabs,
  explorerItems,
  explorerSummary,
  explorerStatus,
  activeConnectionId,
  activeEnvironmentId,
  commandPaletteEnabled,
  commandQuery,
  commandItems,
  onCommandQueryChange,
  onRunCommand,
  onSelectConnection,
  onSelectEnvironment,
  onCreateConnection,
  onCreateEnvironment,
  onConnectionGroupModeChange,
  onSidebarSectionExpandedChange,
  onDuplicateConnection,
  onDeleteConnection,
  onOpenConnectionOperations,
  onOpenConnectionExplorer,
  onOpenConnectionDrawer,
  onOpenScopedQuery,
  onCreateTab,
  onSaveCurrentQuery,
  onOpenSavedWork,
  onDeleteSavedWork,
  onReopenClosedTab,
  onExplorerFilterChange,
  onRefreshExplorer,
  onSelectExplorerNode,
  onResize,
}: SideBarProps) {
  const [connectionFilter, setConnectionFilter] = useState('')
  const connectionGroupMode = ui.connectionGroupMode ?? 'none'
  const [environmentFilter, setEnvironmentFilter] = useState('')
  const [savedWorkFilter, setSavedWorkFilter] = useState('')
  const [isResizing, setIsResizing] = useState(false)
  const lastPointerX = useRef(0)
  const sidebarSectionStates = ui.sidebarSectionStates ?? {}
  const connectionGroups = useMemo(() => {
    const filtered = connections.filter((connection) => {
      const haystack = `${connection.name} ${connection.engine} ${connection.group ?? ''} ${connection.tags.join(' ')}`.toLowerCase()
      return haystack.includes(connectionFilter.toLowerCase())
    })

    return filtered.reduce<Record<string, ConnectionProfile[]>>((accumulator, connection) => {
      const group = connectionGroupLabel(connection, connectionGroupMode, environments)
      accumulator[group] ??= []
      accumulator[group].push(connection)
      return accumulator
    }, {})
  }, [connectionFilter, connectionGroupMode, connections, environments])
  const savedWorkGroups = useMemo(() => {
    const filtered = savedWork.filter((item) => {
      const haystack = `${item.name} ${item.kind} ${item.folder ?? ''} ${item.tags.join(' ')}`.toLowerCase()
      return haystack.includes(savedWorkFilter.toLowerCase())
    })

    return filtered.reduce<Record<string, SavedWorkItem[]>>((accumulator, item) => {
      const folder = item.folder ?? 'Workspace'
      accumulator[folder] ??= []
      accumulator[folder].push(item)
      return accumulator
    }, {})
  }, [savedWork, savedWorkFilter])
  const filteredEnvironments = useMemo(() => {
    const filter = environmentFilter.toLowerCase()

    return environments.filter((environment) => {
      const haystack =
        `${environment.label} ${environment.risk} ${Object.keys(environment.variables).join(' ')}`.toLowerCase()
      return haystack.includes(filter)
    })
  }, [environmentFilter, environments])

  return (
    <aside className="workbench-sidebar" aria-label={`${ui.activeSidebarPane} sidebar`}>
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuemax={420}
        aria-valuenow={width}
        className={`pane-resize-handle pane-resize-handle--sidebar${isResizing ? ' is-active' : ''}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          lastPointerX.current = event.clientX
          setIsResizing(true)
        }}
        onPointerMove={(event) => {
          if (!isResizing) {
            return
          }

          const delta = event.clientX - lastPointerX.current
          lastPointerX.current = event.clientX
          onResize(width + delta)
        }}
        onPointerUp={() => setIsResizing(false)}
        onPointerCancel={() => setIsResizing(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            onResize(width - 16)
          }

          if (event.key === 'ArrowRight') {
            event.preventDefault()
            onResize(width + 16)
          }
        }}
      />

      {ui.activeSidebarPane === 'connections' ? (
        <ConnectionsPane
          activeConnectionId={activeConnectionId}
          connectionFilter={connectionFilter}
          connectionGroupMode={connectionGroupMode}
          connectionGroups={connectionGroups}
          environments={environments}
          sectionStates={sidebarSectionStates}
          onConnectionFilterChange={setConnectionFilter}
          onConnectionGroupModeChange={onConnectionGroupModeChange}
          onSidebarSectionExpandedChange={onSidebarSectionExpandedChange}
          onCreateConnection={onCreateConnection}
          onDeleteConnection={onDeleteConnection}
          onOpenConnectionOperations={onOpenConnectionOperations}
          onDuplicateConnection={onDuplicateConnection}
          onOpenConnectionExplorer={onOpenConnectionExplorer}
          onOpenConnectionDrawer={onOpenConnectionDrawer}
          onOpenScopedQuery={onOpenScopedQuery}
          onCreateTab={onCreateTab}
          onSelectConnection={onSelectConnection}
        />
      ) : null}

      {ui.activeSidebarPane === 'environments' ? (
        <EnvironmentsPane
          activeEnvironmentId={activeEnvironmentId}
          environmentFilter={environmentFilter}
          environments={filteredEnvironments}
          onCreateEnvironment={onCreateEnvironment}
          onEnvironmentFilterChange={setEnvironmentFilter}
          onSelectEnvironment={onSelectEnvironment}
        />
      ) : null}

      {ui.activeSidebarPane === 'explorer' ? (
        <ExplorerPane
          activeConnection={connections.find((connection) => connection.id === activeConnectionId)}
          explorerFilter={ui.explorerFilter}
          explorerItems={explorerItems}
          explorerStatus={explorerStatus}
          explorerSummary={explorerSummary}
          onExplorerFilterChange={onExplorerFilterChange}
          onRefreshExplorer={onRefreshExplorer}
          onSelectExplorerNode={onSelectExplorerNode}
          onOpenScopedQuery={(target) => onOpenScopedQuery(activeConnectionId, target)}
        />
      ) : null}

      {ui.activeSidebarPane === 'saved-work' ? (
        <SavedWorkPane
          closedTabs={closedTabs}
          savedWorkFilter={savedWorkFilter}
          savedWorkGroups={savedWorkGroups}
          sectionStates={sidebarSectionStates}
          onDeleteSavedWork={onDeleteSavedWork}
          onOpenSavedWork={onOpenSavedWork}
          onReopenClosedTab={onReopenClosedTab}
          onSidebarSectionExpandedChange={onSidebarSectionExpandedChange}
          onSaveCurrentQuery={onSaveCurrentQuery}
          onSavedWorkFilterChange={setSavedWorkFilter}
        />
      ) : null}

      {ui.activeSidebarPane === 'search' ? (
        <SearchPane
          commandPaletteEnabled={commandPaletteEnabled}
          commandItems={commandItems}
          commandQuery={commandQuery}
          connections={connections}
          environments={environments}
          sectionStates={sidebarSectionStates}
          savedWork={savedWork}
          closedTabs={closedTabs}
          onCommandQueryChange={onCommandQueryChange}
          onRunCommand={onRunCommand}
          onOpenSavedWork={onOpenSavedWork}
          onReopenClosedTab={onReopenClosedTab}
          onSidebarSectionExpandedChange={onSidebarSectionExpandedChange}
          onSelectConnection={onSelectConnection}
          onSelectEnvironment={onSelectEnvironment}
        />
      ) : null}
    </aside>
  )
}

