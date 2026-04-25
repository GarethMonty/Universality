import type {
  AppHealth,
  ConnectionProfile,
  DiagnosticsReport,
  EnvironmentProfile,
  ExecutionResultEnvelope,
  GuardrailDecision,
  QueryTabState,
  ResolvedEnvironment,
  ResultPayload,
  UiState,
  WorkspaceSnapshot,
} from '@universality/shared-types'
import {
  datastoreBacklogByEngine,
  UNIVERSALITY_ADAPTER_MANIFESTS,
} from '@universality/shared-types'

const MIN_BOTTOM_PANEL_HEIGHT = 120
const DEFAULT_BOTTOM_PANEL_HEIGHT = 260
const MAX_BOTTOM_PANEL_HEIGHT = 900
const MIN_SIDEBAR_WIDTH = 220
const DEFAULT_SIDEBAR_WIDTH = 280
const MAX_SIDEBAR_WIDTH = 420
const MIN_RIGHT_DRAWER_WIDTH = 320
const DEFAULT_RIGHT_DRAWER_WIDTH = 360
const MAX_RIGHT_DRAWER_WIDTH = 560
const WORKSPACE_SCHEMA_VERSION = 6
const DEMO_CONNECTION_IDS = new Set([
  'conn-analytics',
  'conn-orders',
  'conn-catalog',
  'conn-commerce',
  'conn-local-sqlite',
  'conn-cache',
])
const DEMO_ENVIRONMENT_IDS = new Set(['env-dev', 'env-uat', 'env-prod'])
const DEMO_TAB_IDS = new Set([
  'tab-sql-ops',
  'tab-orders-audit',
  'tab-mongo-catalog',
  'tab-commerce-mysql',
  'tab-local-sqlite',
  'tab-redis-session',
])
const DEMO_SAVED_WORK_IDS = new Set(['saved-locks', 'saved-hotkeys', 'saved-catalog'])

function clampBottomPanelHeight(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_BOTTOM_PANEL_HEIGHT
  }

  return Math.min(
    MAX_BOTTOM_PANEL_HEIGHT,
    Math.max(MIN_BOTTOM_PANEL_HEIGHT, Math.round(value)),
  )
}

function clampSidebarWidth(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_SIDEBAR_WIDTH
  }

  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)),
  )
}

function clampRightDrawerWidth(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_RIGHT_DRAWER_WIDTH
  }

  return Math.min(
    MAX_RIGHT_DRAWER_WIDTH,
    Math.max(MIN_RIGHT_DRAWER_WIDTH, Math.round(value)),
  )
}

function isSidebarPane(value: unknown): value is UiState['activeSidebarPane'] {
  return (
    value === 'connections' ||
    value === 'environments' ||
    value === 'explorer' ||
    value === 'saved-work' ||
    value === 'search'
  )
}

function isActivity(value: unknown): value is UiState['activeActivity'] {
  return isSidebarPane(value) || value === 'settings'
}

function isBottomPanelTab(value: unknown): value is UiState['activeBottomPanelTab'] {
  return value === 'results' || value === 'messages' || value === 'details'
}

function isRightDrawer(value: unknown): value is UiState['rightDrawer'] {
  return (
    value === 'none' ||
    value === 'connection' ||
    value === 'inspection' ||
    value === 'diagnostics' ||
    value === 'operations'
  )
}

function isExplorerView(value: unknown): value is UiState['explorerView'] {
  return value === 'tree' || value === 'structure'
}

export function normalizeUiState(snapshot: WorkspaceSnapshot): UiState {
  const firstTab = snapshot.tabs[0]
  const firstConnection = snapshot.connections[0]
  const firstEnvironment = snapshot.environments[0]
  const legacyUi = snapshot.ui as Partial<UiState> | undefined
  const activeTab =
    snapshot.tabs.find((item) => item.id === legacyUi?.activeTabId) ?? firstTab
  const activeConnection =
    snapshot.connections.find((item) => item.id === legacyUi?.activeConnectionId) ??
    (activeTab
      ? snapshot.connections.find((item) => item.id === activeTab.connectionId)
      : undefined) ??
    firstConnection
  const activeEnvironment =
    snapshot.environments.find((item) => item.id === legacyUi?.activeEnvironmentId) ??
    (activeTab
      ? snapshot.environments.find((item) => item.id === activeTab.environmentId)
      : undefined) ??
    firstEnvironment
  const activeActivity = isActivity(legacyUi?.activeActivity)
    ? legacyUi.activeActivity
    : 'connections'
  const activeSidebarPane = isSidebarPane(legacyUi?.activeSidebarPane)
    ? legacyUi.activeSidebarPane
    : activeActivity === 'settings'
      ? 'connections'
      : activeActivity
  const activeBottomPanelTab = isBottomPanelTab(legacyUi?.activeBottomPanelTab)
    ? legacyUi.activeBottomPanelTab
    : 'results'

  return {
    activeConnectionId: activeConnection?.id ?? '',
    activeEnvironmentId: activeEnvironment?.id ?? '',
    activeTabId: activeTab?.id ?? '',
    explorerFilter:
      typeof legacyUi?.explorerFilter === 'string' ? legacyUi.explorerFilter : '',
    explorerView: isExplorerView(legacyUi?.explorerView) ? legacyUi.explorerView : 'structure',
    activeActivity,
    sidebarCollapsed: Boolean(legacyUi?.sidebarCollapsed),
    activeSidebarPane,
    sidebarWidth: clampSidebarWidth(legacyUi?.sidebarWidth),
    bottomPanelVisible:
      (Boolean(activeTab) || activeBottomPanelTab === 'messages') &&
      (typeof legacyUi?.bottomPanelVisible === 'boolean' ? legacyUi.bottomPanelVisible : false),
    activeBottomPanelTab,
    bottomPanelHeight: clampBottomPanelHeight(legacyUi?.bottomPanelHeight),
    rightDrawer: isRightDrawer(legacyUi?.rightDrawer) ? legacyUi.rightDrawer : 'none',
    rightDrawerWidth: clampRightDrawerWidth(legacyUi?.rightDrawerWidth),
  }
}

export function migrateWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const next = JSON.parse(JSON.stringify(snapshot)) as WorkspaceSnapshot
  next.closedTabs ??= []
  next.adapterManifests = UNIVERSALITY_ADAPTER_MANIFESTS
  stripDemoRecords(next)
  next.schemaVersion = WORKSPACE_SCHEMA_VERSION
  next.ui = normalizeUiState(next)

  for (const tab of next.tabs) {
    tab.result = undefined
  }

  for (const tab of next.closedTabs) {
    tab.result = undefined
  }

  return next
}

function stripDemoRecords(snapshot: WorkspaceSnapshot) {
  snapshot.connections = snapshot.connections.filter(
    (connection) => !DEMO_CONNECTION_IDS.has(connection.id),
  )
  snapshot.tabs = snapshot.tabs.filter((tab) => !DEMO_TAB_IDS.has(tab.id))
  snapshot.closedTabs = (snapshot.closedTabs ?? []).filter(
    (tab) => !DEMO_TAB_IDS.has(tab.id),
  )
  snapshot.savedWork = snapshot.savedWork.filter(
    (item) => !DEMO_SAVED_WORK_IDS.has(item.id),
  )
  snapshot.explorerNodes = snapshot.explorerNodes.filter(
    (node) => !node.id.startsWith('explorer-'),
  )
  snapshot.guardrails = []

  const referencedEnvironmentIds = new Set<string>()
  snapshot.connections.forEach((connection) => {
    connection.environmentIds.forEach((environmentId) =>
      referencedEnvironmentIds.add(environmentId),
    )
  })
  snapshot.tabs.forEach((tab) => referencedEnvironmentIds.add(tab.environmentId))
  snapshot.closedTabs.forEach((tab) => referencedEnvironmentIds.add(tab.environmentId))
  snapshot.savedWork.forEach((item) => {
    if (item.environmentId) {
      referencedEnvironmentIds.add(item.environmentId)
    }
  })
  snapshot.environments = snapshot.environments.filter(
    (environment) =>
      !DEMO_ENVIRONMENT_IDS.has(environment.id) ||
      referencedEnvironmentIds.has(environment.id),
  )
}

export function resolveEnvironment(
  environments: EnvironmentProfile[],
  environmentId: string,
): ResolvedEnvironment {
  const fallback =
    environments[0] ??
    ({
      id: 'environment-missing',
      label: 'Missing environment',
      color: '#000000',
      risk: 'low',
      variables: {},
      sensitiveKeys: [],
      requiresConfirmation: false,
      safeMode: false,
      exportable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies EnvironmentProfile)
  const environmentMap = new Map(
    environments.map((environment) => [environment.id, environment]),
  )
  const resolvedChain: EnvironmentProfile[] = []
  const visited = new Set<string>()
  let current = environmentMap.get(environmentId)

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    resolvedChain.unshift(current)
    current = current.inheritsFrom
      ? environmentMap.get(current.inheritsFrom)
      : undefined
  }

  const activeEnvironment =
    environmentMap.get(environmentId) ?? fallback

  const variables: Record<string, string> = {}
  const inheritedChain: string[] = []
  const sensitiveKeys = new Set<string>()

  for (const environment of resolvedChain) {
    inheritedChain.push(environment.label)
    Object.assign(variables, environment.variables)

    for (const key of environment.sensitiveKeys) {
      sensitiveKeys.add(key)
    }
  }

  const unresolvedKeys = Object.entries(variables)
    .filter(([, value]) => value.includes('${'))
    .map(([key]) => key)

  return {
    environmentId: activeEnvironment.id,
    label: activeEnvironment.label,
    risk: activeEnvironment.risk,
    variables,
    unresolvedKeys,
    inheritedChain,
    sensitiveKeys: [...sensitiveKeys],
  }
}

export function evaluateGuardrails(
  connection: ConnectionProfile,
  environment: EnvironmentProfile,
  resolvedEnvironment: ResolvedEnvironment,
  queryText: string,
  safeModeEnabled: boolean,
): GuardrailDecision {
  const reasons: string[] = []
  const normalized = queryText.toLowerCase()
  const looksWrite = /(insert|update|delete|drop|truncate|alter|create|flushdb|flushall|set )/.test(
    normalized,
  )

  if (resolvedEnvironment.unresolvedKeys.length > 0) {
    reasons.push('Unresolved environment variables must be fixed before execution.')
    return {
      status: 'block',
      reasons,
      safeModeApplied: safeModeEnabled || environment.safeMode,
    }
  }

  if (connection.readOnly && looksWrite) {
    reasons.push('This connection is marked read-only.')
    return {
      status: 'block',
      reasons,
      safeModeApplied: safeModeEnabled || environment.safeMode,
    }
  }

  if (
    environment.requiresConfirmation &&
    (looksWrite || environment.risk === 'critical')
  ) {
    reasons.push(`${environment.label} requires confirmation for risky work.`)
    return {
      status: 'confirm',
      reasons,
      safeModeApplied: safeModeEnabled || environment.safeMode,
      requiredConfirmationText: `CONFIRM ${environment.label}`,
    }
  }

  reasons.push('Guardrails cleared for the current query.')

  return {
    status: 'allow',
    reasons,
    safeModeApplied: safeModeEnabled || environment.safeMode,
  }
}

export function buildDiagnosticsReport(
  snapshot: WorkspaceSnapshot,
  health: AppHealth,
): DiagnosticsReport {
  const warnings: string[] = []

  if (snapshot.lockState.isLocked) {
    warnings.push('Application is currently locked.')
  }

  if (snapshot.preferences.telemetry === 'disabled') {
    warnings.push('Crash reporting is disabled.')
  }

  if (
    snapshot.environments.some((environment) => environment.risk === 'critical')
  ) {
    warnings.push('Critical environments are configured in this workspace.')
  }

  return {
    createdAt: new Date().toISOString(),
    runtime: health.runtime,
    platform: health.platform,
    appVersion: '0.1.0',
    counts: {
      connections: snapshot.connections.length,
      environments: snapshot.environments.length,
      tabs: snapshot.tabs.length,
      savedWork: snapshot.savedWork.length,
    },
    warnings,
  }
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function languageForConnection(connection: ConnectionProfile): QueryTabState['language'] {
  const defaultLanguage = datastoreBacklogByEngine(connection.engine)?.defaultLanguage

  if (defaultLanguage) {
    return defaultLanguage
  }

  if (connection.family === 'document') {
    return 'mongodb'
  }

  if (connection.family === 'keyvalue') {
    return 'redis'
  }

  return 'sql'
}

export function editorLanguageForConnection(connection: ConnectionProfile) {
  const language = languageForConnection(connection)

  if (language === 'mongodb' || language === 'json' || language === 'query-dsl') {
    return 'json'
  }

  if (
    language === 'sql' ||
    language === 'cql' ||
    language === 'google-sql' ||
    language === 'snowflake-sql' ||
    language === 'clickhouse-sql'
  ) {
    return 'sql'
  }

  return 'plaintext'
}

export function editorLabelForConnection(connection: ConnectionProfile) {
  const language = languageForConnection(connection)

  if (language === 'mongodb' || connection.family === 'document') {
    return 'Document query'
  }

  if (language === 'redis') {
    return `${connection.engine === 'valkey' ? 'Valkey' : 'Redis'} console`
  }

  if (language === 'cypher') {
    return 'Cypher editor'
  }

  if (language === 'gremlin') {
    return 'Gremlin editor'
  }

  if (language === 'sparql') {
    return 'SPARQL editor'
  }

  if (language === 'aql') {
    return 'AQL editor'
  }

  if (language === 'promql') {
    return 'PromQL editor'
  }

  if (language === 'influxql' || language === 'flux' || language === 'opentsdb') {
    return 'Time-series query'
  }

  if (language === 'query-dsl') {
    return 'Search DSL editor'
  }

  if (language === 'google-sql') {
    return 'GoogleSQL editor'
  }

  if (language === 'snowflake-sql') {
    return 'Snowflake SQL editor'
  }

  if (language === 'clickhouse-sql') {
    return 'ClickHouse SQL editor'
  }

  if (language === 'cql') {
    return 'CQL editor'
  }

  return 'SQL editor'
}

export function defaultQueryTextForConnection(connection: ConnectionProfile) {
  switch (connection.engine) {
    case 'mongodb':
      return '{\n  "collection": "products",\n  "filter": {},\n  "limit": 50\n}'
    case 'dynamodb':
      return '{\n  "table": "Orders",\n  "keyCondition": "pk = :pk",\n  "values": { ":pk": "CUSTOMER#123" },\n  "limit": 25\n}'
    case 'cosmosdb':
      return 'select top 50 * from c'
    case 'litedb':
      return '{\n  "collection": "products",\n  "filter": {},\n  "limit": 50\n}'
    case 'redis':
    case 'valkey':
      return 'SCAN 0 MATCH session:* COUNT 25'
    case 'memcached':
      return 'stats'
    case 'cassandra':
      return 'select * from keyspace.table limit 25;'
    case 'neo4j':
      return 'MATCH (n) RETURN n LIMIT 25'
    case 'neptune':
    case 'janusgraph':
      return 'g.V().limit(25)'
    case 'arango':
      return 'FOR doc IN collection LIMIT 25 RETURN doc'
    case 'influxdb':
      return 'SELECT * FROM measurement LIMIT 25'
    case 'prometheus':
      return 'up'
    case 'opentsdb':
      return '{\n  "start": "1h-ago",\n  "queries": [\n    { "metric": "sys.cpu.user", "aggregator": "avg" }\n  ]\n}'
    case 'elasticsearch':
    case 'opensearch':
      return '{\n  "query": { "match_all": {} },\n  "size": 25\n}'
    case 'bigquery':
    case 'snowflake':
    case 'clickhouse':
    case 'duckdb':
    case 'postgresql':
    case 'cockroachdb':
    case 'sqlserver':
    case 'mysql':
    case 'mariadb':
    case 'sqlite':
    case 'oracle':
    case 'timescaledb':
      return 'select 1;'
    default:
      return ''
  }
}

export function defaultRowLimitForConnection(connection: ConnectionProfile) {
  if (connection.family === 'document' || connection.family === 'keyvalue') {
    return 100
  }

  if (connection.family === 'search' || connection.family === 'timeseries') {
    return 250
  }

  return 200
}

export function simulateExecution(
  connection: ConnectionProfile,
  environment: EnvironmentProfile,
  resolvedEnvironment: ResolvedEnvironment,
  tab: QueryTabState,
): { guardrail: GuardrailDecision; result?: ExecutionResultEnvelope } {
  const guardrail = evaluateGuardrails(
    connection,
    environment,
    resolvedEnvironment,
    tab.queryText,
    true,
  )

  if (guardrail.status === 'block') {
    return { guardrail }
  }

  const executedAt = new Date().toISOString()
  let payloads: ResultPayload[]
  let summary: string
  let rendererModes: ExecutionResultEnvelope['rendererModes']
  let defaultRenderer: ExecutionResultEnvelope['defaultRenderer']

  if (connection.family === 'document') {
    payloads = [
      {
        renderer: 'document',
        documents: [
          {
            _id: 'itm-2048',
            sku: 'luna-lamp',
            inventory: { reserved: 4, available: 18 },
            channels: ['web', 'store', 'partner'],
          },
          {
            _id: 'itm-2049',
            sku: 'aurora-desk',
            inventory: { reserved: 1, available: 8 },
            channels: ['web'],
          },
        ],
      },
      {
        renderer: 'json',
        value: {
          status: 'ok',
          sampleCount: 2,
        },
      },
    ]
    summary = '2 documents returned from MongoDB adapter preview.'
    rendererModes = ['document', 'json', 'table']
    defaultRenderer = 'document'
  } else if (connection.family === 'keyvalue') {
    payloads = [
      {
        renderer: 'keyvalue',
        entries: {
          userId: 'a1b2c3',
          region: 'eu-west-1',
          lastSeenAt: executedAt,
          flags: 'mfa, trusted-device',
        },
        ttl: '23m 11s',
        memoryUsage: '4.8 KB',
      },
      {
        renderer: 'raw',
        text: 'SCAN 0 MATCH session:* COUNT 25\nHGETALL session:9f2d7e1a\nTTL session:9f2d7e1a',
      },
    ]
    summary = 'Redis key inspection simulated successfully.'
    rendererModes = ['keyvalue', 'json', 'raw']
    defaultRenderer = 'keyvalue'
  } else if (connection.family === 'graph') {
    payloads = [
      {
        renderer: 'graph',
        nodes: [
          { id: 'customer-1', label: 'Customer', kind: 'node' },
          { id: 'order-1', label: 'Order', kind: 'node' },
        ],
        edges: [
          {
            id: 'placed-1',
            from: 'customer-1',
            to: 'order-1',
            label: 'PLACED',
            kind: 'relationship',
          },
        ],
      },
      {
        renderer: 'table',
        columns: ['from', 'relationship', 'to'],
        rows: [['Customer', 'PLACED', 'Order']],
      },
      {
        renderer: 'json',
        value: {
          engine: connection.engine,
          nodeCount: 2,
          edgeCount: 1,
        },
      },
    ]
    summary = 'Graph preview returned 2 nodes and 1 relationship.'
    rendererModes = ['graph', 'table', 'json']
    defaultRenderer = 'graph'
  } else if (connection.family === 'timeseries') {
    payloads = [
      {
        renderer: 'series',
        series: [
          {
            name: 'request_rate',
            unit: 'rps',
            points: [
              { timestamp: executedAt, value: 42 },
              { timestamp: executedAt, value: 47 },
            ],
          },
        ],
      },
      {
        renderer: 'chart',
        chartType: 'line',
        xAxis: 'time',
        yAxis: 'request_rate',
        series: [
          {
            name: 'request_rate',
            points: [
              { x: 't-1', y: 42 },
              { x: 't', y: 47 },
            ],
          },
        ],
      },
      {
        renderer: 'metrics',
        metrics: [
          { name: 'series_returned', value: 1 },
          { name: 'points_returned', value: 2 },
        ],
      },
    ]
    summary = 'Time-series preview returned 1 series.'
    rendererModes = ['series', 'chart', 'metrics']
    defaultRenderer = 'series'
  } else if (connection.family === 'search') {
    payloads = [
      {
        renderer: 'searchHits',
        total: 2,
        hits: [
          {
            id: 'doc-1',
            score: 1.23,
            source: { title: 'Universal connector', status: 'active' },
          },
          {
            id: 'doc-2',
            score: 0.94,
            source: { title: 'Roadmap backlog', status: 'planned' },
          },
        ],
        aggregations: {
          status: { active: 1, planned: 1 },
        },
      },
      {
        renderer: 'metrics',
        metrics: [
          { name: 'hits_total', value: 2 },
          { name: 'took_ms', value: 8, unit: 'ms' },
        ],
      },
      {
        renderer: 'json',
        value: {
          engine: connection.engine,
          total: 2,
          aggregations: { status: { active: 1, planned: 1 } },
        },
      },
    ]
    summary = 'Search preview returned 2 hits.'
    rendererModes = ['searchHits', 'json', 'metrics']
    defaultRenderer = 'searchHits'
  } else if (connection.family === 'widecolumn') {
    payloads = [
      {
        renderer: 'table',
        columns: ['partition_key', 'sort_key', 'status'],
        rows: [
          ['CUSTOMER#123', 'ORDER#1001', 'open'],
          ['CUSTOMER#123', 'ORDER#1002', 'closed'],
        ],
      },
      {
        renderer: 'metrics',
        metrics: [
          { name: 'items_returned', value: 2 },
          { name: 'read_units', value: 1.5 },
        ],
      },
      {
        renderer: 'json',
        value: {
          engine: connection.engine,
          itemCount: 2,
        },
      },
    ]
    summary = 'Wide-column preview returned 2 items.'
    rendererModes = ['table', 'metrics', 'json']
    defaultRenderer = 'table'
  } else {
    payloads = [
      {
        renderer: 'table',
        columns: ['table_name', 'rows_estimate', 'last_vacuum'],
        rows: [
          ['accounts', '128804', '2026-04-23 14:10'],
          ['transactions', '9843212', '2026-04-23 13:58'],
          ['alerts', '440', '2026-04-23 14:02'],
        ],
      },
      {
        renderer: 'schema',
        items: [
          { label: 'accounts', detail: 'pk_accounts, idx_accounts_email' },
          { label: 'transactions', detail: 'pk_transactions, idx_txn_created' },
        ],
      },
      {
        renderer: 'json',
        value: {
          adapter: connection.engine,
          rowCount: 3,
          executedAt,
        },
      },
    ]
    summary = '3 rows returned from SQL adapter preview.'
    rendererModes = ['table', 'schema', 'json']
    defaultRenderer = 'table'
  }

  return {
    guardrail,
    result: {
      id: createId('result'),
      engine: connection.engine,
      summary,
      defaultRenderer,
      rendererModes,
      payloads,
      notices:
        guardrail.status === 'confirm'
          ? [
              {
                code: 'guardrail-confirm',
                level: 'warning',
                message: guardrail.reasons[0] ?? 'Confirmation required.',
              },
            ]
          : [],
      executedAt,
      durationMs: 184,
      truncated: true,
      rowLimit: 500,
      pageInfo: {
        pageSize: 500,
        pageIndex: 0,
        bufferedRows: resultPayloadSize(payloads[0]),
        hasMore: true,
      },
    },
  }
}

function resultPayloadSize(payload: ResultPayload | undefined) {
  if (!payload) {
    return 0
  }

  if (payload.renderer === 'table') {
    return payload.rows.length
  }

  if (payload.renderer === 'document') {
    return payload.documents.length
  }

  if (payload.renderer === 'keyvalue') {
    return Object.keys(payload.entries).length
  }

  if (payload.renderer === 'schema') {
    return payload.items.length
  }

  return 1
}
