import type {
  BootstrapPayload,
  ConnectionProfile,
  ConnectionTestRequest,
  ConnectionTestResult,
  DiagnosticsReport,
  EnvironmentProfile,
  ExecutionCapabilities,
  ExecutionRequest,
  ExecutionResponse,
  UpdateUiStateRequest,
  ExportBundle,
  ExplorerInspectRequest,
  ExplorerInspectResponse,
  ExplorerNode,
  ExplorerRequest,
  ExplorerResponse,
  QueryTabState,
  SavedWorkItem,
  WorkspaceSnapshot,
} from '@universality/shared-types'
import {
  createSeedBootstrapPayload,
  createSeedDiagnosticsReport,
  createSeedHealth,
} from '../../app/data/seed'
import {
  buildDiagnosticsReport,
  createId,
  evaluateGuardrails,
  languageForConnection,
  migrateWorkspaceSnapshot,
  resolveEnvironment,
  simulateExecution,
} from '../../app/state/helpers'

const STORAGE_KEY = 'universality.workspace.v2'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeDesktop<T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, payload)
}

function loadBrowserSnapshot(): WorkspaceSnapshot {
  const stored =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_KEY)
      : null

  if (!stored) {
    return createSeedBootstrapPayload().snapshot
  }

  try {
    return migrateWorkspaceSnapshot(JSON.parse(stored) as WorkspaceSnapshot)
  } catch {
    return createSeedBootstrapPayload().snapshot
  }
}

function saveBrowserSnapshot(snapshot: WorkspaceSnapshot) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(migrateWorkspaceSnapshot(snapshot)),
    )
  }
}

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorkspaceSnapshot
}

function buildBrowserPayload(snapshot: WorkspaceSnapshot): BootstrapPayload {
  const migrated = migrateWorkspaceSnapshot(snapshot)
  const health = createSeedHealth()

  return {
    health,
    snapshot: migrated,
    resolvedEnvironment: resolveEnvironment(
      migrated.environments,
      migrated.ui.activeEnvironmentId,
    ),
    diagnostics: createSeedDiagnosticsReport(migrated, health),
  }
}

function setActiveConnection(
  snapshot: WorkspaceSnapshot,
  connectionId: string,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const connection =
    next.connections.find((item) => item.id === connectionId) ?? next.connections[0]

  if (!connection) {
    return next
  }

  const tab =
    next.tabs.find((item) => item.connectionId === connection.id) ?? next.tabs[0]

  if (!tab) {
    return next
  }

  next.ui.activeConnectionId = connection.id
  next.ui.activeEnvironmentId = tab.environmentId
  next.ui.activeTabId = tab.id
  next.updatedAt = new Date().toISOString()
  return next
}

function upsertConnection(
  snapshot: WorkspaceSnapshot,
  profile: ConnectionProfile,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const index = next.connections.findIndex((item) => item.id === profile.id)

  if (index >= 0) {
    next.connections[index] = profile
  } else {
    next.connections.push(profile)
  }

  next.updatedAt = new Date().toISOString()
  return next
}

function upsertEnvironment(
  snapshot: WorkspaceSnapshot,
  profile: EnvironmentProfile,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const index = next.environments.findIndex((item) => item.id === profile.id)

  if (index >= 0) {
    next.environments[index] = profile
  } else {
    next.environments.push(profile)
  }

  next.updatedAt = new Date().toISOString()
  return next
}

function upsertTab(snapshot: WorkspaceSnapshot, tab: QueryTabState): WorkspaceSnapshot {
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

function upsertSavedWork(
  snapshot: WorkspaceSnapshot,
  item: SavedWorkItem,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const updated = {
    ...item,
    updatedAt: new Date().toISOString(),
  }
  const index = next.savedWork.findIndex((existing) => existing.id === item.id)

  if (index >= 0) {
    next.savedWork[index] = updated
  } else {
    next.savedWork.push(updated)
  }

  next.updatedAt = new Date().toISOString()
  return next
}

function deleteSavedWork(
  snapshot: WorkspaceSnapshot,
  savedWorkId: string,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  next.savedWork = next.savedWork.filter((item) => item.id !== savedWorkId)
  next.updatedAt = new Date().toISOString()
  return next
}

function openSavedWork(
  snapshot: WorkspaceSnapshot,
  savedWorkId: string,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const item = next.savedWork.find((saved) => saved.id === savedWorkId)

  if (!item?.queryText) {
    return next
  }

  const connection =
    next.connections.find((candidate) => candidate.id === item.connectionId) ??
    next.connections.find((candidate) => candidate.id === next.ui.activeConnectionId) ??
    next.connections[0]

  if (!connection) {
    return next
  }

  const tab: QueryTabState = {
    id: createId('tab'),
    title: item.name,
    connectionId: connection.id,
    environmentId:
      item.environmentId ??
      connection.environmentIds[0] ??
      next.ui.activeEnvironmentId,
    family: connection.family,
    language: item.language ?? languageForConnection(connection),
    editorLabel:
      connection.family === 'keyvalue'
        ? 'Redis console'
        : connection.family === 'document'
          ? 'Document query'
          : 'SQL editor',
    queryText: item.queryText,
    status: 'idle',
    dirty: false,
    savedQueryId: item.id,
    history: [],
  }

  return upsertTab(next, tab)
}

function updateUiStateLocally(
  snapshot: WorkspaceSnapshot,
  patch: UpdateUiStateRequest,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  next.ui = {
    ...next.ui,
    ...patch,
  }
  next.updatedAt = new Date().toISOString()
  return migrateWorkspaceSnapshot(next)
}

function encodeBase64(input: string) {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(input)
  }

  return input
}

function decodeBase64(input: string) {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(input)
  }

  return input
}

function hashPassphrase(input: string) {
  let hash = 0

  for (const character of input) {
    hash = (hash << 5) - hash + character.charCodeAt(0)
    hash |= 0
  }

  return `preview-${Math.abs(hash).toString(16)}`
}

function confirmationGuardrailId(
  connectionId: string,
  environmentId: string,
  mode: string,
  queryText: string,
) {
  return hashPassphrase(`${connectionId}:${environmentId}:${mode}:${queryText}`).replace(
    'preview-',
    'guardrail-',
  )
}

function findConnection(
  snapshot: WorkspaceSnapshot,
  connectionId: string,
): ConnectionProfile | undefined {
  return (
    snapshot.connections.find((item) => item.id === connectionId) ??
    snapshot.connections[0]
  )
}

function findEnvironment(
  snapshot: WorkspaceSnapshot,
  environmentId: string,
): EnvironmentProfile | undefined {
  return (
    snapshot.environments.find((item) => item.id === environmentId) ??
    snapshot.environments[0]
  )
}

function findTab(
  snapshot: WorkspaceSnapshot,
  tabId: string,
): QueryTabState | undefined {
  return snapshot.tabs.find((item) => item.id === tabId) ?? snapshot.tabs[0]
}

function buildExecutionCapabilities(
  connection: ConnectionProfile,
  snapshot: WorkspaceSnapshot,
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

function createExplorerNodes(
  connection: ConnectionProfile,
  scope?: string,
): ExplorerNode[] {
  if (connection.family === 'document') {
    if (scope?.startsWith('collection:')) {
      const collection = scope.replace('collection:', '')

      return [
        {
          id: `${collection}:indexes`,
          family: 'document',
          label: 'Indexes',
          kind: 'indexes',
          detail: `Index definitions for ${collection}`,
          path: [connection.name, collection],
        },
        {
          id: `${collection}:samples`,
          family: 'document',
          label: 'Sample documents',
          kind: 'sample-documents',
          detail: `Sample documents from ${collection}`,
          path: [connection.name, collection],
          queryTemplate: `{\n  "collection": "${collection}",\n  "pipeline": [\n    { "$match": {} },\n    { "$limit": 20 }\n  ]\n}`,
        },
      ]
    }

    return [
      {
        id: 'collection-products',
        family: 'document',
        label: 'products',
        kind: 'collection',
        detail: 'Documents, validators, and indexes',
        scope: 'collection:products',
        path: [connection.name],
        expandable: true,
        queryTemplate: '{\n  "collection": "products",\n  "filter": {},\n  "limit": 100\n}',
      },
      {
        id: 'collection-inventory',
        family: 'document',
        label: 'inventory',
        kind: 'collection',
        detail: 'Stock movements and reservation documents',
        scope: 'collection:inventory',
        path: [connection.name],
        expandable: true,
        queryTemplate: '{\n  "collection": "inventory",\n  "filter": { "reserved": { "$gt": 0 } },\n  "limit": 100\n}',
      },
    ]
  }

  if (connection.family === 'keyvalue') {
    if (scope?.startsWith('prefix:')) {
      const prefix = scope.replace('prefix:', '')

      return [
        {
          id: `${prefix}:session:9f2d7e1a`,
          family: 'keyvalue',
          label: `${prefix}9f2d7e1a`,
          kind: 'hash',
          detail: 'TTL 23m | 4.8 KB',
          path: [connection.name, prefix],
          queryTemplate: `HGETALL ${prefix}9f2d7e1a`,
        },
        {
          id: `${prefix}:session:7cc1a6f2`,
          family: 'keyvalue',
          label: `${prefix}7cc1a6f2`,
          kind: 'hash',
          detail: 'TTL 8m | 3.1 KB',
          path: [connection.name, prefix],
          queryTemplate: `HGETALL ${prefix}7cc1a6f2`,
        },
      ]
    }

    return [
      {
        id: 'prefix-session',
        family: 'keyvalue',
        label: 'session:*',
        kind: 'prefix',
        detail: 'Read-heavy session hashes',
        scope: 'prefix:session:',
        path: [connection.name],
        expandable: true,
        queryTemplate: 'SCAN 0 MATCH session:* COUNT 50',
      },
      {
        id: 'prefix-cache',
        family: 'keyvalue',
        label: 'cache:*',
        kind: 'prefix',
        detail: 'Transient cache keys',
        scope: 'prefix:cache:',
        path: [connection.name],
        expandable: true,
        queryTemplate: 'SCAN 0 MATCH cache:* COUNT 50',
      },
    ]
  }

  if (scope?.startsWith('schema:')) {
    const schema = scope.replace('schema:', '')

    return [
      {
        id: `${schema}.accounts`,
        family: 'sql',
        label: 'accounts',
        kind: 'table',
        detail: 'Columns, indexes, and row estimates',
        scope: `table:${schema}.accounts`,
        path: [connection.name, schema],
        expandable: true,
        queryTemplate: `select * from ${schema}.accounts limit 100;`,
      },
      {
        id: `${schema}.transactions`,
        family: 'sql',
        label: 'transactions',
        kind: 'table',
        detail: 'Large fact table with hot ingestion path',
        scope: `table:${schema}.transactions`,
        path: [connection.name, schema],
        expandable: true,
        queryTemplate: `select * from ${schema}.transactions order by created_at desc limit 100;`,
      },
    ]
  }

  if (scope?.startsWith('table:')) {
    const table = scope.replace('table:', '')

    return [
      {
        id: `${table}:id`,
        family: 'sql',
        label: 'id',
        kind: 'column',
        detail: 'uuid / primary key',
        path: [connection.name, table],
      },
      {
        id: `${table}:updated_at`,
        family: 'sql',
        label: 'updated_at',
        kind: 'column',
        detail: 'timestamp with timezone',
        path: [connection.name, table],
      },
    ]
  }

  return [
    {
      id: 'schema-public',
      family: 'sql',
      label: 'public',
      kind: 'schema',
      detail: 'Core application objects',
      scope: 'schema:public',
      path: [connection.name],
      expandable: true,
      queryTemplate: 'select table_name from information_schema.tables where table_schema = \'public\';',
    },
    {
      id: 'schema-observability',
      family: 'sql',
      label: 'observability',
      kind: 'schema',
      detail: 'Health and support views',
      scope: 'schema:observability',
      path: [connection.name],
      expandable: true,
      queryTemplate: 'select table_name from information_schema.views where table_schema = \'observability\';',
    },
  ]
}

function inspectExplorerNodeLocally(
  snapshot: WorkspaceSnapshot,
  request: ExplorerInspectRequest,
): ExplorerInspectResponse {
  const connection = findConnection(snapshot, request.connectionId)

  if (!connection) {
    return {
      nodeId: request.nodeId,
      summary: 'Explorer node is not available in the current workspace.',
    }
  }

  const queryTemplate = request.nodeId.includes('collection')
    ? '{\n  "collection": "products",\n  "filter": {},\n  "limit": 100\n}'
    : request.nodeId.includes('prefix') || request.nodeId.includes('session')
      ? 'SCAN 0 MATCH session:* COUNT 50'
      : 'select * from public.accounts limit 100;'

  return {
    nodeId: request.nodeId,
    summary: `Inspection ready for ${request.nodeId} on ${connection.name}.`,
    queryTemplate,
    payload:
      connection.family === 'document'
        ? {
            collection: request.nodeId,
            sampleDocuments: [
              { _id: 'itm-2048', sku: 'luna-lamp', status: 'active' },
              { _id: 'itm-2049', sku: 'aurora-desk', status: 'active' },
            ],
          }
        : connection.family === 'keyvalue'
          ? {
              key: request.nodeId,
              type: 'hash',
              ttl: '23m 11s',
              memoryUsage: '4.8 KB',
              sample: {
                userId: 'a1b2c3',
                region: 'eu-west-1',
              },
            }
          : {
              object: request.nodeId,
              columns: [
                { name: 'id', type: 'uuid' },
                { name: 'updated_at', type: 'timestamp with time zone' },
              ],
            },
  }
}

function applyExecutionRequestLocally(
  snapshot: WorkspaceSnapshot,
  request: ExecutionRequest,
): { snapshot: WorkspaceSnapshot; response: ExecutionResponse } {
  const next = cloneSnapshot(snapshot)
  const tab = findTab(next, request.tabId)
  const connection = findConnection(next, request.connectionId)
  const environment = findEnvironment(next, request.environmentId)

  if (!tab || !connection || !environment) {
    throw new Error('Unable to resolve the active execution context.')
  }

  const resolvedEnvironment = resolveEnvironment(next.environments, request.environmentId)
  const queryText =
    request.mode === 'selection' && request.selectedText
      ? request.selectedText
      : request.queryText
  const guardrail = evaluateGuardrails(
    connection,
    environment,
    resolvedEnvironment,
    queryText,
    next.preferences.safeModeEnabled,
  )
  if (guardrail.status === 'confirm') {
    const guardrailId = confirmationGuardrailId(
      connection.id,
      environment.id,
      request.mode ?? 'full',
      queryText,
    )
    guardrail.id = guardrailId
    guardrail.requiredConfirmationText = `CONFIRM ${environment.label}`

    if (request.confirmedGuardrailId !== guardrailId) {
      const executionId = request.executionId ?? createId('execution')
      tab.queryText = request.queryText
      tab.status = 'blocked'
      tab.dirty = false
      tab.lastRunAt = new Date().toISOString()
      tab.history.unshift({
        id: createId('history'),
        queryText,
        executedAt: tab.lastRunAt,
        status: tab.status,
      })
      tab.error = {
        code: 'guardrail-confirmation-required',
        message: guardrail.reasons.join(' '),
      }
      tab.result = undefined
      next.guardrails = [guardrail]
      next.ui.bottomPanelVisible = true
      next.ui.activeBottomPanelTab = 'messages'
      next.updatedAt = new Date().toISOString()

      return {
        snapshot: next,
        response: {
          executionId,
          tab,
          result: undefined,
          guardrail,
          diagnostics: ['Execution requires explicit confirmation before running.'],
        },
      }
    }
  }

  const executionId = request.executionId ?? createId('execution')
  const simulated = simulateExecution(connection, environment, resolvedEnvironment, {
    ...tab,
    queryText,
  })

  let result = guardrail.status === 'block' ? undefined : simulated.result
  const diagnostics: string[] = []

  if (request.mode === 'explain' && result) {
    const explainText =
      connection.family === 'sql'
        ? `Explain plan preview for ${connection.engine}\n\n${queryText}`
        : `Execution plan preview is not supported for ${connection.engine}.`

    result = {
      ...result,
      id: createId('result'),
      summary: `Explain plan prepared for ${connection.name}.`,
      defaultRenderer: 'raw',
      rendererModes: ['raw', ...result.rendererModes.filter((mode) => mode !== 'raw')],
      payloads: [
        { renderer: 'raw', text: explainText },
        ...result.payloads.filter((payload) => payload.renderer !== 'raw'),
      ],
      explainPayload: { renderer: 'raw', text: explainText },
    }
  }

  if (guardrail.status === 'confirm') {
    diagnostics.push(guardrail.reasons[0] ?? 'Confirmation required for this query.')
  }

  tab.queryText = request.queryText
  tab.status =
    guardrail.status === 'block'
      ? 'blocked'
      : result
        ? 'success'
        : 'error'
  tab.dirty = false
  tab.lastRunAt = new Date().toISOString()
  tab.history.unshift({
    id: createId('history'),
    queryText,
    executedAt: tab.lastRunAt,
    status: tab.status,
  })
  tab.error =
    guardrail.status === 'block'
      ? {
          code: 'guardrail-blocked',
          message: guardrail.reasons.join(' '),
        }
      : undefined
  tab.result = result

  next.guardrails = [guardrail]
  next.ui.bottomPanelVisible = true
  next.ui.activeBottomPanelTab = 'results'
  next.updatedAt = new Date().toISOString()

  return {
    snapshot: next,
    response: {
      executionId,
      tab,
      result,
      guardrail,
      diagnostics,
    },
  }
}

export const desktopClient = {
  async bootstrapApp(): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('bootstrap_app')
    }

    return buildBrowserPayload(loadBrowserSnapshot())
  },

  async setActiveConnection(connectionId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('set_active_connection', {
        connectionId,
      })
    }

    const snapshot = setActiveConnection(loadBrowserSnapshot(), connectionId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async setActiveTab(tabId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('set_active_tab', { tabId })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const tab = findTab(next, tabId)

    if (!tab) {
      return buildBrowserPayload(next)
    }

    next.ui.activeTabId = tab.id
    next.ui.activeConnectionId = tab.connectionId
    next.ui.activeEnvironmentId = tab.environmentId
    next.updatedAt = new Date().toISOString()
    saveBrowserSnapshot(next)
    return buildBrowserPayload(next)
  },

  async upsertConnection(profile: ConnectionProfile): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('upsert_connection_profile', { profile })
    }

    const snapshot = upsertConnection(loadBrowserSnapshot(), profile)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async upsertEnvironment(profile: EnvironmentProfile): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('upsert_environment_profile', { profile })
    }

    const snapshot = upsertEnvironment(loadBrowserSnapshot(), profile)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async createQueryTab(connectionId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('create_query_tab', { connectionId })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const connection = findConnection(next, connectionId)

    if (!connection) {
      return buildBrowserPayload(next)
    }

    const tab: QueryTabState = {
      id: createId('tab'),
      title: `${connection.name} scratch`,
      connectionId: connection.id,
      environmentId:
        connection.environmentIds[0] ?? next.environments[0]?.id ?? 'env-dev',
      family: connection.family,
      language: languageForConnection(connection),
      editorLabel:
        connection.family === 'keyvalue'
          ? 'Redis console'
          : connection.family === 'document'
            ? 'Document query'
            : 'SQL editor',
      queryText:
        connection.family === 'document'
          ? '{\n  "collection": "products",\n  "filter": {},\n  "limit": 50\n}'
          : connection.family === 'keyvalue'
            ? 'SCAN 0 MATCH session:* COUNT 25'
            : 'select 1;',
      status: 'idle',
      dirty: true,
      history: [],
    }
    const snapshot = upsertTab(next, tab)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async setTheme(theme: WorkspaceSnapshot['preferences']['theme']): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('set_theme', { theme })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    next.preferences.theme = theme
    next.updatedAt = new Date().toISOString()
    saveBrowserSnapshot(next)
    return buildBrowserPayload(next)
  },

  async setLocked(isLocked: boolean): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>(isLocked ? 'lock_app' : 'unlock_app')
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    next.lockState.isLocked = isLocked
    next.lockState.lockedAt = isLocked ? new Date().toISOString() : undefined
    next.updatedAt = new Date().toISOString()
    saveBrowserSnapshot(next)
    return buildBrowserPayload(next)
  },

  async updateQueryTab(tabId: string, queryText: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('update_query_tab', { tabId, queryText })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const tab = findTab(next, tabId)

    if (tab) {
      tab.queryText = queryText
      tab.dirty = true
      tab.status = 'idle'
      tab.error = undefined
      tab.result = undefined
      tab.lastRunAt = undefined
    }

    next.updatedAt = new Date().toISOString()
    saveBrowserSnapshot(next)
    return buildBrowserPayload(next)
  },

  async upsertSavedWork(item: SavedWorkItem): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('upsert_saved_work_item', { item })
    }

    const snapshot = upsertSavedWork(loadBrowserSnapshot(), item)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async deleteSavedWork(savedWorkId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('delete_saved_work_item', {
        savedWorkId,
      })
    }

    const snapshot = deleteSavedWork(loadBrowserSnapshot(), savedWorkId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async openSavedWork(savedWorkId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('open_saved_work_item', {
        savedWorkId,
      })
    }

    const snapshot = openSavedWork(loadBrowserSnapshot(), savedWorkId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async testConnection(
    request: ConnectionTestRequest,
  ): Promise<ConnectionTestResult> {
    if (isTauriRuntime()) {
      return invokeDesktop<ConnectionTestResult>('test_connection', { request })
    }

    const snapshot = loadBrowserSnapshot()
    const resolvedEnvironment = resolveEnvironment(
      snapshot.environments,
      request.environmentId,
    )

    const host = request.profile.host.replaceAll(
      '${DB_HOST}',
      resolvedEnvironment.variables.DB_HOST ?? request.profile.host,
    )
    const resolvedHost = Object.entries(resolvedEnvironment.variables).reduce(
      (current, [key, value]) => current.replaceAll(`\${${key}}`, value),
      host,
    )
    const resolvedDatabase = Object.entries(resolvedEnvironment.variables).reduce(
      (current, [key, value]) => current.replaceAll(`\${${key}}`, value),
      request.profile.database ?? '',
    )

    const warnings =
      resolvedEnvironment.unresolvedKeys.length > 0
        ? ['Some environment variables are still unresolved in preview mode.']
        : []

    return {
      ok: resolvedEnvironment.unresolvedKeys.length === 0 && resolvedHost.length > 0,
      engine: request.profile.engine,
      message:
        resolvedEnvironment.unresolvedKeys.length === 0
          ? `Preview connection test succeeded for ${request.profile.name}.`
          : 'Preview connection test detected unresolved variables.',
      warnings,
      resolvedHost,
      resolvedDatabase: resolvedDatabase || undefined,
      durationMs: 42,
    }
  },

  async loadExplorer(request: ExplorerRequest): Promise<ExplorerResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ExplorerResponse>('list_explorer_nodes', { request })
    }

    const snapshot = loadBrowserSnapshot()
    const connection = findConnection(snapshot, request.connectionId)

    if (!connection) {
      throw new Error('Connection was not found.')
    }

    const nodes = createExplorerNodes(connection, request.scope).slice(
      0,
      request.limit ?? 50,
    )

    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      scope: request.scope,
      summary: `Preview explorer loaded ${nodes.length} node(s) for ${connection.name}.`,
      capabilities: buildExecutionCapabilities(connection, snapshot),
      nodes,
    }
  },

  async inspectExplorer(
    request: ExplorerInspectRequest,
  ): Promise<ExplorerInspectResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ExplorerInspectResponse>('inspect_explorer_node', { request })
    }

    return inspectExplorerNodeLocally(loadBrowserSnapshot(), request)
  },

  async executeQuery(request: ExecutionRequest): Promise<ExecutionResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ExecutionResponse>('execute_query_request', { request })
    }

    const { snapshot, response } = applyExecutionRequestLocally(
      loadBrowserSnapshot(),
      request,
    )
    saveBrowserSnapshot(snapshot)
    return response
  },

  async cancelExecution(
    request: { executionId: string; tabId?: string },
  ): Promise<{ ok: boolean; supported: boolean; message: string }> {
    if (isTauriRuntime()) {
      return invokeDesktop('cancel_execution_request', { request })
    }

    const snapshot = loadBrowserSnapshot()
    const tab = request.tabId ? findTab(snapshot, request.tabId) : undefined
    const engine = tab
      ? findConnection(snapshot, tab.connectionId)?.engine
      : undefined
    const supported = engine === 'postgresql' || engine === 'sqlserver'

    return {
      ok: supported,
      supported,
      message: supported
        ? 'Preview mode has no long-running execution to cancel right now.'
        : 'Cancellation is not supported for this adapter in preview mode.',
    }
  },

  async createDiagnosticsReport(): Promise<DiagnosticsReport> {
    if (isTauriRuntime()) {
      return invokeDesktop<DiagnosticsReport>('create_diagnostics_report')
    }

    const snapshot = loadBrowserSnapshot()
    return buildDiagnosticsReport(snapshot, createSeedHealth())
  },

  async exportWorkspaceBundle(passphrase: string): Promise<ExportBundle> {
    if (isTauriRuntime()) {
      return invokeDesktop<ExportBundle>('export_workspace_bundle', { passphrase })
    }

    return {
      format: 'universality-bundle',
      version: 3,
      encryptedPayload: encodeBase64(
        JSON.stringify({
          passphraseHash: hashPassphrase(passphrase),
          snapshot: migrateWorkspaceSnapshot(loadBrowserSnapshot()),
        }),
      ),
    }
  },

  async importWorkspaceBundle(
    passphrase: string,
    encryptedPayload: string,
  ): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('import_workspace_bundle', {
        passphrase,
        encryptedPayload,
      })
    }

    try {
      const decoded = JSON.parse(decodeBase64(encryptedPayload)) as {
        snapshot?: WorkspaceSnapshot
        passphraseHash?: string
      }

      if (!decoded.snapshot) {
        throw new Error('Missing snapshot payload.')
      }

      if (
        typeof decoded.passphraseHash === 'string' &&
        decoded.passphraseHash !== hashPassphrase(passphrase)
      ) {
        throw new Error('Passphrase does not match the exported bundle.')
      }

      const snapshot = migrateWorkspaceSnapshot(decoded.snapshot)
      saveBrowserSnapshot(snapshot)
      return buildBrowserPayload(snapshot)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to import the encrypted bundle.'

      throw new Error(message, {
        cause: error,
      })
    }
  },

  async updateUiState(patch: UpdateUiStateRequest): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('set_ui_state', { patch })
    }

    const snapshot = updateUiStateLocally(loadBrowserSnapshot(), patch)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },
}
