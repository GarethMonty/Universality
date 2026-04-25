import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import type {
  ClosedQueryTabSnapshot,
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
  EnvironmentsIcon,
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

type ConnectionGroupMode = 'environment' | 'database-type' | 'none'

const CONNECTION_GROUP_OPTIONS = [
  {
    mode: 'none',
    label: 'None',
    description: 'Show all connections in one list',
    Icon: ConnectionsIcon,
  },
  {
    mode: 'environment',
    label: 'Environment',
    description: 'Group by workspace environment',
    Icon: EnvironmentsIcon,
  },
  {
    mode: 'database-type',
    label: 'Type',
    description: 'Group by datastore family',
    Icon: DatabaseIcon,
  },
] as const satisfies ReadonlyArray<{
  mode: ConnectionGroupMode
  label: string
  description: string
  Icon: typeof ConnectionsIcon
}>

interface ConnectionTreeNode {
  id: string
  label: string
  kind: string
  detail?: string
  children?: ConnectionTreeNode[]
}

interface ConnectionContextMenuState {
  connectionId: string
  x: number
  y: number
}

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
  onDuplicateConnection(connectionId: string): void
  onDeleteConnection(connectionId: string): void
  onOpenConnectionExplorer(connectionId: string): void
  onCreateTab(): void
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
  onDuplicateConnection,
  onDeleteConnection,
  onOpenConnectionExplorer,
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
  const [connectionGroupMode, setConnectionGroupMode] =
    useState<ConnectionGroupMode>('none')
  const [environmentFilter, setEnvironmentFilter] = useState('')
  const [savedWorkFilter, setSavedWorkFilter] = useState('')
  const [isResizing, setIsResizing] = useState(false)
  const lastPointerX = useRef(0)
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
          onConnectionFilterChange={setConnectionFilter}
          onConnectionGroupModeChange={setConnectionGroupMode}
          onCreateConnection={onCreateConnection}
          onDeleteConnection={onDeleteConnection}
          onDuplicateConnection={onDuplicateConnection}
          onOpenConnectionExplorer={onOpenConnectionExplorer}
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
          closedTabs={closedTabs}
          savedWorkFilter={savedWorkFilter}
          savedWorkGroups={savedWorkGroups}
          onDeleteSavedWork={onDeleteSavedWork}
          onOpenSavedWork={onOpenSavedWork}
          onReopenClosedTab={onReopenClosedTab}
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
          savedWork={savedWork}
          closedTabs={closedTabs}
          onCommandQueryChange={onCommandQueryChange}
          onRunCommand={onRunCommand}
          onOpenSavedWork={onOpenSavedWork}
          onReopenClosedTab={onReopenClosedTab}
          onSelectConnection={onSelectConnection}
          onSelectEnvironment={onSelectEnvironment}
        />
      ) : null}
    </aside>
  )
}

function ConnectionsPane({
  activeConnectionId,
  connectionFilter,
  connectionGroupMode,
  connectionGroups,
  environments,
  onConnectionFilterChange,
  onConnectionGroupModeChange,
  onCreateConnection,
  onDeleteConnection,
  onDuplicateConnection,
  onOpenConnectionExplorer,
  onCreateTab,
  onSelectConnection,
}: {
  activeConnectionId: string
  connectionFilter: string
  connectionGroupMode: ConnectionGroupMode
  connectionGroups: Record<string, ConnectionProfile[]>
  environments: EnvironmentProfile[]
  onConnectionFilterChange(value: string): void
  onConnectionGroupModeChange(value: ConnectionGroupMode): void
  onCreateConnection(): void
  onDeleteConnection(connectionId: string): void
  onDuplicateConnection(connectionId: string): void
  onOpenConnectionExplorer(connectionId: string): void
  onCreateTab(): void
  onSelectConnection(connectionId: string): void
}) {
  const totalConnections = connectionsCount(connectionGroups)
  const [expandedConnections, setExpandedConnections] = useState<Record<string, boolean>>({})
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ConnectionContextMenuState>()
  const activeGroupOption =
    CONNECTION_GROUP_OPTIONS.find((option) => option.mode === connectionGroupMode) ??
    CONNECTION_GROUP_OPTIONS[0]
  const ActiveGroupIcon = activeGroupOption.Icon
  const expandConnectionTree = (connectionId: string) =>
    setExpandedConnections((current) =>
      current[connectionId] ? current : { ...current, [connectionId]: true },
    )
  const toggleConnectionTree = (connectionId: string) =>
    setExpandedConnections((current) => ({
      ...current,
      [connectionId]: !current[connectionId],
    }))
  const contextConnection = contextMenu
    ? Object.values(connectionGroups)
        .flat()
        .find((connection) => connection.id === contextMenu.connectionId)
    : undefined

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const closeContextMenu = () => setContextMenu(undefined)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('pointerdown', closeContextMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', closeContextMenu)
    return () => {
      window.removeEventListener('pointerdown', closeContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', closeContextMenu)
    }
  }, [contextMenu])

  const openContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    connection: ConnectionProfile,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      connectionId: connection.id,
      x: event.clientX,
      y: event.clientY,
    })
  }

  return (
    <>
      <div className="sidebar-header">
        <h1>Connections</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="New query tab"
            title="Open a new scratch query tab for the selected connection."
            disabled={totalConnections === 0}
            onClick={onCreateTab}
          >
            <PlusIcon className="sidebar-icon" />
          </button>
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="New connection"
            title="Create a new datastore connection profile."
            onClick={onCreateConnection}
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

      <div
        className="sidebar-group-dropdown"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setGroupDropdownOpen(false)
          }
        }}
      >
        <button
          type="button"
          className="sidebar-group-trigger"
          aria-haspopup="menu"
          aria-expanded={groupDropdownOpen}
          aria-label={`Group connections: ${activeGroupOption.label}`}
          title="Choose how the connection list is grouped."
          onClick={() => setGroupDropdownOpen((current) => !current)}
        >
          <ActiveGroupIcon className="sidebar-group-icon" />
          <span>
            <strong>Group</strong>
            <small>{activeGroupOption.label}</small>
          </span>
          <ChevronDownIcon className="sidebar-group-chevron" />
        </button>

        {groupDropdownOpen ? (
          <div className="sidebar-group-menu" role="menu" aria-label="Connection grouping">
            {CONNECTION_GROUP_OPTIONS.map((option) => {
              const OptionIcon = option.Icon
              const selected = option.mode === connectionGroupMode

              return (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`sidebar-group-menu-item${selected ? ' is-active' : ''}`}
                  onClick={() => {
                    onConnectionGroupModeChange(option.mode)
                    setGroupDropdownOpen(false)
                  }}
                >
                  <OptionIcon className="sidebar-group-icon" />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="sidebar-scroll">
        {Object.keys(connectionGroups).length === 0 ? (
          <div className="sidebar-empty">
            <ConnectionsIcon className="empty-icon" />
            <p>No connections yet.</p>
            <button type="button" className="sidebar-empty-action" onClick={onCreateConnection}>
              New Connection
            </button>
          </div>
        ) : null}

        {Object.entries(connectionGroups).map(([group, items]) => (
          <section key={group} className="sidebar-section">
            <div className="sidebar-section-header">
              <span>{group}</span>
            </div>

            {items.map((connection) => {
              const environment = environments.find((item) =>
                connection.environmentIds.includes(item.id),
              )
              const environmentStyle = environmentAccentVariables(environment)
              const expanded = Boolean(expandedConnections[connection.id])

              return (
                <div key={connection.id} className="connection-tree-block">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    className={`tree-item connection-tree-item${connection.id === activeConnectionId ? ' is-active' : ''}${environment ? ' has-environment-accent' : ''}`}
                    style={environmentStyle}
                    title={`${connection.name}: select this ${connection.engine} connection for query tabs and Explorer.`}
                    onClick={() => {
                      expandConnectionTree(connection.id)
                      onSelectConnection(connection.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        expandConnectionTree(connection.id)
                        onSelectConnection(connection.id)
                      }
                    }}
                    onContextMenu={(event) => openContextMenu(event, connection)}
                  >
                    <button
                      type="button"
                      className="tree-item-chevron tree-item-chevron-button"
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} connection ${connection.name}`}
                      title={`${expanded ? 'Collapse' : 'Expand'} ${connection.name} object tree.`}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleConnectionTree(connection.id)
                      }}
                    >
                      {expanded ? (
                        <ChevronDownIcon className="tree-icon" />
                      ) : (
                        <ChevronRightIcon className="tree-icon" />
                      )}
                    </button>
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
                      <button
                        type="button"
                        className="sidebar-icon-button sidebar-icon-button--inline"
                        aria-label={`Duplicate connection ${connection.name}`}
                        title={`Duplicate ${connection.name} into a new editable connection profile.`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onDuplicateConnection(connection.id)
                        }}
                      >
                        <PlusIcon className="sidebar-icon" />
                      </button>
                      <button
                        type="button"
                        className="sidebar-icon-button sidebar-icon-button--inline"
                        aria-label={`Delete connection ${connection.name}`}
                        title={`Delete ${connection.name} from this local workspace.`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onDeleteConnection(connection.id)
                        }}
                      >
                        <CloseIcon className="sidebar-icon" />
                      </button>
                    </span>
                  </div>

                  {expanded ? <ConnectionObjectTree connection={connection} /> : null}
                </div>
              )
            })}
          </section>
        ))}
      </div>

      {contextMenu && contextConnection ? (
        <div
          className="connection-context-menu"
          role="menu"
          aria-label={`Connection options for ${contextConnection.name}`}
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="connection-context-menu-item"
            aria-label={`Open Explorer for ${contextConnection.name}`}
            onClick={() => {
              setContextMenu(undefined)
              onOpenConnectionExplorer(contextConnection.id)
            }}
          >
            <ExplorerIcon className="connection-context-menu-icon" />
            <span>Open Explorer</span>
          </button>
        </div>
      ) : null}
    </>
  )
}

function ConnectionObjectTree({ connection }: { connection: ConnectionProfile }) {
  const nodes = useMemo(() => buildConnectionObjectTree(connection), [connection])
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const toggleNode = (nodeKey: string) =>
    setExpandedNodes((current) => ({
      ...current,
      [nodeKey]: !current[nodeKey],
    }))

  return (
    <div className="connection-object-tree" role="tree" aria-label={`${connection.name} objects`}>
      {nodes.map((node) => (
        <ConnectionObjectTreeNode
          key={node.id}
          depth={1}
          expandedNodes={expandedNodes}
          node={node}
          nodeKey={node.id}
          onToggleNode={toggleNode}
        />
      ))}
    </div>
  )
}

function ConnectionObjectTreeNode({
  depth,
  expandedNodes,
  node,
  nodeKey,
  onToggleNode,
}: {
  depth: number
  expandedNodes: Record<string, boolean>
  node: ConnectionTreeNode
  nodeKey: string
  onToggleNode(nodeKey: string): void
}) {
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const expanded = Boolean(expandedNodes[nodeKey])
  const toggleNode = () => {
    if (hasChildren) {
      onToggleNode(nodeKey)
    }
  }

  return (
    <>
      <div
        role="treeitem"
        tabIndex={hasChildren ? 0 : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={depth}
        className={`tree-item connection-object-item${hasChildren ? ' is-branch' : ''}`}
        style={{ '--tree-depth': depth } as CSSProperties}
        title={node.detail ? `${node.label}: ${node.detail}` : node.label}
        onClick={toggleNode}
        onKeyDown={(event) => {
          if (hasChildren && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            toggleNode()
          }
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="tree-item-chevron tree-item-chevron-button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
            title={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleNode(nodeKey)
            }}
          >
            {expanded ? (
              <ChevronDownIcon className="tree-icon" />
            ) : (
              <ChevronRightIcon className="tree-icon" />
            )}
          </button>
        ) : (
          <span className="tree-item-chevron">
            <span className="tree-icon tree-icon--spacer" />
          </span>
        )}
        <span className="tree-item-badge tree-item-badge--ghost">
          <ExplorerNodeIcon kind={node.kind} />
        </span>
        <span className="tree-item-content">
          <strong>{node.label}</strong>
          <span>
            {node.kind}
            {node.detail ? ` / ${node.detail}` : ''}
          </span>
        </span>
      </div>

      {expanded
        ? children.map((child) => {
            const childKey = `${nodeKey}/${child.id}`

            return (
              <ConnectionObjectTreeNode
                key={childKey}
                depth={depth + 1}
                expandedNodes={expandedNodes}
                node={child}
                nodeKey={childKey}
                onToggleNode={onToggleNode}
              />
            )
          })
        : null}
    </>
  )
}

function buildConnectionObjectTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  switch (connection.family) {
    case 'document':
      return documentConnectionTree(connection)
    case 'keyvalue':
      return keyValueConnectionTree(connection)
    case 'graph':
      return graphConnectionTree(connection)
    case 'timeseries':
      return timeseriesConnectionTree(connection)
    case 'widecolumn':
      return wideColumnConnectionTree(connection)
    case 'search':
      return searchConnectionTree(connection)
    case 'warehouse':
    case 'embedded-olap':
      return analyticsConnectionTree(connection)
    case 'sql':
    default:
      return sqlConnectionTree(connection)
  }
}

function sqlConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  const schema = defaultSqlSchema(connection)
  const supportsStoredRoutines = !['sqlite', 'duckdb'].includes(connection.engine)

  return [
    branch('schemas', 'Schemas', 'schemas', `${connection.engine} metadata scopes`, [
      branch(`schema-${schema}`, schema, 'schema', connection.database ?? 'default schema', [
        branch('tables', 'Tables', 'tables', 'Base tables and table-like relations', [
          leaf('table-accounts', 'accounts', 'table', 'sample table'),
          leaf('table-transactions', 'transactions', 'table', 'sample table'),
        ]),
        branch('views', 'Views', 'views', 'Saved select projections', [
          leaf('view-active-accounts', 'active_accounts', 'view', 'sample view'),
        ]),
        supportsStoredRoutines
          ? branch('stored-procedures', 'Stored Procedures', 'stored-procedures', 'Callable routines', [
              leaf('procedure-refresh-rollups', 'refresh_rollups', 'stored-procedure', 'sample procedure'),
            ])
          : branch('triggers', 'Triggers', 'triggers', 'Local table triggers', [
              leaf('trigger-audit-updated-at', 'audit_updated_at', 'trigger', 'sample trigger'),
            ]),
        branch('indexes', 'Indexes', 'indexes', 'Secondary access paths', [
          leaf('index-accounts-email', 'accounts_email_idx', 'index', 'sample index'),
        ]),
      ]),
    ]),
  ]
}

function documentConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  const database = connection.database || (connection.engine === 'litedb' ? 'local file' : 'admin')

  return [
    branch('databases', 'Databases', 'databases', 'Document database namespaces', [
      branch(`database-${database}`, database, 'database', `${connection.engine} database`, [
        branch('collections', 'Collections', 'collections', 'Document collections', [
          leaf('collection-products', 'products', 'collection', 'sample collection'),
          leaf('collection-inventory', 'inventory', 'collection', 'sample collection'),
          leaf('collection-orders', 'orders', 'collection', 'sample collection'),
        ]),
        branch('indexes', 'Indexes', 'indexes', 'Collection index definitions', [
          leaf('index-products-sku', 'products.sku_1', 'index', 'sample index'),
        ]),
      ]),
    ]),
  ]
}

function keyValueConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  if (connection.engine === 'memcached') {
    return [
      branch('namespaces', 'Namespaces', 'namespaces', 'Application key prefixes', [
        leaf('prefix-session', 'session:*', 'prefix', 'sample prefix'),
        leaf('prefix-cache', 'cache:*', 'prefix', 'sample prefix'),
      ]),
      branch('diagnostics', 'Diagnostics', 'diagnostics', 'Runtime cache metadata', [
        leaf('stats-slabs', 'slabs', 'metric', 'slab stats'),
        leaf('stats-items', 'items', 'metric', 'item stats'),
      ]),
    ]
  }

  return [
    branch('keyspaces', 'Key Spaces', 'keyspaces', 'Logical key groups and modules', [
      branch('prefixes', 'Prefixes', 'prefixes', 'SCAN-friendly key prefixes', [
        leaf('prefix-session', 'session:*', 'prefix', 'hashes'),
        leaf('prefix-cache', 'cache:*', 'prefix', 'strings'),
      ]),
      branch('streams', 'Streams', 'streams', 'Append-only event streams', [
        leaf('stream-orders', 'orders.events', 'stream', 'sample stream'),
      ]),
      branch('sets', 'Sets', 'sets', 'Set and sorted-set keys', [
        leaf('set-online-users', 'online_users', 'set', 'sample set'),
      ]),
    ]),
  ]
}

function graphConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  const database = connection.database || 'graph'

  return [
    branch('graphs', 'Graphs', 'graphs', 'Graph databases or named graphs', [
      branch(`graph-${database}`, database, 'graph', `${connection.engine} graph`, [
        branch('node-labels', 'Node Labels', 'node-labels', 'Vertex/node categories', [
          leaf('label-customer', 'Customer', 'node-label', 'sample label'),
          leaf('label-order', 'Order', 'node-label', 'sample label'),
        ]),
        branch('relationships', 'Relationship Types', 'relationships', 'Edges and relationship types', [
          leaf('rel-purchased', 'PURCHASED', 'relationship', 'sample relationship'),
        ]),
        branch('constraints', 'Indexes & Constraints', 'constraints', 'Graph lookup and uniqueness rules', [
          leaf('constraint-customer-id', 'Customer.id', 'constraint', 'sample constraint'),
        ]),
      ]),
    ]),
  ]
}

function timeseriesConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  if (connection.engine === 'prometheus') {
    return [
      branch('metrics', 'Metrics', 'metrics', 'PromQL metric families', [
        leaf('metric-up', 'up', 'metric', 'instant/range metric'),
        leaf('metric-http-duration', 'http_request_duration_seconds', 'metric', 'histogram'),
      ]),
      branch('labels', 'Labels', 'labels', 'Metric dimensions', [
        leaf('label-job', 'job', 'label', 'target label'),
        leaf('label-instance', 'instance', 'label', 'target label'),
      ]),
      branch('rules', 'Rules', 'rules', 'Alerting and recording rules', [
        leaf('rule-slo-burn', 'slo:burn_rate', 'rule', 'sample recording rule'),
      ]),
    ]
  }

  return [
    branch('buckets', 'Buckets', 'buckets', 'Time-series storage scopes', [
      branch('bucket-telemetry', 'telemetry', 'bucket', `${connection.engine} bucket`, [
        branch('measurements', 'Measurements', 'measurements', 'Series measurement names', [
          leaf('measurement-cpu', 'cpu_usage', 'measurement', 'sample measurement'),
          leaf('measurement-memory', 'memory_usage', 'measurement', 'sample measurement'),
        ]),
        branch('retention', 'Retention Policies', 'retention-policies', 'Data retention rules', [
          leaf('retention-thirty-days', '30d', 'retention-policy', 'sample policy'),
        ]),
      ]),
    ]),
  ]
}

function wideColumnConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  if (connection.engine === 'dynamodb') {
    return [
      branch('tables', 'Tables', 'tables', 'DynamoDB tables', [
        branch('table-orders', 'Orders', 'table', 'partition/sort-key table', [
          branch('indexes', 'Indexes', 'indexes', 'GSI and LSI definitions', [
            leaf('index-gsi-customer', 'GSI1CustomerOrders', 'index', 'sample GSI'),
          ]),
          branch('streams', 'Streams', 'streams', 'Change data capture', [
            leaf('stream-orders', 'Orders stream', 'stream', 'sample stream'),
          ]),
        ]),
      ]),
    ]
  }

  return [
    branch('keyspaces', 'Keyspaces', 'keyspaces', 'Wide-column namespaces', [
      branch('keyspace-app', 'app', 'keyspace', `${connection.engine} keyspace`, [
        branch('tables', 'Tables', 'tables', 'Partition-key-first tables', [
          leaf('table-events', 'events_by_customer', 'table', 'sample table'),
          leaf('table-orders', 'orders_by_day', 'table', 'sample table'),
        ]),
        branch('materialized-views', 'Materialized Views', 'materialized-views', 'Derived query tables', [
          leaf('view-orders-status', 'orders_by_status', 'materialized-view', 'sample view'),
        ]),
        branch('indexes', 'Indexes', 'indexes', 'SAI/secondary indexes', [
          leaf('index-events-type', 'events_type_idx', 'index', 'sample index'),
        ]),
      ]),
    ]),
  ]
}

function searchConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  return [
    branch('indices', 'Indices', 'indices', `${connection.engine} searchable indices`, [
      leaf('index-products', 'products', 'index', 'sample index'),
      leaf('index-events', 'events-*', 'index', 'sample index pattern'),
    ]),
    branch('data-streams', 'Data Streams', 'data-streams', 'Append-oriented streams', [
      leaf('stream-logs', 'logs-app-default', 'data-stream', 'sample stream'),
    ]),
    branch('mappings', 'Mappings', 'mappings', 'Field mappings and analyzers', [
      leaf('mapping-products', 'products mapping', 'mapping', 'sample mapping'),
    ]),
  ]
}

function analyticsConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  const dataset = connection.database || (connection.engine === 'bigquery' ? 'analytics' : 'public')
  const topLabel = connection.engine === 'bigquery' ? 'Datasets' : 'Schemas'
  const topKind = connection.engine === 'bigquery' ? 'datasets' : 'schemas'

  return [
    branch(topKind, topLabel, topKind, 'Analytical object namespaces', [
      branch(`dataset-${dataset}`, dataset, connection.engine === 'bigquery' ? 'dataset' : 'schema', `${connection.engine} namespace`, [
        branch('tables', 'Tables', 'tables', 'Columnar/warehouse tables', [
          leaf('table-orders', 'fact_orders', 'table', 'sample table'),
          leaf('table-customers', 'dim_customers', 'table', 'sample table'),
        ]),
        branch('views', 'Views', 'views', 'Saved analytical projections', [
          leaf('view-daily-sales', 'daily_sales', 'view', 'sample view'),
        ]),
        branch('jobs', 'Jobs & Tasks', 'jobs', 'Warehouse jobs, tasks, or scheduled queries', [
          leaf('job-refresh-rollups', 'refresh_rollups', 'job', 'sample job'),
        ]),
      ]),
    ]),
  ]
}

function defaultSqlSchema(connection: ConnectionProfile) {
  if (connection.engine === 'sqlite' || connection.engine === 'duckdb') {
    return 'main'
  }

  if (connection.engine === 'mysql' || connection.engine === 'mariadb') {
    return connection.database || 'default'
  }

  if (connection.engine === 'sqlserver') {
    return 'dbo'
  }

  return 'public'
}

function branch(
  id: string,
  label: string,
  kind: string,
  detail: string,
  children: ConnectionTreeNode[],
): ConnectionTreeNode {
  return { id, label, kind, detail, children }
}

function leaf(id: string, label: string, kind: string, detail: string): ConnectionTreeNode {
  return { id, label, kind, detail }
}

function connectionsCount(connectionGroups: Record<string, ConnectionProfile[]>) {
  return Object.values(connectionGroups).reduce((count, items) => count + items.length, 0)
}

function connectionGroupLabel(
  connection: ConnectionProfile,
  mode: ConnectionGroupMode,
  environments: EnvironmentProfile[],
) {
  if (mode === 'none') {
    return 'Connections'
  }

  if (mode === 'database-type') {
    return databaseTypeGroupLabel(connection)
  }

  const environment = environments.find((item) => connection.environmentIds.includes(item.id))

  return environment?.label ?? 'No Environment'
}

function databaseTypeGroupLabel(connection: ConnectionProfile) {
  if (connection.family === 'document') {
    return 'NoSQL / Document'
  }

  if (connection.family === 'keyvalue') {
    return 'Key-Value'
  }

  if (connection.family === 'graph') {
    return 'Graph'
  }

  if (connection.family === 'timeseries') {
    return 'Time-Series'
  }

  if (connection.family === 'widecolumn') {
    return 'Wide-Column'
  }

  if (connection.family === 'search') {
    return 'Search'
  }

  if (connection.family === 'warehouse') {
    return 'Warehouse'
  }

  if (connection.family === 'embedded-olap') {
    return 'Embedded OLAP'
  }

  return 'SQL'
}

function environmentAccentVariables(
  environment?: EnvironmentProfile,
): CSSProperties | undefined {
  const color = normalizeHexColor(environment?.color)

  if (!color) {
    return undefined
  }

  return {
    '--connection-env-color': color,
    '--connection-env-tint': hexToRgba(color, 0.09),
    '--connection-env-border': hexToRgba(color, 0.5),
  } as CSSProperties
}

function normalizeHexColor(color?: string) {
  if (!color) {
    return undefined
  }

  const trimmed = color.trim()

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, red, green, blue] = trimmed
    return `#${red}${red}${green}${green}${blue}${blue}`
  }

  return undefined
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function EnvironmentsPane({
  activeEnvironmentId,
  environmentFilter,
  environments,
  onCreateEnvironment,
  onEnvironmentFilterChange,
  onSelectEnvironment,
}: {
  activeEnvironmentId: string
  environmentFilter: string
  environments: EnvironmentProfile[]
  onCreateEnvironment(): void
  onEnvironmentFilterChange(value: string): void
  onSelectEnvironment(environmentId: string): void
}) {
  return (
    <>
      <div className="sidebar-header">
        <h1>Environments</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="New environment"
            title="Create a new environment with variables, color, and risk settings."
            onClick={onCreateEnvironment}
          >
            <PlusIcon className="sidebar-icon" />
          </button>
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Search environments</span>
        <input
          type="search"
          placeholder="Search environments"
          value={environmentFilter}
          onChange={(event) => onEnvironmentFilterChange(event.target.value)}
        />
      </label>

      <div className="sidebar-scroll">
        {environments.length === 0 ? (
          <div className="sidebar-empty">
            <EnvironmentsIcon className="empty-icon" />
            <p>No environments yet.</p>
            <button type="button" className="sidebar-empty-action" onClick={onCreateEnvironment}>
              New Environment
            </button>
          </div>
        ) : null}

        {environments.length > 0 ? (
          <section className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Workspace</span>
              <span>{environments.length}</span>
            </div>

            {environments.map((environment) => (
              <button
                key={environment.id}
                type="button"
                className={`tree-item${environment.id === activeEnvironmentId ? ' is-active' : ''}`}
                title={`${environment.label}: edit variables, secret flags, color, and ${environment.risk} risk guardrails.`}
                onClick={() => onSelectEnvironment(environment.id)}
              >
                <span className="tree-item-chevron">
                  <ChevronRightIcon className="tree-icon tree-icon--muted" />
                </span>
                <span
                  className="tree-item-badge tree-item-badge--swatch"
                  style={{ '--environment-color': environment.color } as CSSProperties}
                >
                  <EnvironmentsIcon className="tree-icon" />
                </span>
                <span className="tree-item-content">
                  <strong>{environment.label}</strong>
                  <span>
                    {environment.risk} / {Object.keys(environment.variables).length} vars
                  </span>
                </span>
                <span className="tree-item-flags">
                  {environment.requiresConfirmation ? (
                    <ReadOnlyIcon className="tree-flag-icon" aria-label="Requires confirmation" />
                  ) : null}
                </span>
              </button>
            ))}
          </section>
        ) : null}
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
            title="Refresh metadata for the active connection. Loaded child nodes are kept open."
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
        {explorerItems.length === 0 ? (
          <div className="sidebar-empty">
            <ExplorerIcon className="empty-icon" />
            <p>No explorer metadata loaded.</p>
          </div>
        ) : null}

        {explorerItems.map((item) => {
          const depth = Math.max(0, (item.path?.length ?? 1) - 1)

          return (
            <button
              key={item.id}
              type="button"
              className="tree-item"
              style={{ '--tree-depth': depth } as CSSProperties}
              title={
                item.expandable || item.scope
                  ? `${item.label}: inspect this ${item.kind} and load its child metadata.`
                  : `${item.label}: inspect this ${item.kind}.`
              }
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
  closedTabs,
  savedWorkFilter,
  savedWorkGroups,
  onDeleteSavedWork,
  onOpenSavedWork,
  onReopenClosedTab,
  onSaveCurrentQuery,
  onSavedWorkFilterChange,
}: {
  closedTabs: ClosedQueryTabSnapshot[]
  savedWorkFilter: string
  savedWorkGroups: Record<string, SavedWorkItem[]>
  onDeleteSavedWork(savedWorkId: string): void
  onOpenSavedWork(savedWorkId: string): void
  onReopenClosedTab(closedTabId: string): void
  onSaveCurrentQuery(): void
  onSavedWorkFilterChange(value: string): void
}) {
  const hasSavedWork = Object.keys(savedWorkGroups).length > 0

  return (
    <>
      <div className="sidebar-header">
        <h1>Saved Work</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="Save current query"
            title="Save the active query tab into Saved Work."
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
        {!hasSavedWork && closedTabs.length === 0 ? (
          <div className="sidebar-empty">
            <DatabaseIcon className="empty-icon" />
            <p>No saved work yet.</p>
          </div>
        ) : null}

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
                      title={`Open ${item.name} in a new query tab.`}
                      disabled={!item.queryText}
                      onClick={() => onOpenSavedWork(item.id)}
                    >
                      <PlayIcon className="sidebar-icon" />
                    </button>
                    <button
                      type="button"
                      className="sidebar-icon-button sidebar-icon-button--inline"
                      aria-label={`Delete saved work ${item.name}`}
                      title={`Delete saved work item ${item.name}.`}
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

        {closedTabs.length > 0 ? (
          <section className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Closed Tabs</span>
            </div>

            {closedTabs.slice(0, 8).map((tab) => (
              <div key={`${tab.id}-${tab.closedAt}`} className="saved-work-row">
                <div className="saved-work-title-row">
                  <strong>{tab.title}</strong>
                  <span>{tab.dirty ? 'edited' : 'closed'}</span>
                </div>
                <p>{formatClosedAt(tab.closedAt)}</p>
                <div className="saved-work-meta-row">
                  <small>{tab.language} / recovery</small>
                  <span className="saved-work-actions">
                    <button
                      type="button"
                      className="sidebar-icon-button sidebar-icon-button--inline"
                      aria-label={`Reopen closed tab ${tab.title}`}
                      title={`Recover recently closed tab ${tab.title}.`}
                      onClick={() => onReopenClosedTab(tab.id)}
                    >
                      <PlayIcon className="sidebar-icon" />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </>
  )
}

function formatClosedAt(closedAt: string) {
  const date = new Date(closedAt)

  if (Number.isNaN(date.getTime())) {
    return 'Closed recently'
  }

  return `Closed ${date.toLocaleString()}`
}

function SearchPane({
  commandPaletteEnabled,
  commandItems,
  commandQuery,
  connections,
  environments,
  savedWork,
  closedTabs,
  onCommandQueryChange,
  onRunCommand,
  onOpenSavedWork,
  onReopenClosedTab,
  onSelectConnection,
  onSelectEnvironment,
}: {
  commandPaletteEnabled: boolean
  commandItems: string[]
  commandQuery: string
  connections: ConnectionProfile[]
  environments: EnvironmentProfile[]
  savedWork: SavedWorkItem[]
  closedTabs: ClosedQueryTabSnapshot[]
  onCommandQueryChange(value: string): void
  onRunCommand(command: string): void
  onOpenSavedWork(savedWorkId: string): void
  onReopenClosedTab(closedTabId: string): void
  onSelectConnection(connectionId: string): void
  onSelectEnvironment(environmentId: string): void
}) {
  const query = commandQuery.trim().toLowerCase()
  const connectionResults = connections
    .filter((connection) =>
      searchMatches(query, connection.name, connection.engine, connection.group, ...connection.tags),
    )
    .slice(0, 6)
  const savedWorkResults = savedWork
    .filter((item) =>
      searchMatches(query, item.name, item.kind, item.summary, item.folder, ...item.tags),
    )
    .slice(0, 6)
  const closedTabResults = closedTabs
    .filter((tab) => searchMatches(query, tab.title, tab.language, tab.closeReason))
    .slice(0, 4)
  const environmentResults = environments
    .filter((environment) =>
      searchMatches(
        query,
        environment.label,
        environment.risk,
        ...Object.keys(environment.variables),
      ),
    )
    .slice(0, 6)
  const hasWorkspaceResults =
    connectionResults.length > 0 ||
    savedWorkResults.length > 0 ||
    closedTabResults.length > 0 ||
    environmentResults.length > 0
  const hasCommandResults = commandPaletteEnabled && commandItems.length > 0

  return (
    <>
      <div className="sidebar-header">
        <h1>Search</h1>
        <div className="sidebar-actions">
          <SearchIcon className="sidebar-icon sidebar-icon--static" />
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Search workspace and commands</span>
        <input
          type="search"
          placeholder="Search commands, connections, saved work"
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
          {hasCommandResults ? (
            <SearchResultGroup label="Commands" count={commandItems.length}>
              {commandItems.map((item) => (
                <SearchResultRow
                  key={item}
                  icon={<SearchIcon className="search-result-icon" />}
                  label={item}
                  meta={commandMeta(item)}
                  onClick={() => onRunCommand(item)}
                />
              ))}
            </SearchResultGroup>
          ) : null}

          {connectionResults.length > 0 ? (
            <SearchResultGroup label="Connections" count={connectionResults.length}>
              {connectionResults.map((connection) => (
                <SearchResultRow
                  key={connection.id}
                  icon={<EngineIcon connection={connection} />}
                  label={connection.name}
                  meta={`${connection.engine} / ${connection.host || connection.database || 'local'}`}
                  onClick={() => onSelectConnection(connection.id)}
                />
              ))}
            </SearchResultGroup>
          ) : null}

          {savedWorkResults.length > 0 ? (
            <SearchResultGroup label="Saved Work" count={savedWorkResults.length}>
              {savedWorkResults.map((item) => (
                <SearchResultRow
                  key={item.id}
                  disabled={!item.queryText}
                  icon={<DatabaseIcon className="search-result-icon" />}
                  label={item.name}
                  meta={`${item.kind} / ${item.folder ?? 'Workspace'}`}
                  onClick={() => onOpenSavedWork(item.id)}
                />
              ))}
            </SearchResultGroup>
          ) : null}

          {closedTabResults.length > 0 ? (
            <SearchResultGroup label="Closed Tabs" count={closedTabResults.length}>
              {closedTabResults.map((tab) => (
                <SearchResultRow
                  key={`${tab.id}-${tab.closedAt}`}
                  icon={<PlayIcon className="search-result-icon" />}
                  label={tab.title}
                  meta={`${tab.language} / recover`}
                  onClick={() => onReopenClosedTab(tab.id)}
                />
              ))}
            </SearchResultGroup>
          ) : null}

          {environmentResults.length > 0 ? (
            <SearchResultGroup label="Environments" count={environmentResults.length}>
              {environmentResults.map((environment) => (
                <SearchResultRow
                  key={environment.id}
                  icon={<EnvironmentsIcon className="search-result-icon" />}
                  label={environment.label}
                  meta={`${environment.risk} / ${Object.keys(environment.variables).length} vars`}
                  onClick={() => onSelectEnvironment(environment.id)}
                />
              ))}
            </SearchResultGroup>
          ) : null}

          {!hasCommandResults && !hasWorkspaceResults ? (
            <div className="sidebar-empty sidebar-empty--compact">
              <SearchIcon className="empty-icon" />
              <p>No matches.</p>
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}

function SearchResultGroup({
  children,
  count,
  label,
}: {
  children: ReactNode
  count: number
  label: string
}) {
  return (
    <section className="search-result-group">
      <div className="sidebar-section-header">
        <span>{label}</span>
        <span>{count}</span>
      </div>
      {children}
    </section>
  )
}

function SearchResultRow({
  disabled,
  icon,
  label,
  meta,
  onClick,
}: {
  disabled?: boolean
  icon: ReactNode
  label: string
  meta: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      className="search-result-row"
      disabled={disabled}
      title={`${label}: ${meta}`}
      onClick={onClick}
    >
      <span className="search-result-glyph">{icon}</span>
      <span className="search-result-text">
        <strong>{label}</strong>
        <span>{meta}</span>
      </span>
    </button>
  )
}

function searchMatches(query: string, ...values: Array<string | undefined>) {
  if (!query) {
    return true
  }

  return values.join(' ').toLowerCase().includes(query)
}

function commandMeta(command: string) {
  const normalized = command.toLowerCase()

  if (normalized.includes('connection')) {
    return 'Connection'
  }

  if (normalized.includes('environment')) {
    return 'Environment'
  }

  if (normalized.includes('query') || normalized.includes('tab')) {
    return 'Editor'
  }

  if (normalized.includes('explorer')) {
    return 'Explorer'
  }

  if (normalized.includes('saved')) {
    return 'Saved Work'
  }

  if (
    normalized.includes('diagnostics') ||
    normalized.includes('theme') ||
    normalized.includes('lock')
  ) {
    return 'Workbench'
  }

  return 'Command'
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
  if (
    [
      'bucket',
      'database',
      'databases',
      'dataset',
      'datasets',
      'graph',
      'graphs',
      'keyspace',
      'keyspaces',
      'namespace',
      'namespaces',
      'schema',
      'schemas',
    ].includes(kind)
  ) {
    return <DatabaseIcon className="tree-icon" />
  }

  if (
    [
      'column',
      'constraint',
      'index',
      'indexes',
      'job',
      'jobs',
      'materialized-view',
      'materialized-views',
      'stored-procedure',
      'stored-procedures',
      'table',
      'tables',
      'trigger',
      'triggers',
      'view',
      'views',
    ].includes(kind)
  ) {
    return <TableIcon className="tree-icon" />
  }

  if (
    [
      'collection',
      'collections',
      'data-stream',
      'data-streams',
      'mapping',
      'mappings',
      'sample-documents',
    ].includes(kind)
  ) {
    return <JsonIcon className="tree-icon" />
  }

  if (
    [
      'hash',
      'keyspaces',
      'prefix',
      'prefixes',
      'set',
      'sets',
      'stream',
      'streams',
      'string',
    ].includes(kind)
  ) {
    return <KeyValueIcon className="tree-icon" />
  }

  return <ExplorerIcon className="tree-icon" />
}
