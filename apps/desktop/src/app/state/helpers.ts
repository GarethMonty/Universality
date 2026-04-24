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

const MIN_BOTTOM_PANEL_HEIGHT = 180
const DEFAULT_BOTTOM_PANEL_HEIGHT = 260
const MAX_BOTTOM_PANEL_HEIGHT = 420

function clampBottomPanelHeight(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_BOTTOM_PANEL_HEIGHT
  }

  return Math.min(
    MAX_BOTTOM_PANEL_HEIGHT,
    Math.max(MIN_BOTTOM_PANEL_HEIGHT, Math.round(value)),
  )
}

function isSidebarPane(value: unknown): value is UiState['activeSidebarPane'] {
  return value === 'connections' || value === 'explorer' || value === 'saved-work' || value === 'search'
}

function isActivity(value: unknown): value is UiState['activeActivity'] {
  return isSidebarPane(value) || value === 'settings'
}

function isBottomPanelTab(value: unknown): value is UiState['activeBottomPanelTab'] {
  return value === 'results' || value === 'messages' || value === 'details'
}

function isRightDrawer(value: unknown): value is UiState['rightDrawer'] {
  return value === 'none' || value === 'connection' || value === 'inspection' || value === 'diagnostics'
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

  return {
    activeConnectionId: activeConnection?.id ?? '',
    activeEnvironmentId: activeEnvironment?.id ?? '',
    activeTabId: activeTab?.id ?? '',
    explorerFilter:
      typeof legacyUi?.explorerFilter === 'string' ? legacyUi.explorerFilter : '',
    activeActivity,
    sidebarCollapsed: Boolean(legacyUi?.sidebarCollapsed),
    activeSidebarPane,
    bottomPanelVisible:
      typeof legacyUi?.bottomPanelVisible === 'boolean' ? legacyUi.bottomPanelVisible : true,
    activeBottomPanelTab: isBottomPanelTab(legacyUi?.activeBottomPanelTab)
      ? legacyUi.activeBottomPanelTab
      : 'results',
    bottomPanelHeight: clampBottomPanelHeight(legacyUi?.bottomPanelHeight),
    rightDrawer: isRightDrawer(legacyUi?.rightDrawer) ? legacyUi.rightDrawer : 'none',
  }
}

export function migrateWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const next = JSON.parse(JSON.stringify(snapshot)) as WorkspaceSnapshot
  next.schemaVersion = 3
  next.ui = normalizeUiState(next)

  for (const tab of next.tabs) {
    tab.result = undefined
  }

  return next
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
  if (connection.family === 'document') {
    return 'mongodb'
  }

  if (connection.family === 'keyvalue') {
    return 'redis'
  }

  return 'sql'
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
      truncated: false,
      rowLimit: 200,
    },
  }
}
