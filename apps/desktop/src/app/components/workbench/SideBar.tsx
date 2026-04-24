import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type {
  ConnectionProfile,
  EnvironmentProfile,
  ExplorerNode,
  SavedWorkItem,
  UiState,
} from '@universality/shared-types'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectionsIcon,
  DatabaseIcon,
  ExplorerIcon,
  FavoriteIcon,
  JsonIcon,
  KeyValueIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  ReadOnlyIcon,
  SearchIcon,
  SettingsIcon,
  TableIcon,
} from './icons'

interface SideBarProps {
  ui: UiState
  connections: ConnectionProfile[]
  environments: EnvironmentProfile[]
  savedWork: SavedWorkItem[]
  explorerItems: ExplorerNode[]
  explorerSummary?: string
  explorerStatus: 'idle' | 'loading' | 'ready'
  activeConnectionId: string
  commandPaletteEnabled: boolean
  commandQuery: string
  commandItems: string[]
  onCommandQueryChange(value: string): void
  onRunCommand(command: string): void
  onSelectConnection(connectionId: string): void
  onCreateTab(): void
  onOpenConnectionDrawer(): void
  onSaveCurrentQuery(): void
  onOpenSavedWork(savedWorkId: string): void
  onDeleteSavedWork(savedWorkId: string): void
  onExplorerFilterChange(value: string): void
  onRefreshExplorer(): void
  onSelectExplorerNode(node: ExplorerNode): void
}

export function SideBar({
  ui,
  connections,
  environments,
  savedWork,
  explorerItems,
  explorerSummary,
  explorerStatus,
  activeConnectionId,
  commandPaletteEnabled,
  commandQuery,
  commandItems,
  onCommandQueryChange,
  onRunCommand,
  onSelectConnection,
  onCreateTab,
  onOpenConnectionDrawer,
  onSaveCurrentQuery,
  onOpenSavedWork,
  onDeleteSavedWork,
  onExplorerFilterChange,
  onRefreshExplorer,
  onSelectExplorerNode,
}: SideBarProps) {
  const [connectionFilter, setConnectionFilter] = useState('')
  const [savedWorkFilter, setSavedWorkFilter] = useState('')
  const connectionGroups = useMemo(() => {
    const filtered = connections.filter((connection) => {
      const haystack = `${connection.name} ${connection.engine} ${connection.group ?? ''} ${connection.tags.join(' ')}`.toLowerCase()
      return haystack.includes(connectionFilter.toLowerCase())
    })

    return filtered.reduce<Record<string, ConnectionProfile[]>>((accumulator, connection) => {
      const group = connection.group ?? 'Connections'
      accumulator[group] ??= []
      accumulator[group].push(connection)
      return accumulator
    }, {})
  }, [connectionFilter, connections])
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

  return (
    <aside className="workbench-sidebar" aria-label={`${ui.activeSidebarPane} sidebar`}>
      {ui.activeSidebarPane === 'connections' ? (
        <ConnectionsPane
          activeConnectionId={activeConnectionId}
          connectionFilter={connectionFilter}
          connectionGroups={connectionGroups}
          environments={environments}
          onConnectionFilterChange={setConnectionFilter}
          onCreateTab={onCreateTab}
          onOpenConnectionDrawer={onOpenConnectionDrawer}
          onSelectConnection={onSelectConnection}
        />
      ) : null}

      {ui.activeSidebarPane === 'explorer' ? (
        <ExplorerPane
          explorerFilter={ui.explorerFilter}
          explorerItems={explorerItems}
          explorerStatus={explorerStatus}
          explorerSummary={explorerSummary}
          onExplorerFilterChange={onExplorerFilterChange}
          onRefreshExplorer={onRefreshExplorer}
          onSelectExplorerNode={onSelectExplorerNode}
        />
      ) : null}

      {ui.activeSidebarPane === 'saved-work' ? (
        <SavedWorkPane
          savedWorkFilter={savedWorkFilter}
          savedWorkGroups={savedWorkGroups}
          onDeleteSavedWork={onDeleteSavedWork}
          onOpenSavedWork={onOpenSavedWork}
          onSaveCurrentQuery={onSaveCurrentQuery}
          onSavedWorkFilterChange={setSavedWorkFilter}
        />
      ) : null}

      {ui.activeSidebarPane === 'search' ? (
        <SearchPane
          commandPaletteEnabled={commandPaletteEnabled}
          commandItems={commandItems}
          commandQuery={commandQuery}
          onCommandQueryChange={onCommandQueryChange}
          onRunCommand={onRunCommand}
        />
      ) : null}
    </aside>
  )
}

function ConnectionsPane({
  activeConnectionId,
  connectionFilter,
  connectionGroups,
  environments,
  onConnectionFilterChange,
  onCreateTab,
  onOpenConnectionDrawer,
  onSelectConnection,
}: {
  activeConnectionId: string
  connectionFilter: string
  connectionGroups: Record<string, ConnectionProfile[]>
  environments: EnvironmentProfile[]
  onConnectionFilterChange(value: string): void
  onCreateTab(): void
  onOpenConnectionDrawer(): void
  onSelectConnection(connectionId: string): void
}) {
  return (
    <>
      <div className="sidebar-header">
        <h1>Connections</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="New query tab"
            title="New query tab"
            onClick={onCreateTab}
          >
            <PlusIcon className="sidebar-icon" />
          </button>
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="New connection"
            title="New connection"
            onClick={onOpenConnectionDrawer}
          >
            <ConnectionsIcon className="sidebar-icon" />
          </button>
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Search connections</span>
        <input
          type="search"
          placeholder="Search connections"
          value={connectionFilter}
          onChange={(event) => onConnectionFilterChange(event.target.value)}
        />
      </label>

      <div className="sidebar-scroll">
        {Object.entries(connectionGroups).map(([group, items]) => (
          <section key={group} className="sidebar-section">
            <div className="sidebar-section-header">
              <span>{group}</span>
            </div>

            {items.map((connection) => {
              const environment = environments.find((item) =>
                connection.environmentIds.includes(item.id),
              )

              return (
                <button
                  key={connection.id}
                  type="button"
                  className={`tree-item${connection.id === activeConnectionId ? ' is-active' : ''}`}
                  title={`${connection.name} / ${connection.engine}`}
                  onClick={() => onSelectConnection(connection.id)}
                >
                  <span className="tree-item-chevron">
                    <ChevronRightIcon className="tree-icon" />
                  </span>
                  <span className="tree-item-badge tree-item-badge--icon">
                    <EngineIcon connection={connection} />
                  </span>
                  <span className="tree-item-content">
                    <strong>{connection.name}</strong>
                    <span>
                      {connection.engine}
                      {environment ? ` / ${environment.label}` : ''}
                    </span>
                  </span>
                  <span className="tree-item-flags">
                    {connection.favorite ? (
                      <FavoriteIcon className="tree-flag-icon" aria-label="Favorite" />
                    ) : null}
                    {connection.readOnly ? (
                      <ReadOnlyIcon className="tree-flag-icon" aria-label="Read-only" />
                    ) : null}
                  </span>
                </button>
              )
            })}
          </section>
        ))}
      </div>
    </>
  )
}

function ExplorerPane({
  explorerFilter,
  explorerItems,
  explorerStatus,
  explorerSummary,
  onExplorerFilterChange,
  onRefreshExplorer,
  onSelectExplorerNode,
}: {
  explorerFilter: string
  explorerItems: ExplorerNode[]
  explorerStatus: 'idle' | 'loading' | 'ready'
  explorerSummary?: string
  onExplorerFilterChange(value: string): void
  onRefreshExplorer(): void
  onSelectExplorerNode(node: ExplorerNode): void
}) {
  return (
    <>
      <div className="sidebar-header">
        <h1>Explorer</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="Refresh explorer"
            title="Refresh explorer"
            onClick={onRefreshExplorer}
          >
            <RefreshIcon className="sidebar-icon" />
          </button>
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Filter explorer</span>
        <input
          type="search"
          placeholder="Filter explorer"
          value={explorerFilter}
          onChange={(event) => onExplorerFilterChange(event.target.value)}
        />
      </label>

      <div className="sidebar-meta-row">
        <span>{explorerSummary ?? 'Root objects'}</span>
        <span>{explorerStatus === 'loading' ? 'Loading' : `${explorerItems.length}`}</span>
      </div>

      <div className="sidebar-scroll">
        {explorerItems.map((item) => {
          const depth = Math.max(0, (item.path?.length ?? 1) - 1)

          return (
            <button
              key={item.id}
              type="button"
              className="tree-item"
              style={{ '--tree-depth': depth } as CSSProperties}
              title={`${item.label} / ${item.kind}`}
              onClick={() => onSelectExplorerNode(item)}
            >
              <span className="tree-item-chevron">
                {item.expandable ? (
                  <ChevronRightIcon className="tree-icon" />
                ) : (
                  <ChevronDownIcon className="tree-icon tree-icon--muted" />
                )}
              </span>
              <span className="tree-item-badge tree-item-badge--ghost">
                <ExplorerNodeIcon kind={item.kind} />
              </span>
              <span className="tree-item-content">
                <strong>{item.label}</strong>
                <span>
                  {item.kind}
                  {item.detail ? ` / ${item.detail}` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function SavedWorkPane({
  savedWorkFilter,
  savedWorkGroups,
  onDeleteSavedWork,
  onOpenSavedWork,
  onSaveCurrentQuery,
  onSavedWorkFilterChange,
}: {
  savedWorkFilter: string
  savedWorkGroups: Record<string, SavedWorkItem[]>
  onDeleteSavedWork(savedWorkId: string): void
  onOpenSavedWork(savedWorkId: string): void
  onSaveCurrentQuery(): void
  onSavedWorkFilterChange(value: string): void
}) {
  return (
    <>
      <div className="sidebar-header">
        <h1>Saved Work</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="Save current query"
            title="Save current query"
            onClick={onSaveCurrentQuery}
          >
            <PlusIcon className="sidebar-icon" />
          </button>
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Search saved work</span>
        <input
          type="search"
          placeholder="Search saved work"
          value={savedWorkFilter}
          onChange={(event) => onSavedWorkFilterChange(event.target.value)}
        />
      </label>

      <div className="sidebar-scroll">
        {Object.entries(savedWorkGroups).map(([folder, items]) => (
          <section key={folder} className="sidebar-section">
            <div className="sidebar-section-header">
              <span>{folder}</span>
            </div>

            {items.map((item) => (
              <div key={item.id} className="saved-work-row">
                <div className="saved-work-title-row">
                  <strong>{item.name}</strong>
                  <span>{item.kind}</span>
                </div>
                <p>{item.summary}</p>
                <div className="saved-work-meta-row">
                  <small>{item.tags.join(' / ')}</small>
                  <span className="saved-work-actions">
                    <button
                      type="button"
                      className="sidebar-icon-button sidebar-icon-button--inline"
                      aria-label={`Open saved work ${item.name}`}
                      title="Open saved work"
                      disabled={!item.queryText}
                      onClick={() => onOpenSavedWork(item.id)}
                    >
                      <PlayIcon className="sidebar-icon" />
                    </button>
                    <button
                      type="button"
                      className="sidebar-icon-button sidebar-icon-button--inline"
                      aria-label={`Delete saved work ${item.name}`}
                      title="Delete saved work"
                      onClick={() => onDeleteSavedWork(item.id)}
                    >
                      <CloseIcon className="sidebar-icon" />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

function SearchPane({
  commandPaletteEnabled,
  commandItems,
  commandQuery,
  onCommandQueryChange,
  onRunCommand,
}: {
  commandPaletteEnabled: boolean
  commandItems: string[]
  commandQuery: string
  onCommandQueryChange(value: string): void
  onRunCommand(command: string): void
}) {
  return (
    <>
      <div className="sidebar-header">
        <h1>Search</h1>
        <div className="sidebar-actions">
          <SearchIcon className="sidebar-icon sidebar-icon--static" />
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Search commands</span>
        <input
          type="search"
          placeholder="Search commands"
          value={commandQuery}
          onChange={(event) => onCommandQueryChange(event.target.value)}
        />
      </label>

      {!commandPaletteEnabled ? (
        <div className="sidebar-empty">
          <SettingsIcon className="empty-icon" />
          <p>Command palette disabled.</p>
        </div>
      ) : (
        <div className="sidebar-scroll sidebar-scroll--tight">
          {commandItems.map((item) => (
            <button
              key={item}
              type="button"
              className="command-row"
              onClick={() => onRunCommand(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function EngineIcon({ connection }: { connection: ConnectionProfile }) {
  if (connection.family === 'document') {
    return <JsonIcon className="tree-icon" />
  }

  if (connection.family === 'keyvalue') {
    return <KeyValueIcon className="tree-icon" />
  }

  return <DatabaseIcon className="tree-icon" />
}

function ExplorerNodeIcon({ kind }: { kind: string }) {
  if (kind === 'table' || kind === 'schema') {
    return <TableIcon className="tree-icon" />
  }

  if (kind === 'collection') {
    return <JsonIcon className="tree-icon" />
  }

  if (kind === 'prefix' || kind === 'hash') {
    return <KeyValueIcon className="tree-icon" />
  }

  return <ExplorerIcon className="tree-icon" />
}
