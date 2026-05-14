import type { ReactNode } from 'react'
import type {
  ClosedQueryTabSnapshot,
  ConnectionProfile,
  EnvironmentProfile,
  SavedWorkItem,
} from '@datapadplusplus/shared-types'
import {
  DatabaseIcon,
  EnvironmentsIcon,
  PlayIcon,
  SearchIcon,
  SettingsIcon,
} from './icons'
import { EngineIcon } from './SideBar.node-icons'
import { SidebarSection } from './SideBar.section'

export function SearchPane({
  commandPaletteEnabled,
  commandItems,
  commandQuery,
  connections,
  environments,
  sectionStates,
  savedWork,
  closedTabs,
  onCommandQueryChange,
  onRunCommand,
  onOpenSavedWork,
  onReopenClosedTab,
  onSidebarSectionExpandedChange,
  onSelectConnection,
  onSelectEnvironment,
}: {
  commandPaletteEnabled: boolean
  commandItems: string[]
  commandQuery: string
  connections: ConnectionProfile[]
  environments: EnvironmentProfile[]
  sectionStates: Record<string, boolean>
  savedWork: SavedWorkItem[]
  closedTabs: ClosedQueryTabSnapshot[]
  onCommandQueryChange(value: string): void
  onRunCommand(command: string): void
  onOpenSavedWork(savedWorkId: string): void
  onReopenClosedTab(closedTabId: string): void
  onSidebarSectionExpandedChange(sectionId: string, expanded: boolean): void
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
            <SearchResultGroup
              count={commandItems.length}
              index={0}
              label="Commands"
              sectionId="search:commands"
              sectionStates={sectionStates}
              onExpandedChange={onSidebarSectionExpandedChange}
            >
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
            <SearchResultGroup
              count={connectionResults.length}
              index={hasCommandResults ? 1 : 0}
              label="Connections"
              sectionId="search:connections"
              sectionStates={sectionStates}
              onExpandedChange={onSidebarSectionExpandedChange}
            >
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
            <SearchResultGroup
              count={savedWorkResults.length}
              index={(hasCommandResults ? 1 : 0) + (connectionResults.length > 0 ? 1 : 0)}
              label="Saved Work"
              sectionId="search:saved-work"
              sectionStates={sectionStates}
              onExpandedChange={onSidebarSectionExpandedChange}
            >
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
            <SearchResultGroup
              count={closedTabResults.length}
              index={
                (hasCommandResults ? 1 : 0) +
                (connectionResults.length > 0 ? 1 : 0) +
                (savedWorkResults.length > 0 ? 1 : 0)
              }
              label="Closed Tabs"
              sectionId="search:closed-tabs"
              sectionStates={sectionStates}
              onExpandedChange={onSidebarSectionExpandedChange}
            >
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
            <SearchResultGroup
              count={environmentResults.length}
              index={
                (hasCommandResults ? 1 : 0) +
                (connectionResults.length > 0 ? 1 : 0) +
                (savedWorkResults.length > 0 ? 1 : 0) +
                (closedTabResults.length > 0 ? 1 : 0)
              }
              label="Environments"
              sectionId="search:environments"
              sectionStates={sectionStates}
              onExpandedChange={onSidebarSectionExpandedChange}
            >
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
  index,
  label,
  sectionId,
  sectionStates,
  onExpandedChange,
}: {
  children: ReactNode
  count: number
  index: number
  label: string
  sectionId: string
  sectionStates: Record<string, boolean>
  onExpandedChange(sectionId: string, expanded: boolean): void
}) {
  return (
    <SidebarSection
      count={count}
      index={index}
      label={label}
      sectionId={sectionId}
      sectionStates={sectionStates}
      onExpandedChange={onExpandedChange}
    >
      {children}
    </SidebarSection>
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
