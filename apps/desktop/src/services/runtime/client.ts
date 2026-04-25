import type {
  BootstrapPayload,
  AdapterDiagnosticsRequest,
  AdapterDiagnosticsResponse,
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
  LocalDatabaseCreateRequest,
  LocalDatabaseCreateResult,
  LocalDatabasePickRequest,
  LocalDatabasePickResult,
  OperationExecutionRequest,
  OperationExecutionResponse,
  OperationManifestRequest,
  OperationManifestResponse,
  OperationPlanRequest,
  OperationPlanResponse,
  PermissionInspectionRequest,
  PermissionInspectionResponse,
  QueryTabReorderRequest,
  QueryTabState,
  ResultPageRequest,
  ResultPageResponse,
  SavedWorkItem,
  SecretRef,
  StructureRequest,
  StructureResponse,
  WorkspaceSnapshot,
} from '@universality/shared-types'
import { datastoreBacklogByEngine } from '@universality/shared-types'
import {
  createBlankBootstrapPayload,
  createBrowserPreviewHealth,
  createDiagnosticsReport,
} from '../../app/data/workspace-factory'
import {
  buildDiagnosticsReport,
  createId,
  defaultQueryTextForConnection,
  defaultRowLimitForConnection,
  editorLabelForConnection,
  editorLanguageForConnection,
  evaluateGuardrails,
  languageForConnection,
  migrateWorkspaceSnapshot,
  resolveEnvironment,
  simulateExecution,
} from '../../app/state/helpers'

const STORAGE_KEY = 'universality.workspace.v2'
const MAX_CLOSED_TABS = 25

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
    return createBlankBootstrapPayload().snapshot
  }

  try {
    return migrateWorkspaceSnapshot(JSON.parse(stored) as WorkspaceSnapshot)
  } catch {
    return createBlankBootstrapPayload().snapshot
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
  const health = createBrowserPreviewHealth()

  return {
    health,
    snapshot: migrated,
    resolvedEnvironment: resolveEnvironment(
      migrated.environments,
      migrated.ui.activeEnvironmentId,
    ),
    diagnostics: createDiagnosticsReport(migrated, health),
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

  let tab = next.tabs.find((item) => item.connectionId === connection.id)

  if (!tab) {
    tab = createQueryTabForConnection(next, connection, true)
    next.tabs.push(tab)
  }

  next.ui.activeConnectionId = connection.id
  next.ui.activeEnvironmentId = tab.environmentId
  next.ui.activeTabId = tab.id
  next.updatedAt = new Date().toISOString()
  return next
}

function createQueryTabForConnection(
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

function deleteConnection(
  snapshot: WorkspaceSnapshot,
  connectionId: string,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)

  next.connections = next.connections.filter((connection) => connection.id !== connectionId)
  next.tabs = next.tabs.filter((tab) => tab.connectionId !== connectionId)

  if (next.tabs.length === 0 && next.connections[0]) {
    const connection = next.connections[0]
    next.tabs.push(createQueryTabForConnection(next, connection, false))
  }

  const activeTab =
    next.tabs.find((tab) => tab.id === next.ui.activeTabId) ?? next.tabs[0]

  if (activeTab) {
    next.ui.activeConnectionId = activeTab.connectionId
    next.ui.activeEnvironmentId = activeTab.environmentId
    next.ui.activeTabId = activeTab.id
  } else {
    next.ui.activeConnectionId = ''
    next.ui.activeEnvironmentId = ''
    next.ui.activeTabId = ''
    next.ui.bottomPanelVisible = false
    next.ui.rightDrawer = 'none'
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

function archiveClosedTab(
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

function defaultQueryTabTitle(
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

function tabTitleParts(connection: ConnectionProfile) {
  if (connection.family === 'document') {
    return { prefix: 'Query', extension: 'json' }
  }

  if (connection.family === 'keyvalue') {
    return { prefix: 'Console', extension: 'redis' }
  }

  return { prefix: 'Query', extension: 'sql' }
}

function renameQueryTab(
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

function closeQueryTab(snapshot: WorkspaceSnapshot, tabId: string): WorkspaceSnapshot {
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

function reorderQueryTabsInSnapshot(
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

function reopenClosedQueryTab(
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

  for (const tab of next.tabs) {
    if (tab.savedQueryId === updated.id) {
      tab.queryText = updated.queryText ?? tab.queryText
      tab.title = updated.name
      tab.dirty = false
      tab.result = undefined
      tab.error = undefined
      tab.status = 'idle'
    }
  }

  next.updatedAt = new Date().toISOString()
  return next
}

function saveQueryTab(
  snapshot: WorkspaceSnapshot,
  tabId: string,
  item: SavedWorkItem,
): WorkspaceSnapshot {
  const next = upsertSavedWork(snapshot, item)
  const tab = findTab(next, tabId)

  if (tab) {
    tab.savedQueryId = item.id
    tab.title = item.name
    tab.queryText = item.queryText ?? tab.queryText
    tab.dirty = false
    tab.result = undefined
    tab.error = undefined
    tab.status = 'idle'
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
    editorLabel: editorLabelForConnection(connection),
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
      capabilities.has('supports_document_view') ||
      capabilities.has('supports_graph_view') ||
      capabilities.has('supports_index_management') ||
      capabilities.has('supports_metrics_collection'),
    editorLanguage: editorLanguageForConnection(connection),
    defaultRowLimit: defaultRowLimitForConnection(connection),
  }
}

function buildOperationManifestsForConnection(
  connection: ConnectionProfile,
): OperationManifestResponse['operations'] {
  const backlog = datastoreBacklogByEngine(connection.engine)
  const capabilities = new Set(backlog?.capabilities ?? [])
  const base = [
    {
      id: `${connection.engine}.metadata.refresh`,
      engine: connection.engine,
      family: connection.family,
      label: 'Refresh Metadata',
      scope: 'connection',
      risk: 'read',
      requiredCapabilities: ['supports_schema_browser'],
      supportedRenderers: ['schema', 'table', 'json'],
      description: 'Load engine-native metadata for the explorer.',
      requiresConfirmation: false,
      executionSupport: backlog?.maturity === 'beta' ? 'plan-only' : 'live',
      disabledReason:
        backlog?.maturity === 'beta'
          ? 'Beta adapters expose generated plans before live execution.'
          : undefined,
      previewOnly: backlog?.maturity === 'beta',
    },
    {
      id: `${connection.engine}.query.execute`,
      engine: connection.engine,
      family: connection.family,
      label: 'Execute Query',
      scope: 'query',
      risk: 'read',
      requiredCapabilities: ['supports_result_snapshots'],
      supportedRenderers: backlog?.resultRenderers ?? ['raw'],
      description: 'Run a native query and normalize results.',
      requiresConfirmation: false,
      executionSupport: backlog?.maturity === 'beta' ? 'plan-only' : 'live',
      disabledReason:
        backlog?.maturity === 'beta'
          ? 'Beta adapters expose generated plans before live execution.'
          : undefined,
      previewOnly: backlog?.maturity === 'beta',
    },
  ] satisfies OperationManifestResponse['operations']

  const optional: OperationManifestResponse['operations'] = []

  if (capabilities.has('supports_explain_plan')) {
    optional.push({
      id: `${connection.engine}.query.explain`,
      engine: connection.engine,
      family: connection.family,
      label: 'View Execution Plan',
      scope: 'query',
      risk: 'diagnostic',
      requiredCapabilities: ['supports_explain_plan'],
      supportedRenderers: ['plan', 'table', 'json', 'raw'],
      description: 'Generate an execution plan preview.',
      requiresConfirmation: false,
      executionSupport: backlog?.maturity === 'beta' ? 'plan-only' : 'live',
      disabledReason:
        backlog?.maturity === 'beta'
          ? 'Beta adapters expose generated plans before live execution.'
          : undefined,
      previewOnly: backlog?.maturity === 'beta',
    })
  }

  if (capabilities.has('supports_query_profile')) {
    optional.push({
      id: `${connection.engine}.query.profile`,
      engine: connection.engine,
      family: connection.family,
      label: 'Profile Query',
      scope: 'query',
      risk: 'costly',
      requiredCapabilities: ['supports_query_profile'],
      supportedRenderers: ['profile', 'plan', 'metrics'],
      description: 'Profile a query with execution warnings.',
      requiresConfirmation: true,
      executionSupport: 'plan-only',
      disabledReason:
        'Profiling can execute workload and needs an adapter-specific live executor.',
      previewOnly: backlog?.maturity === 'beta',
    })
  }

  if (capabilities.has('supports_admin_operations')) {
    optional.push({
      id: `${connection.engine}.object.drop`,
      engine: connection.engine,
      family: connection.family,
      label: 'Drop Object',
      scope: 'schema',
      risk: 'destructive',
      requiredCapabilities: ['supports_admin_operations'],
      supportedRenderers: ['diff', 'raw'],
      description: 'Preview a destructive object operation.',
      requiresConfirmation: true,
      executionSupport: 'plan-only',
      disabledReason:
        'Destructive operation execution needs an adapter-specific live executor.',
      previewOnly: true,
    })
  }

  if (capabilities.has('supports_metrics_collection')) {
    optional.push({
      id: `${connection.engine}.diagnostics.metrics`,
      engine: connection.engine,
      family: connection.family,
      label: 'Collect Metrics',
      scope: 'cluster',
      risk: 'diagnostic',
      requiredCapabilities: ['supports_metrics_collection'],
      supportedRenderers: ['metrics', 'series', 'chart', 'json'],
      description: 'Collect normalized metrics for dashboards.',
      requiresConfirmation: false,
      executionSupport: backlog?.maturity === 'beta' ? 'plan-only' : 'live',
      disabledReason:
        backlog?.maturity === 'beta'
          ? 'Beta adapters expose generated plans before live execution.'
          : undefined,
      previewOnly: backlog?.maturity === 'beta',
    })
  }

  return [...base, ...optional]
}

function planOperationLocally(
  snapshot: WorkspaceSnapshot,
  request: OperationPlanRequest,
): OperationPlanResponse {
  const connection = findConnection(snapshot, request.connectionId)

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  const destructive =
    request.operationId.includes('.drop') ||
    request.operationId.includes('backup') ||
    request.operationId.includes('restore')
  const costly =
    destructive ||
    request.operationId.includes('.profile') ||
    request.operationId.includes('metrics')

  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    plan: {
      operationId: request.operationId,
      engine: connection.engine,
      summary: `Preview operation plan prepared for ${connection.name}.`,
      generatedRequest:
        request.objectName && connection.family === 'sql'
          ? `select * from ${request.objectName} limit 100;`
          : defaultQueryTextForConnection(connection),
      requestLanguage: languageForConnection(connection),
      destructive,
      estimatedCost: costly
        ? 'Unknown until a live dry run/profile is available.'
        : 'No material cost expected in preview mode.',
      estimatedScanImpact: costly
        ? 'May scan data or execute workload depending on the engine.'
        : 'Metadata/read preview only.',
      requiredPermissions: destructive
        ? ['owner/admin role or equivalent destructive privilege']
        : ['read metadata/query privilege'],
      confirmationText: destructive || costly ? `CONFIRM ${connection.engine.toUpperCase()}` : undefined,
      warnings: [
        'Preview mode generates guarded operation plans without mutating the datastore.',
      ],
    },
  }
}

function inspectPermissionsLocally(
  snapshot: WorkspaceSnapshot,
  request: PermissionInspectionRequest,
): PermissionInspectionResponse {
  const connection = findConnection(snapshot, request.connectionId)

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  const operations = buildOperationManifestsForConnection(connection)
  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    inspection: {
      engine: connection.engine,
      principal: connection.auth.username ?? connection.auth.principal,
      effectiveRoles: connection.readOnly ? ['read-only-profile'] : ['profile-default'],
      effectivePrivileges: connection.readOnly
        ? ['metadata:read', 'query:read']
        : ['metadata:read', 'query:read', 'operation:plan'],
      iamSignals: connection.connectionMode?.startsWith('cloud')
        ? ['cloud-identity-profile']
        : [],
      unavailableActions: operations
        .filter((operation) =>
          connection.readOnly
            ? ['write', 'destructive', 'costly'].includes(operation.risk)
            : operation.previewOnly && operation.risk === 'destructive',
        )
        .map((operation) => ({
          operationId: operation.id,
          reason: connection.readOnly
            ? 'Connection profile is read-only.'
            : 'Destructive beta operations require live permission checks before execution.',
        })),
      warnings: ['Permission inspection is preview-normalized in browser mode.'],
    },
  }
}

function collectDiagnosticsLocally(
  snapshot: WorkspaceSnapshot,
  request: AdapterDiagnosticsRequest,
): AdapterDiagnosticsResponse {
  const connection = findConnection(snapshot, request.connectionId)

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    diagnostics: {
      engine: connection.engine,
      plans: [
        {
          renderer: 'plan',
          format: 'json',
          value: { engine: connection.engine, scope: request.scope ?? 'connection' },
          summary: 'Preview plan payload.',
        },
      ],
      profiles: [
        {
          renderer: 'profile',
          summary: 'Preview profile payload.',
          stages: [{ name: 'preview', durationMs: 0, rows: 0 }],
        },
      ],
      metrics: [
        {
          renderer: 'metrics',
          metrics: [
            {
              name: 'preview.capabilities',
              value: datastoreBacklogByEngine(connection.engine)?.capabilities.length ?? 0,
              unit: 'capabilities',
              labels: { engine: connection.engine },
            },
          ],
        },
      ],
      queryHistory: [
        {
          renderer: 'json',
          value: { message: 'Preview query history normalizes engine-specific history APIs.' },
        },
      ],
      costEstimates: [
        {
          renderer: 'costEstimate',
          estimatedBytes: 0,
          estimatedCredits: 0,
          estimatedCost: 0,
          details: { dryRunRequired: true },
        },
      ],
      warnings: ['Browser preview diagnostics do not contact live engines.'],
    },
  }
}

function executeOperationLocally(
  snapshot: WorkspaceSnapshot,
  request: OperationExecutionRequest,
): OperationExecutionResponse {
  const planResponse = planOperationLocally(snapshot, request)
  const connection = findConnection(snapshot, request.connectionId)
  const operation = connection
    ? buildOperationManifestsForConnection(connection).find(
        (item) => item.id === request.operationId,
      )
    : undefined
  const executionSupport = operation?.executionSupport ?? 'unsupported'
  const warnings = [...planResponse.plan.warnings]
  const messages: string[] = []

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  if (
    connection.readOnly &&
    operation &&
    ['write', 'destructive'].includes(operation.risk)
  ) {
    warnings.push('Live execution was blocked because this connection is read-only.')
  }

  const confirmationText = planResponse.plan.confirmationText
  if (confirmationText && request.confirmationText !== confirmationText) {
    warnings.push(`Type \`${confirmationText}\` before executing this operation.`)
  }

  if (executionSupport !== 'live' || warnings.length > planResponse.plan.warnings.length) {
    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      operationId: request.operationId,
      executionSupport,
      executed: false,
      plan: planResponse.plan,
      messages,
      warnings,
    }
  }

  if (request.operationId.endsWith('security.inspect')) {
    const permissionInspection = inspectPermissionsLocally(snapshot, request).inspection
    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      operationId: request.operationId,
      executionSupport,
      executed: true,
      plan: planResponse.plan,
      permissionInspection,
      messages: ['Permission inspection completed.'],
      warnings,
    }
  }

  if (request.operationId.endsWith('diagnostics.metrics')) {
    const diagnostics = collectDiagnosticsLocally(snapshot, request).diagnostics
    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      operationId: request.operationId,
      executionSupport,
      executed: true,
      plan: planResponse.plan,
      diagnostics,
      messages: ['Adapter diagnostics collected.'],
      warnings,
    }
  }

  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    operationId: request.operationId,
    executionSupport,
    executed: true,
    plan: planResponse.plan,
    metadata: {
      summary: `Preview operation ${request.operationId} executed in browser mode.`,
    },
    messages: ['Preview operation completed.'],
    warnings,
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

function createStructureResponseLocally(
  snapshot: WorkspaceSnapshot,
  request: StructureRequest,
): StructureResponse {
  const connection = findConnection(snapshot, request.connectionId)

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  if (connection.family === 'document') {
    const collections = ['products', 'inventory', 'orders']

    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      engine: connection.engine,
      summary: `Preview structure loaded ${collections.length} collection(s).`,
      groups: [
        {
          id: connection.database || connection.name,
          label: connection.database || connection.name,
          kind: 'database',
        },
      ],
      nodes: collections.map((collection) => ({
        id: collection,
        family: 'document',
        label: collection,
        kind: 'collection',
        groupId: connection.database || connection.name,
        detail: 'Preview collection shape',
        metrics: [
          { label: 'Documents', value: collection === 'products' ? '42' : '12' },
          { label: 'Indexes', value: '2' },
        ],
        fields: [
          { name: '_id', dataType: 'objectId', primary: true },
          { name: 'name', dataType: 'string' },
          { name: 'updatedAt', dataType: 'dateTime' },
        ],
      })),
      edges: [
        {
          id: 'orders-productId-products',
          from: 'orders',
          to: 'products',
          label: 'productId may reference products',
          kind: 'inferred-reference',
          inferred: true,
        },
      ],
      metrics: [{ label: 'Collections', value: String(collections.length) }],
    }
  }

  if (connection.family === 'keyvalue') {
    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      engine: connection.engine,
      summary: 'Preview structure loaded Redis key prefixes.',
      groups: [
        { id: 'session', label: 'session:*', kind: 'prefix', detail: '2 sampled keys' },
        { id: 'cache', label: 'cache:*', kind: 'prefix', detail: '2 sampled keys' },
      ],
      nodes: ['session:9f2d7e1a', 'session:7cc1a6f2', 'cache:products'].map((key) => ({
        id: key,
        family: 'keyvalue',
        label: key,
        kind: key.startsWith('session') ? 'hash' : 'string',
        groupId: key.split(':')[0],
        detail: 'Preview Redis key',
        metrics: [
          { label: 'TTL', value: key.startsWith('cache') ? '120' : '1800' },
          { label: 'Memory', value: '4 KB' },
        ],
      })),
      edges: [],
      metrics: [{ label: 'Sampled keys', value: '3' }],
    }
  }

  const schema = connection.engine === 'sqlite' ? 'main' : 'public'
  const tables = [
    {
      id: `${schema}.accounts`,
      label: 'accounts',
      fields: [
        { name: 'id', dataType: 'uuid', primary: true },
        { name: 'name', dataType: 'text', nullable: false },
      ],
    },
    {
      id: `${schema}.transactions`,
      label: 'transactions',
      fields: [
        { name: 'id', dataType: 'uuid', primary: true },
        { name: 'account_id', dataType: 'uuid' },
        { name: 'amount', dataType: 'numeric' },
      ],
    },
  ]

  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    engine: connection.engine,
    summary: `Preview structure loaded ${tables.length} table(s).`,
    groups: [{ id: schema, label: schema, kind: 'schema' }],
    nodes: tables.map((table) => ({
      id: table.id,
      family: 'sql',
      label: table.label,
      kind: 'table',
      groupId: schema,
      detail: table.id,
      metrics: [{ label: 'Columns', value: String(table.fields.length) }],
      fields: table.fields,
    })),
    edges: [
      {
        id: `${schema}.transactions-account_id-${schema}.accounts`,
        from: `${schema}.transactions`,
        to: `${schema}.accounts`,
        label: 'account_id -> id',
        kind: 'foreign-key',
        inferred: false,
      },
    ],
    metrics: [{ label: 'Objects', value: String(tables.length) }],
  }
}

function fetchResultPageLocally(
  snapshot: WorkspaceSnapshot,
  request: ResultPageRequest,
): ResultPageResponse {
  const connection = findConnection(snapshot, request.connectionId)
  const pageSize = request.pageSize ?? 500
  const pageIndex = request.pageIndex ?? 1
  const offset = pageIndex * pageSize

  if (connection?.family === 'document') {
    const documents = Array.from({ length: Math.min(pageSize, 500) }, (_, index) => ({
      _id: `preview-${offset + index + 1}`,
      name: `Preview document ${offset + index + 1}`,
      page: pageIndex,
    }))

    return {
      tabId: request.tabId,
      payload: { renderer: 'document', documents },
      pageInfo: {
        pageSize,
        pageIndex,
        bufferedRows: documents.length,
        hasMore: pageIndex < 2,
      },
      notices: [],
    }
  }

  const rows = Array.from({ length: Math.min(pageSize, 500) }, (_, index) => [
    String(offset + index + 1),
    `Buffered row ${offset + index + 1}`,
  ])

  return {
    tabId: request.tabId,
    payload: { renderer: 'table', columns: ['id', 'name'], rows },
    pageInfo: {
      pageSize,
      pageIndex,
      bufferedRows: rows.length,
      hasMore: pageIndex < 2,
      nextCursor: connection?.family === 'keyvalue' && pageIndex < 2 ? String(pageIndex + 1) : undefined,
    },
    notices: [],
  }
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

  async setTabEnvironment(
    tabId: string,
    environmentId: string,
  ): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('set_tab_environment', {
        tabId,
        environmentId,
      })
    }

    const next = cloneSnapshot(loadBrowserSnapshot())
    const tab = findTab(next, tabId)
    const environment = next.environments.find((item) => item.id === environmentId)

    if (!tab || !environment) {
      return buildBrowserPayload(next)
    }

    tab.environmentId = environment.id
    tab.status = 'idle'
    tab.error = undefined
    tab.result = undefined
    tab.lastRunAt = undefined
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

  async deleteConnection(connectionId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('delete_connection_profile', {
        connectionId,
      })
    }

    const snapshot = deleteConnection(loadBrowserSnapshot(), connectionId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async storeSecret(secretRef: SecretRef, secret: string): Promise<boolean> {
    if (isTauriRuntime()) {
      return invokeDesktop<boolean>('store_secret', { secretRef, secret })
    }

    return Boolean(secretRef.id && secret)
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

    const tab = createQueryTabForConnection(next, connection, true)
    const snapshot = upsertTab(next, tab)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async closeQueryTab(tabId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('close_query_tab', { tabId })
    }

    const snapshot = closeQueryTab(loadBrowserSnapshot(), tabId)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async reorderQueryTabs(orderedTabIds: string[]): Promise<BootstrapPayload> {
    const request: QueryTabReorderRequest = { orderedTabIds }

    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('reorder_query_tabs', { request })
    }

    const snapshot = reorderQueryTabsInSnapshot(loadBrowserSnapshot(), request)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async reopenClosedQueryTab(closedTabId: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('reopen_closed_query_tab', {
        closedTabId,
      })
    }

    const snapshot = reopenClosedQueryTab(loadBrowserSnapshot(), closedTabId)
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

  async renameQueryTab(tabId: string, title: string): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('rename_query_tab', { tabId, title })
    }

    const snapshot = renameQueryTab(loadBrowserSnapshot(), tabId, title)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async upsertSavedWork(item: SavedWorkItem): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('upsert_saved_work_item', { item })
    }

    const snapshot = upsertSavedWork(loadBrowserSnapshot(), item)
    saveBrowserSnapshot(snapshot)
    return buildBrowserPayload(snapshot)
  },

  async saveQueryTab(tabId: string, item: SavedWorkItem): Promise<BootstrapPayload> {
    if (isTauriRuntime()) {
      return invokeDesktop<BootstrapPayload>('save_query_tab', { tabId, item })
    }

    const snapshot = saveQueryTab(loadBrowserSnapshot(), tabId, item)
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

  async loadStructureMap(request: StructureRequest): Promise<StructureResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<StructureResponse>('load_structure_map', { request })
    }

    return createStructureResponseLocally(loadBrowserSnapshot(), request)
  },

  async inspectExplorer(
    request: ExplorerInspectRequest,
  ): Promise<ExplorerInspectResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ExplorerInspectResponse>('inspect_explorer_node', { request })
    }

    return inspectExplorerNodeLocally(loadBrowserSnapshot(), request)
  },

  async listDatastoreOperations(
    request: OperationManifestRequest,
  ): Promise<OperationManifestResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<OperationManifestResponse>('list_datastore_operations', { request })
    }

    const snapshot = loadBrowserSnapshot()
    const connection = findConnection(snapshot, request.connectionId)

    if (!connection) {
      throw new Error('Connection was not found.')
    }

    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      engine: connection.engine,
      operations: buildOperationManifestsForConnection(connection),
    }
  },

  async planDatastoreOperation(
    request: OperationPlanRequest,
  ): Promise<OperationPlanResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<OperationPlanResponse>('plan_datastore_operation', { request })
    }

    return planOperationLocally(loadBrowserSnapshot(), request)
  },

  async executeDatastoreOperation(
    request: OperationExecutionRequest,
  ): Promise<OperationExecutionResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<OperationExecutionResponse>('execute_datastore_operation', {
        request,
      })
    }

    return executeOperationLocally(loadBrowserSnapshot(), request)
  },

  async inspectConnectionPermissions(
    request: PermissionInspectionRequest,
  ): Promise<PermissionInspectionResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<PermissionInspectionResponse>(
        'inspect_connection_permissions',
        { request },
      )
    }

    return inspectPermissionsLocally(loadBrowserSnapshot(), request)
  },

  async collectAdapterDiagnostics(
    request: AdapterDiagnosticsRequest,
  ): Promise<AdapterDiagnosticsResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<AdapterDiagnosticsResponse>('collect_adapter_diagnostics', { request })
    }

    return collectDiagnosticsLocally(loadBrowserSnapshot(), request)
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

  async fetchResultPage(request: ResultPageRequest): Promise<ResultPageResponse> {
    if (isTauriRuntime()) {
      return invokeDesktop<ResultPageResponse>('fetch_result_page', { request })
    }

    return fetchResultPageLocally(loadBrowserSnapshot(), request)
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

  async pickLocalDatabaseFile(
    request: LocalDatabasePickRequest,
  ): Promise<LocalDatabasePickResult> {
    if (isTauriRuntime()) {
      return invokeDesktop<LocalDatabasePickResult>('pick_local_database_file', { request })
    }

    if (request.engine !== 'sqlite') {
      return { canceled: true }
    }

    const filename =
      request.purpose === 'create'
        ? 'universality-preview-local.sqlite'
        : 'universality-preview-existing.sqlite'

    return {
      canceled: false,
      path: `C:\\Users\\gmont\\Universality\\${filename}`,
    }
  },

  async createLocalDatabase(
    request: LocalDatabaseCreateRequest,
  ): Promise<LocalDatabaseCreateResult> {
    if (isTauriRuntime()) {
      return invokeDesktop<LocalDatabaseCreateResult>('create_local_database', { request })
    }

    return {
      engine: request.engine,
      path: request.path,
      message:
        request.mode === 'starter'
          ? 'Preview SQLite starter database prepared.'
          : 'Preview SQLite empty database prepared.',
      warnings:
        request.engine === 'sqlite'
          ? []
          : ['This local database engine is reserved for future adapter work.'],
    }
  },

  async createDiagnosticsReport(): Promise<DiagnosticsReport> {
    if (isTauriRuntime()) {
      return invokeDesktop<DiagnosticsReport>('create_diagnostics_report')
    }

    const snapshot = loadBrowserSnapshot()
    return buildDiagnosticsReport(snapshot, createBrowserPreviewHealth())
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
