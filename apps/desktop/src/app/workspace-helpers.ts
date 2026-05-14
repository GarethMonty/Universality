import type {
  ConnectionProfile,
  ExecutionCapabilities,
  QueryBuilderState,
  QueryTabState,
  ResultPayload,
  WorkspaceSnapshot,
} from '@datanaut/shared-types'
import {
  createDefaultMongoFindBuilderState,
  isMongoFindBuilderState,
} from './components/workbench/query-builder/mongo-find'
import {
  defaultRowLimitForConnection,
  editorLanguageForConnection,
} from './state/helpers'

export function resolveThemeMode(theme: WorkspaceSnapshot['preferences']['theme']) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }

  return theme
}

export function builderStateForTab(
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

export function mongoCollectionOptions(
  connection: ConnectionProfile | undefined,
  explorerItems: Array<{ kind: string; label: string }>,
) {
  if (connection?.engine !== 'mongodb') {
    return []
  }

  const explorerCollections = explorerItems
    .filter((node) => node.kind === 'collection')
    .map((node) => node.label)

  return Array.from(new Set([...explorerCollections, 'products', 'inventory', 'orders']))
}

export function defaultCapabilities(): ExecutionCapabilities {
  return {
    canCancel: false,
    canExplain: false,
    supportsLiveMetadata: false,
    editorLanguage: 'sql',
    defaultRowLimit: 200,
  }
}

export function deriveCapabilities(
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

export function selectPayload(payloads: ResultPayload[], selectedRenderer?: string) {
  if (payloads.length === 0) {
    return undefined
  }

  return (
    payloads.find((payload) => payload.renderer === selectedRenderer) ?? payloads[0]
  )
}

export function appendFieldToQueryText(queryText: string, fieldPath: string) {
  const trimmedField = fieldPath.trim()

  if (!trimmedField) {
    return queryText
  }

  if (!queryText.trim()) {
    return trimmedField
  }

  return `${queryText.trimEnd()}\n${trimmedField}`
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
      : 20
  } catch {
    return 20
  }
}
