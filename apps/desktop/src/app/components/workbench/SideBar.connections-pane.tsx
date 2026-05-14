import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import type {
  ConnectionGroupMode,
  ConnectionProfile,
  EnvironmentProfile,
  ScopedQueryTarget,
} from '@datapadplusplus/shared-types'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ConnectionsIcon,
  FavoriteIcon,
  MoreIcon,
  ReadOnlyIcon,
} from './icons'
import {
  ConnectionContextMenu,
  type ConnectionContextMenuState,
} from './SideBar.connection-context-menu'
import {
  ConnectionGroupDropdown,
  ConnectionsHeader,
} from './SideBar.connections-header'
import { ConnectionObjectTree } from './SideBar.connection-object-tree'
import {
  environmentAccentVariables,
  sidebarSectionId,
} from './SideBar.helpers'
import { EngineIcon } from './SideBar.node-icons'
import { SidebarSection } from './SideBar.section'

export function ConnectionsPane({
  activeConnectionId,
  connectionFilter,
  connectionGroupMode,
  connectionGroups,
  environments,
  sectionStates,
  onConnectionFilterChange,
  onConnectionGroupModeChange,
  onSidebarSectionExpandedChange,
  onCreateConnection,
  onDeleteConnection,
  onOpenConnectionOperations,
  onDuplicateConnection,
  onOpenConnectionExplorer,
  onOpenConnectionDrawer,
  onOpenScopedQuery,
  onCreateTab,
  onSelectConnection,
}: {
  activeConnectionId: string
  connectionFilter: string
  connectionGroupMode: ConnectionGroupMode
  connectionGroups: Record<string, ConnectionProfile[]>
  environments: EnvironmentProfile[]
  sectionStates: Record<string, boolean>
  onConnectionFilterChange(value: string): void
  onConnectionGroupModeChange(value: ConnectionGroupMode): void
  onSidebarSectionExpandedChange(sectionId: string, expanded: boolean): void
  onCreateConnection(): void
  onDeleteConnection(connectionId: string): void
  onOpenConnectionOperations(connectionId: string): void
  onOpenConnectionDrawer(connectionId: string): void
  onDuplicateConnection(connectionId: string): void
  onOpenConnectionExplorer(connectionId: string): void
  onOpenScopedQuery(connectionId: string, target: ScopedQueryTarget): void
  onCreateTab(connectionId?: string): void
  onSelectConnection(connectionId: string): void
}) {
  const [expandedConnections, setExpandedConnections] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<ConnectionContextMenuState>()
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
    event: MouseEvent<HTMLElement>,
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
      <ConnectionsHeader
        onCreateConnection={onCreateConnection}
      />

      <div className="sidebar-search-row">
        <label className="sidebar-search sidebar-search--inline">
          <span className="sr-only">Search connections</span>
          <input
            type="search"
            placeholder="Search connections"
            value={connectionFilter}
            onChange={(event) => onConnectionFilterChange(event.target.value)}
          />
        </label>
        <ConnectionGroupDropdown
          connectionGroupMode={connectionGroupMode}
          onConnectionGroupModeChange={onConnectionGroupModeChange}
        />
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

        {Object.entries(connectionGroups).map(([group, items], index) => {
          const sectionId = sidebarSectionId('connections', connectionGroupMode, group)

          return (
            <SidebarSection
              key={sectionId}
              count={items.length}
              index={index}
              label={group}
              sectionId={sectionId}
              sectionStates={sectionStates}
              onExpandedChange={onSidebarSectionExpandedChange}
            >
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
                          aria-label={`Open connection menu for ${connection.name}`}
                          title={`Open actions for ${connection.name}.`}
                          onClick={(event) => openContextMenu(event, connection)}
                        >
                          <MoreIcon className="sidebar-icon" />
                        </button>
                      </span>
                    </div>

                    {expanded ? (
                      <ConnectionObjectTree
                        connection={connection}
                        onOpenScopedQuery={onOpenScopedQuery}
                      />
                    ) : null}
                  </div>
                )
              })}
            </SidebarSection>
          )
        })}
      </div>

      {contextMenu && contextConnection ? (
        <ConnectionContextMenu
          connection={contextConnection}
          position={contextMenu}
          onClose={() => setContextMenu(undefined)}
          onCreateTab={onCreateTab}
          onDeleteConnection={onDeleteConnection}
          onDuplicateConnection={onDuplicateConnection}
          onOpenConnectionDrawer={onOpenConnectionDrawer}
          onOpenConnectionExplorer={onOpenConnectionExplorer}
          onOpenConnectionOperations={onOpenConnectionOperations}
        />
      ) : null}
    </>
  )
}
