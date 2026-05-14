import type { ConnectionProfile, CreateScopedQueryTabRequest, QueryTabReorderRequest, QueryTabState, WorkspaceSnapshot } from '@datanaut/shared-types'
import { createId, defaultQueryTextForConnection, editorLabelForConnection, languageForConnection } from '../../app/state/helpers'
import { cloneSnapshot, findTab } from './browser-store'

const MAX_CLOSED_TABS = 25

export function createQueryTabForConnection(
  snapshot: WorkspaceSnapshot,
  connection: ConnectionProfile,
  dirty: boolean,
): QueryTabState {
  return {
    id: createId('tab'),
    title: defaultQueryTabTitle(snapshot, connection),
    connectionId: connection.id,
    environmentId: connection.environmentIds[0] ?? snapshot.environments[0]?.id ?? 'env-dev',
    family: connection.family,
    language: languageForConnection(connection),
    editorLabel: editorLabelForConnection(connection),
    queryText: defaultQueryTextForConnection(connection),
    status: 'idle',
    dirty,
    history: [],
  }
}



export function createScopedQueryTabInSnapshot(
  snapshot: WorkspaceSnapshot,
  request: CreateScopedQueryTabRequest,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const connection = next.connections.find((item) => item.id === request.connectionId)

  if (!connection) {
    return next
  }

  const targetLabel = normalizeScopedTargetLabel(request.target.label)
  const builderKind =
    connection.engine === 'mongodb' && request.target.preferredBuilder === 'mongo-find'
      ? 'mongo-find'
      : undefined
  const queryText =
    builderKind === 'mongo-find'
      ? mongoFindQueryText(targetLabel, 50)
      : (request.target.queryTemplate ?? defaultQueryTextForConnection(connection))
  const tab: QueryTabState = {
    id: createId('tab'),
    title: uniqueScopedQueryTitle(next, connection, targetLabel, builderKind === 'mongo-find'),
    connectionId: connection.id,
    environmentId:
      request.environmentId ?? connection.environmentIds[0] ?? next.environments[0]?.id ?? 'env-dev',
    family: connection.family,
    language: languageForConnection(connection),
    editorLabel: editorLabelForConnection(connection),
    queryText,
    builderState:
      builderKind === 'mongo-find'
        ? {
            kind: 'mongo-find',
            collection: targetLabel,
            filters: [],
            projectionMode: 'all',
            projectionFields: [],
            sort: [],
            skip: 0,
            limit: 50,
            lastAppliedQueryText: queryText,
          }
        : undefined,
    status: 'idle',
    dirty: true,
    history: [],
  }

  return upsertTab(next, tab)
}



export function normalizeScopedTargetLabel(label: string) {
  const trimmed = label.trim()

  if (!trimmed) {
    return 'query'
  }

  return [...trimmed]
    .map((character) =>
      character < ' ' || character === '/' || character === '\\' ? '_' : character,
    )
    .join('')
    .slice(0, 80)
}



export function uniqueScopedQueryTitle(
  snapshot: WorkspaceSnapshot,
  connection: ConnectionProfile,
  label: string,
  hasBuilder: boolean,
) {
  const extension = connection.family === 'document' ? 'json' : 'sql'
  const candidate = hasBuilder ? `${label}.find.${extension}` : `${label}.${extension}`
  const titles = new Set(snapshot.tabs.map((tab) => tab.title))

  if (!titles.has(candidate)) {
    return candidate
  }

  const splitAt = candidate.lastIndexOf('.')
  const stem = splitAt >= 0 ? candidate.slice(0, splitAt) : candidate
  const suffix = splitAt >= 0 ? candidate.slice(splitAt) : ''
  let index = 2
  let title = `${stem} ${index}${suffix}`

  while (titles.has(title)) {
    index += 1
    title = `${stem} ${index}${suffix}`
  }

  return title
}



export function mongoFindQueryText(collection: string, limit: number) {
  return JSON.stringify(
    {
      collection,
      filter: {},
      limit,
    },
    null,
    2,
  )
}



export function upsertTab(snapshot: WorkspaceSnapshot, tab: QueryTabState): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const index = next.tabs.findIndex((item) => item.id === tab.id)

  if (index >= 0) {
    next.tabs[index] = tab
  } else {
    next.tabs.push(tab)
  }

  next.ui.activeConnectionId = tab.connectionId
  next.ui.activeEnvironmentId = tab.environmentId
  next.ui.activeTabId = tab.id
  next.updatedAt = new Date().toISOString()
  return next
}



export function archiveClosedTab(
  snapshot: WorkspaceSnapshot,
  tab: QueryTabState,
  closeReason: WorkspaceSnapshot['closedTabs'][number]['closeReason'] = 'user',
) {
  snapshot.closedTabs = [
    {
      ...tab,
      result: undefined,
      closedAt: new Date().toISOString(),
      closeReason,
    },
    ...(snapshot.closedTabs ?? []).filter((item) => item.id !== tab.id),
  ].slice(0, MAX_CLOSED_TABS)
}



export function defaultQueryTabTitle(
  snapshot: WorkspaceSnapshot,
  connection: ConnectionProfile,
) {
  const { prefix, extension } = tabTitleParts(connection)
  let index = 1
  let title = `${prefix} ${index}.${extension}`
  const existingTitles = new Set(snapshot.tabs.map((tab) => tab.title))

  while (existingTitles.has(title)) {
    index += 1
    title = `${prefix} ${index}.${extension}`
  }

  return title
}



export function tabTitleParts(connection: ConnectionProfile) {
  if (connection.family === 'document') {
    return { prefix: 'Query', extension: 'json' }
  }

  if (connection.family === 'keyvalue') {
    return { prefix: 'Console', extension: 'redis' }
  }

  return { prefix: 'Query', extension: 'sql' }
}



export function renameQueryTab(
  snapshot: WorkspaceSnapshot,
  tabId: string,
  title: string,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const tab = findTab(next, tabId)
  const nextTitle = title.trim()

  if (tab && nextTitle) {
    tab.title = nextTitle

    if (tab.savedQueryId) {
      tab.dirty = true
    }
  }

  next.updatedAt = new Date().toISOString()
  return next
}



export function closeQueryTab(snapshot: WorkspaceSnapshot, tabId: string): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const tabIndex = next.tabs.findIndex((item) => item.id === tabId)

  if (tabIndex < 0) {
    return next
  }

  const closedTab = next.tabs.splice(tabIndex, 1)[0]

  if (!closedTab) {
    return next
  }

  archiveClosedTab(next, closedTab)

  const nextActiveTab =
    next.tabs[tabIndex] ?? next.tabs[tabIndex - 1] ?? next.tabs[0]

  if (nextActiveTab) {
    next.ui.activeTabId = nextActiveTab.id
    next.ui.activeConnectionId = nextActiveTab.connectionId
    next.ui.activeEnvironmentId = nextActiveTab.environmentId
  } else {
    const fallbackConnection =
      next.connections.find((connection) => connection.id === closedTab.connectionId) ??
      next.connections[0]
    next.ui.activeTabId = ''
    next.ui.activeConnectionId = fallbackConnection?.id ?? ''
    next.ui.activeEnvironmentId =
      closedTab.environmentId || fallbackConnection?.environmentIds[0] || ''
    next.ui.bottomPanelVisible = false
  }

  next.updatedAt = new Date().toISOString()
  return next
}



export function reorderQueryTabsInSnapshot(
  snapshot: WorkspaceSnapshot,
  request: QueryTabReorderRequest,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const tabById = new Map(next.tabs.map((tab) => [tab.id, tab]))

  if (
    request.orderedTabIds.length !== next.tabs.length ||
    new Set(request.orderedTabIds).size !== request.orderedTabIds.length ||
    request.orderedTabIds.some((tabId) => !tabById.has(tabId))
  ) {
    return next
  }

  next.tabs = request.orderedTabIds
    .map((tabId) => tabById.get(tabId))
    .filter((tab): tab is QueryTabState => Boolean(tab))
  next.updatedAt = new Date().toISOString()
  return next
}



export function reopenClosedQueryTab(
  snapshot: WorkspaceSnapshot,
  closedTabId: string,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const closedTabIndex = (next.closedTabs ?? []).findIndex(
    (item) => item.id === closedTabId,
  )

  if (closedTabIndex < 0) {
    return next
  }

  const closedTab = next.closedTabs.splice(closedTabIndex, 1)[0]

  if (!closedTab) {
    return next
  }

  const tabState = { ...closedTab } as QueryTabState & {
    closedAt?: string
    closeReason?: string
  }
  delete tabState.closedAt
  delete tabState.closeReason
  const reopenedTab: QueryTabState = {
    ...tabState,
    id: createId('tab'),
    result: undefined,
    status:
      closedTab.status === 'running' || closedTab.status === 'queued'
        ? 'idle'
        : closedTab.status,
  }

  next.tabs.push(reopenedTab)
  next.ui.activeTabId = reopenedTab.id
  next.ui.activeConnectionId = reopenedTab.connectionId
  next.ui.activeEnvironmentId = reopenedTab.environmentId
  next.updatedAt = new Date().toISOString()
  return next
}


