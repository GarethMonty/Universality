import { startTransition, useEffect, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, ReactNode, SVGProps } from 'react'
import type {
  AppHealth,
  ConnectionProfile,
  ConnectionTestResult,
  DatastoreOperationManifest,
  DiagnosticsReport,
  EnvironmentProfile,
  ExecutionCapabilities,
  ExplorerInspectResponse,
  ExportBundle,
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
  RightDrawerView,
  WorkspaceSnapshot,
} from '@datanaut/shared-types'
import {
  DATASTORE_FAMILIES,
  DATASTORE_FEATURE_BACKLOG,
} from '@datanaut/shared-types'
import {
  CloseIcon,
  ConnectionsIcon,
  ExplorerIcon,
  FavoriteIcon,
  RefreshIcon,
  ReadOnlyIcon,
  SettingsIcon,
  ThemeIcon,
} from './icons'

interface RightDrawerProps {
  view: RightDrawerView
  width: number
  health: AppHealth
  theme: WorkspaceSnapshot['preferences']['theme']
  activeConnection?: ConnectionProfile
  activeEnvironment?: EnvironmentProfile
  environments: EnvironmentProfile[]
  connectionTest?: ConnectionTestResult
  diagnostics?: DiagnosticsReport
  explorerInspection?: ExplorerInspectResponse
  exportBundle?: ExportBundle
  capabilities: ExecutionCapabilities
  exportPassphrase: string
  importPayload: string
  onExportPassphraseChange(value: string): void
  onImportPayloadChange(value: string): void
  onClose(): void
  onSaveConnection(profile: ConnectionProfile, secret?: string): void
  onTestConnection(profile: ConnectionProfile, environmentId: string): void
  onRefreshDiagnostics(): void
  onExportWorkspace(): void
  onImportWorkspace(): void
  onApplyTemplate(queryTemplate?: string): void
  onListOperations(
    request: OperationManifestRequest,
  ): Promise<OperationManifestResponse | undefined>
  onPlanOperation(
    request: OperationPlanRequest,
  ): Promise<OperationPlanResponse | undefined>
  onExecuteOperation(
    request: OperationExecutionRequest,
  ): Promise<OperationExecutionResponse | undefined>
  onToggleTheme(): void
  onPickLocalDatabaseFile(request: LocalDatabasePickRequest): Promise<LocalDatabasePickResult>
  onCreateLocalDatabase(
    request: LocalDatabaseCreateRequest,
  ): Promise<LocalDatabaseCreateResult | undefined>
  onResize(width: number): void
}

const ENGINE_OPTIONS = DATASTORE_FEATURE_BACKLOG.map((entry) => ({
  value: entry.engine,
  label: entry.displayName,
  family: entry.family,
  maturity: entry.maturity,
  defaultPort: entry.defaultPort,
  connectionMode: entry.connectionModes[0],
  localDatabase: entry.localDatabase,
}))

const ENGINE_FAMILY_LABELS: Record<ConnectionProfile['family'], string> = {
  sql: 'SQL',
  document: 'Document',
  keyvalue: 'Key-Value',
  graph: 'Graph',
  timeseries: 'Time-Series',
  widecolumn: 'Wide-Column',
  search: 'Search',
  warehouse: 'Warehouse',
  'embedded-olap': 'Embedded OLAP',
}

const ENGINE_GROUPS = DATASTORE_FAMILIES.map((family) => ({
  label: ENGINE_FAMILY_LABELS[family],
  options: ENGINE_OPTIONS.filter((option) => option.family === family),
})).filter((group) => group.options.length > 0)

const SHORTCUTS = [
  ['Run query', 'Ctrl Enter'],
  ['Explain query', 'Ctrl Shift E'],
  ['Command palette', 'Ctrl K'],
  ['Toggle panel', 'Ctrl J'],
  ['Toggle sidebar', 'Ctrl B'],
] as const

export function RightDrawer({
  view,
  width,
  health,
  theme,
  activeConnection,
  activeEnvironment,
  environments,
  connectionTest,
  diagnostics,
  explorerInspection,
  exportBundle,
  capabilities,
  exportPassphrase,
  importPayload,
  onExportPassphraseChange,
  onImportPayloadChange,
  onClose,
  onSaveConnection,
  onTestConnection,
  onRefreshDiagnostics,
  onExportWorkspace,
  onImportWorkspace,
  onApplyTemplate,
  onListOperations,
  onPlanOperation,
  onExecuteOperation,
  onToggleTheme,
  onPickLocalDatabaseFile,
  onCreateLocalDatabase,
  onResize,
}: RightDrawerProps) {
  const [isResizing, setIsResizing] = useState(false)
  const lastPointerX = useRef(0)

  return (
    <aside className="workbench-drawer" aria-label={`${view} drawer`}>
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize right drawer"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={560}
        aria-valuenow={width}
        className={`pane-resize-handle pane-resize-handle--drawer${isResizing ? ' is-active' : ''}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          lastPointerX.current = event.clientX
          setIsResizing(true)
        }}
        onPointerMove={(event) => {
          if (!isResizing) {
            return
          }

          const delta = lastPointerX.current - event.clientX
          lastPointerX.current = event.clientX
          onResize(width + delta)
        }}
        onPointerUp={() => setIsResizing(false)}
        onPointerCancel={() => setIsResizing(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            onResize(width + 16)
          }

          if (event.key === 'ArrowRight') {
            event.preventDefault()
            onResize(width - 16)
          }
        }}
      />

      {view === 'connection' ? (
        activeConnection ? (
          <ConnectionBlade
            activeConnection={activeConnection}
            environments={environments}
            connectionTest={connectionTest}
            onClose={onClose}
            onSaveConnection={onSaveConnection}
            onTestConnection={onTestConnection}
            onPickLocalDatabaseFile={onPickLocalDatabaseFile}
            onCreateLocalDatabase={onCreateLocalDatabase}
          />
        ) : (
          <DrawerPlaceholder
            copy="Create a connection first to edit profile details."
            icon={ConnectionsIcon}
            title="No Connection"
            onClose={onClose}
          />
        )
      ) : null}

      {view === 'inspection' ? (
        <InspectionBlade
          capabilities={capabilities}
          inspection={explorerInspection}
          onApplyTemplate={onApplyTemplate}
          onClose={onClose}
        />
      ) : null}

      {view === 'diagnostics' ? (
        <DiagnosticsBlade
          diagnostics={diagnostics}
          exportBundle={exportBundle}
          exportPassphrase={exportPassphrase}
          health={health}
          importPayload={importPayload}
          theme={theme}
          onClose={onClose}
          onExportPassphraseChange={onExportPassphraseChange}
          onExportWorkspace={onExportWorkspace}
          onImportPayloadChange={onImportPayloadChange}
          onImportWorkspace={onImportWorkspace}
          onRefreshDiagnostics={onRefreshDiagnostics}
          onToggleTheme={onToggleTheme}
        />
      ) : null}

      {view === 'operations' ? (
        activeConnection && activeEnvironment ? (
          <OperationsBlade
            activeConnection={activeConnection}
            activeEnvironment={activeEnvironment}
            onApplyTemplate={onApplyTemplate}
            onClose={onClose}
            onExecuteOperation={onExecuteOperation}
            onListOperations={onListOperations}
            onPlanOperation={onPlanOperation}
          />
        ) : (
          <DrawerPlaceholder
            copy="Select a connection and environment before opening operation actions."
            icon={SettingsIcon}
            title="No Operation Context"
            onClose={onClose}
          />
        )
      ) : null}
    </aside>
  )
}

function DrawerPlaceholder({
  copy,
  icon,
  title,
  onClose,
}: {
  copy: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  onClose(): void
}) {
  return (
    <>
      <DrawerHeader title={title} subtitle="Workspace" icon={icon} onClose={onClose} />
      <div className="drawer-scroll">
        <div className="drawer-section">
          <p className="drawer-copy">{copy}</p>
        </div>
      </div>
    </>
  )
}

function ConnectionBlade({
  activeConnection,
  environments,
  connectionTest,
  onClose,
  onSaveConnection,
  onTestConnection,
  onPickLocalDatabaseFile,
  onCreateLocalDatabase,
}: {
  activeConnection: ConnectionProfile
  environments: EnvironmentProfile[]
  connectionTest?: ConnectionTestResult
  onClose(): void
  onSaveConnection(profile: ConnectionProfile, secret?: string): void
  onTestConnection(profile: ConnectionProfile, environmentId: string): void
  onPickLocalDatabaseFile(request: LocalDatabasePickRequest): Promise<LocalDatabasePickResult>
  onCreateLocalDatabase(
    request: LocalDatabaseCreateRequest,
  ): Promise<LocalDatabaseCreateResult | undefined>
}) {
  const [nameOverridden, setNameOverridden] = useState(() =>
    isCustomConnectionName(activeConnection),
  )
  const [connectionDraft, setConnectionDraft] = useState(() =>
    isCustomConnectionName(activeConnection)
      ? activeConnection
      : {
          ...activeConnection,
          name: inferConnectionName(activeConnection),
        },
  )
  const [secretDraft, setSecretDraft] = useState('')
  const [pendingCreatePath, setPendingCreatePath] = useState('')
  const [localDatabaseStatus, setLocalDatabaseStatus] = useState('')

  const selectedEngineOption = engineOption(connectionDraft.engine)
  const isLocalDatabaseEngine = Boolean(
    selectedEngineOption?.localDatabase && selectedEngineOption.maturity === 'mvp',
  )
  const databaseLabel = connectionDraft.engine === 'sqlite' ? 'Database file' : 'Database'
  const selectedEnvironmentId = connectionDraft.environmentIds[0] ?? ''
  const selectedEnvironment = environments.find(
    (environment) => environment.id === selectedEnvironmentId,
  )
  const environmentAccentStyle = environmentAccentVariables(selectedEnvironment)
  const displayedResolvedHost = connectionTest
    ? redactEnvironmentSecrets(connectionTest.resolvedHost, selectedEnvironmentId, environments)
    : ''
  const displayedResolvedDatabase = connectionTest?.resolvedDatabase
    ? redactEnvironmentSecrets(
        connectionTest.resolvedDatabase,
        selectedEnvironmentId,
        environments,
      )
    : undefined

  const updateConnectionDraft = (
    patch: Partial<ConnectionProfile>,
    options: { preserveName?: boolean } = {},
  ) => {
    setConnectionDraft((current) => {
      const next = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      }

      return options.preserveName || nameOverridden
        ? next
        : {
            ...next,
            name: inferConnectionName(next),
          }
    })
  }

  const setLocalDatabasePath = (path: string) => {
    updateConnectionDraft({
      host: path,
      database: path,
      port: undefined,
    })
  }

  const connectionForAction = () => ({
    ...connectionDraft,
    name: connectionDraft.name.trim() || inferConnectionName(connectionDraft),
  })

  const openExistingLocalDatabase = async () => {
    const result = await onPickLocalDatabaseFile({
      engine: connectionDraft.engine,
      purpose: 'open',
      currentPath: connectionDraft.database,
    })

    if (result.canceled || !result.path) {
      return
    }

    setLocalDatabasePath(result.path)
    setLocalDatabaseStatus('SQLite database path selected.')
  }

  const chooseNewLocalDatabasePath = async () => {
    const result = await onPickLocalDatabaseFile({
      engine: connectionDraft.engine,
      purpose: 'create',
      currentPath: connectionDraft.database,
    })

    if (result.canceled || !result.path) {
      return
    }

    setPendingCreatePath(result.path)
    setLocalDatabaseStatus('')
  }

  const createLocalDatabase = async (mode: LocalDatabaseCreateRequest['mode']) => {
    if (!pendingCreatePath) {
      return
    }

    const result = await onCreateLocalDatabase({
      engine: connectionDraft.engine,
      path: pendingCreatePath,
      mode,
      connectionId: connectionDraft.id,
      environmentId: selectedEnvironmentId || undefined,
    })

    if (!result) {
      return
    }

    const nextConnection = {
      ...connectionDraft,
      host: result.path,
      database: result.path,
    }
    const updatedConnection = {
      ...connectionDraft,
      host: result.path,
      database: result.path,
      name: nameOverridden ? connectionDraft.name : inferConnectionName(nextConnection),
      port: undefined,
      updatedAt: new Date().toISOString(),
    }

    setConnectionDraft(updatedConnection)
    setPendingCreatePath('')
    setLocalDatabaseStatus(
      result.warnings.length > 0
        ? `${result.message} ${result.warnings.join(' ')}`
        : result.message,
    )
    onSaveConnection(updatedConnection, secretDraft)
    onTestConnection(updatedConnection, selectedEnvironmentId)
  }

  return (
    <>
      <DrawerHeader
        title="Connection"
        subtitle="Profile"
        icon={ConnectionsIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div
          className={`drawer-section connection-profile-section${selectedEnvironment ? ' has-environment-accent' : ''}`}
          style={environmentAccentStyle}
        >
          <div className="drawer-section-header">
            <strong>Connection</strong>
            <span>{connectionDraft.engine}</span>
          </div>

          <div className="drawer-form">
            <FormField label="Database type">
              <select
                value={connectionDraft.engine}
                onChange={(event) => {
                  const engine = event.target.value as ConnectionProfile['engine']
                  const nextEngineOption = engineOption(engine)
                  updateConnectionDraft({
                    engine,
                    family: engineFamily(engine),
                    connectionMode:
                      connectionDraft.engine === engine
                        ? connectionDraft.connectionMode
                        : nextEngineOption?.connectionMode,
                    host:
                      engine === 'sqlite'
                        ? connectionDraft.database ?? connectionDraft.host
                        : connectionDraft.host || 'localhost',
                    port:
                      engine === 'sqlite'
                        ? undefined
                        : connectionDraft.engine === engine
                          ? connectionDraft.port
                          : defaultPortForEngine(engine),
                    auth:
                      engine === 'sqlite'
                        ? {
                            ...connectionDraft.auth,
                            username: undefined,
                            sslMode: undefined,
                          }
                        : connectionDraft.auth,
                  })
                }}
              >
                {ENGINE_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={option.maturity === 'planned'}
                      >
                        {option.maturity === 'planned'
                          ? `${option.label} (planned)`
                          : option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FormField>

            {isLocalDatabaseEngine ? (
              <div className="connection-quick-actions" aria-label="Connection quick actions">
                <div className="drawer-button-row drawer-button-row--compact">
                  <button
                    type="button"
                    className="drawer-button"
                    title="Choose an existing local database file and place its path in this connection."
                    onClick={() => void openExistingLocalDatabase()}
                  >
                    Open Existing
                  </button>
                  <button
                    type="button"
                    className="drawer-button drawer-button--primary"
                    title="Choose a path for a new SQLite database, then select empty or starter schema."
                    onClick={() => void chooseNewLocalDatabasePath()}
                  >
                    Create New
                  </button>
                </div>
              </div>
            ) : null}

            {pendingCreatePath ? (
              <div className="drawer-callout" role="dialog" aria-label="Create SQLite database">
                <strong>Create SQLite database</strong>
                <span>{pendingCreatePath}</span>
                <div className="drawer-button-row drawer-button-row--compact">
                  <button
                    type="button"
                    className="drawer-button"
                    title="Create a blank SQLite database file at the selected path."
                    onClick={() => void createLocalDatabase('empty')}
                  >
                    Empty database
                  </button>
                  <button
                    type="button"
                    className="drawer-button drawer-button--primary"
                    title="Create a SQLite database with a small starter items table for local prototyping."
                    onClick={() => void createLocalDatabase('starter')}
                  >
                    Starter schema
                  </button>
                </div>
              </div>
            ) : null}

            {localDatabaseStatus ? (
              <div className="drawer-callout is-success">
                <strong>Local database</strong>
                <span>{localDatabaseStatus}</span>
              </div>
            ) : null}

            {!isLocalDatabaseEngine ? (
              <FormField label="Server">
                <input
                  value={connectionDraft.host}
                  onChange={(event) => updateConnectionDraft({ host: event.target.value })}
                />
              </FormField>
            ) : null}

            {!isLocalDatabaseEngine ? (
              <FormField label="Port">
                <input
                  value={connectionDraft.port ?? ''}
                  onChange={(event) =>
                    updateConnectionDraft({
                      port: Number(event.target.value) || undefined,
                    })
                  }
                />
              </FormField>
            ) : null}

            <FormField label={databaseLabel}>
              <input
                aria-label={databaseLabel}
                value={connectionDraft.database ?? ''}
                onChange={(event) =>
                  updateConnectionDraft({
                    database: event.target.value,
                    host: isLocalDatabaseEngine ? event.target.value : connectionDraft.host,
                  })
                }
              />
            </FormField>

            {!isLocalDatabaseEngine ? (
              <>
                <FormField label="User name">
                  <input
                    value={connectionDraft.auth.username ?? ''}
                    onChange={(event) =>
                      updateConnectionDraft({
                        auth: {
                          ...connectionDraft.auth,
                          username: event.target.value,
                        },
                      })
                    }
                  />
                </FormField>

                <FormField label="Password / Secret">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={secretDraft}
                    placeholder={
                      connectionDraft.auth.secretRef
                        ? 'Stored in OS keyring'
                        : 'Optional password'
                    }
                    onChange={(event) => setSecretDraft(event.target.value)}
                  />
                </FormField>

                <FormField label="SSL mode">
                  <input
                    value={connectionDraft.auth.sslMode ?? ''}
                    onChange={(event) =>
                      updateConnectionDraft({
                        auth: {
                          ...connectionDraft.auth,
                          sslMode:
                            (event.target.value || undefined) as ConnectionProfile['auth']['sslMode'],
                        },
                      })
                    }
                  />
                </FormField>
              </>
            ) : null}

            <FormField label="Name">
              <input
                value={connectionDraft.name}
                placeholder={inferConnectionName(connectionDraft)}
                onChange={(event) => {
                  setNameOverridden(event.target.value.trim().length > 0)
                  updateConnectionDraft(
                    { name: event.target.value },
                    { preserveName: true },
                  )
                }}
              />
            </FormField>

            <FormField label="Environment">
              <select
                value={selectedEnvironmentId}
                onChange={(event) =>
                  updateConnectionDraft({
                    environmentIds: event.target.value ? [event.target.value] : [],
                  })
                }
              >
                <option value="">None</option>
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.label}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="connection-flags-section">
              <div className="connection-flags-title">
                <span>Connection options</span>
              </div>
              <div className="drawer-toggle-row">
                <button
                  type="button"
                  className={`drawer-toggle${connectionDraft.favorite ? ' is-active' : ''}`}
                  onClick={() =>
                    updateConnectionDraft({ favorite: !connectionDraft.favorite })
                  }
                >
                  <FavoriteIcon className="drawer-inline-icon" />
                  Favorite
                </button>
                <button
                  type="button"
                  className={`drawer-toggle${connectionDraft.readOnly ? ' is-active' : ''}`}
                  onClick={() =>
                    updateConnectionDraft({ readOnly: !connectionDraft.readOnly })
                  }
                >
                  <ReadOnlyIcon className="drawer-inline-icon" />
                  Read-only
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`drawer-footer drawer-footer--stacked${selectedEnvironment ? ' has-environment-accent' : ''}`}
        style={environmentAccentStyle}
      >
        {connectionTest ? (
          <div className={`drawer-callout${connectionTest.ok ? ' is-success' : ' is-error'}`}>
            <strong>{connectionTest.ok ? 'Connection ready' : 'Connection issue'}</strong>
            <span>{connectionTest.message}</span>
            <span>
              {displayedResolvedHost}
              {displayedResolvedDatabase ? ` / ${displayedResolvedDatabase}` : ''}
            </span>
          </div>
        ) : null}

        <div className="drawer-footer-actions">
          <button
            type="button"
            className="drawer-button"
            title="Test this connection using the selected environment and stored secret reference."
            onClick={() => onTestConnection(connectionForAction(), selectedEnvironmentId)}
          >
            Test Connection
          </button>
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            title="Save this connection profile locally and close the drawer."
            onClick={() => onSaveConnection(connectionForAction(), secretDraft)}
          >
            Save Connection
          </button>
        </div>
      </div>
    </>
  )
}

function OperationsBlade({
  activeConnection,
  activeEnvironment,
  onApplyTemplate,
  onClose,
  onExecuteOperation,
  onListOperations,
  onPlanOperation,
}: {
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  onApplyTemplate(queryTemplate?: string): void
  onClose(): void
  onListOperations(
    request: OperationManifestRequest,
  ): Promise<OperationManifestResponse | undefined>
  onPlanOperation(
    request: OperationPlanRequest,
  ): Promise<OperationPlanResponse | undefined>
  onExecuteOperation(
    request: OperationExecutionRequest,
  ): Promise<OperationExecutionResponse | undefined>
}) {
  const [filter, setFilter] = useState('')
  const [operations, setOperations] = useState<DatastoreOperationManifest[]>([])
  const [selectedOperation, setSelectedOperation] =
    useState<DatastoreOperationManifest>()
  const [objectName, setObjectName] = useState('')
  const [confirmationText, setConfirmationText] = useState('')
  const [planResponse, setPlanResponse] = useState<OperationPlanResponse>()
  const [executionResponse, setExecutionResponse] =
    useState<OperationExecutionResponse>()
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    let mounted = true
    void Promise.resolve()
      .then(async () => {
        if (!mounted) {
          return
        }

        startTransition(() => {
          setStatus('loading')
          setLocalError('')
        })
        const response = await onListOperations({
          connectionId: activeConnection.id,
          environmentId: activeEnvironment.id,
        })

        if (!mounted) {
          return
        }

        const nextOperations = response?.operations ?? []
        startTransition(() => {
          setOperations(nextOperations)
          setSelectedOperation(nextOperations[0])
          setStatus('ready')
        })
      })
      .catch(() => {
        if (mounted) {
          startTransition(() => {
            setLocalError('Unable to load datastore operations.')
            setStatus('ready')
          })
        }
      })

    return () => {
      mounted = false
    }
  }, [activeConnection.id, activeEnvironment.id, onListOperations])

  const selectedOperationId = selectedOperation?.id

  useEffect(() => {
    let mounted = true
    void Promise.resolve()
      .then(async () => {
        if (!mounted) {
          return
        }

        if (!selectedOperationId) {
          startTransition(() => setPlanResponse(undefined))
          return
        }

        startTransition(() => {
          setLocalError('')
          setConfirmationText('')
          setExecutionResponse(undefined)
        })
        const response = await onPlanOperation({
          connectionId: activeConnection.id,
          environmentId: activeEnvironment.id,
          operationId: selectedOperationId,
          objectName: objectName || undefined,
        })

        if (mounted) {
          startTransition(() => setPlanResponse(response))
        }
      })
      .catch(() => {
        if (mounted) {
          startTransition(() =>
            setLocalError('Unable to plan datastore operation.'),
          )
        }
      })

    return () => {
      mounted = false
    }
  }, [
    activeConnection.id,
    activeEnvironment.id,
    objectName,
    onPlanOperation,
    selectedOperationId,
  ])

  const filteredOperations = operations.filter((operation) =>
    `${operation.label} ${operation.scope} ${operation.risk} ${operation.description}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  )
  const confirmationExpected = planResponse?.plan.confirmationText
  const needsConfirmation = Boolean(
    selectedOperation?.requiresConfirmation || confirmationExpected,
  )
  const confirmationMatches =
    !confirmationExpected || confirmationText === confirmationExpected
  const executionDisabled =
    !selectedOperation ||
    selectedOperation.executionSupport !== 'live' ||
    (needsConfirmation && !confirmationMatches)

  const executeSelectedOperation = async () => {
    if (!selectedOperation) {
      return
    }

    setLocalError('')
    const response = await onExecuteOperation({
      connectionId: activeConnection.id,
      environmentId: activeEnvironment.id,
      operationId: selectedOperation.id,
      objectName: objectName || undefined,
      confirmationText: confirmationText || undefined,
      rowLimit: 500,
    })

    if (!response) {
      setLocalError('Operation did not return a response.')
      return
    }

    setExecutionResponse(response)
  }

  return (
    <>
      <DrawerHeader
        title="Operations"
        subtitle={activeConnection.name}
        icon={SettingsIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Catalog</strong>
            <span>{status === 'loading' ? 'loading' : `${operations.length}`}</span>
          </div>
          <input
            className="drawer-input"
            value={filter}
            placeholder="Filter operations"
            aria-label="Filter datastore operations"
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="operation-list" role="listbox" aria-label="Datastore operations">
            {filteredOperations.map((operation) => (
              <button
                key={operation.id}
                type="button"
                className={`operation-list-item ${
                  selectedOperation?.id === operation.id
                    ? 'operation-list-item--active'
                    : ''
                }`}
                onClick={() => setSelectedOperation(operation)}
              >
                <span>
                  <strong>{operation.label}</strong>
                  <small>{operation.scope}</small>
                </span>
                <span className={`operation-risk operation-risk--${operation.risk}`}>
                  {operation.risk}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Plan</strong>
            <span>{selectedOperation?.executionSupport ?? 'unsupported'}</span>
          </div>
          {selectedOperation ? (
            <>
              <p className="drawer-copy">{selectedOperation.description}</p>
              {selectedOperation.disabledReason ? (
                <p className="drawer-copy">{selectedOperation.disabledReason}</p>
              ) : null}
              <label className="drawer-field">
                <span>Object or scope</span>
                <input
                  value={objectName}
                  placeholder="Optional target object"
                  onChange={(event) => setObjectName(event.target.value)}
                />
              </label>
              {planResponse?.plan.generatedRequest ? (
                <pre className="drawer-code">
                  <code>{planResponse.plan.generatedRequest}</code>
                </pre>
              ) : null}
              {planResponse?.plan.warnings.length ? (
                <ul className="messages-list">
                  {planResponse.plan.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="drawer-copy">No operation selected.</p>
          )}
        </div>

        {needsConfirmation ? (
          <div className="drawer-section">
            <div className="drawer-section-header">
              <strong>Confirmation</strong>
              <span>required</span>
            </div>
            <label className="drawer-field">
              <span>Type {confirmationExpected ?? 'the confirmation text'}</span>
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {executionResponse || localError ? (
          <div className="drawer-section">
            <div className="drawer-section-header">
              <strong>Result</strong>
              <span>{executionResponse?.executed ? 'executed' : 'planned'}</span>
            </div>
            {localError ? <p className="drawer-copy">{localError}</p> : null}
            {executionResponse?.messages.length ? (
              <ul className="messages-list">
                {executionResponse.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            {executionResponse?.warnings.length ? (
              <ul className="messages-list">
                {executionResponse.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {executionResponse?.result ? (
              <pre className="drawer-code">
                <code>{executionResponse.result.summary}</code>
              </pre>
            ) : null}
            {executionResponse?.metadata ? (
              <pre className="drawer-code">
                <code>{JSON.stringify(executionResponse.metadata, null, 2)}</code>
              </pre>
            ) : null}
            {executionResponse?.permissionInspection ? (
              <pre className="drawer-code">
                <code>
                  {JSON.stringify(executionResponse.permissionInspection, null, 2)}
                </code>
              </pre>
            ) : null}
            {executionResponse?.diagnostics ? (
              <pre className="drawer-code">
                <code>{JSON.stringify(executionResponse.diagnostics, null, 2)}</code>
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="drawer-footer">
        <button
          type="button"
          className="drawer-button"
          disabled={!planResponse?.plan.generatedRequest}
          onClick={() => onApplyTemplate(planResponse?.plan.generatedRequest)}
        >
          Open in Editor
        </button>
        <button
          type="button"
          className="drawer-button drawer-button--primary"
          disabled={executionDisabled}
          title={
            selectedOperation?.executionSupport === 'live'
              ? 'Execute this live operation.'
              : 'This operation is plan-only for this adapter.'
          }
          onClick={() => void executeSelectedOperation()}
        >
          Execute
        </button>
      </div>
    </>
  )
}

function InspectionBlade({
  capabilities,
  inspection,
  onApplyTemplate,
  onClose,
}: {
  capabilities: ExecutionCapabilities
  inspection?: ExplorerInspectResponse
  onApplyTemplate(queryTemplate?: string): void
  onClose(): void
}) {
  return (
    <>
      <DrawerHeader
        title="Inspection"
        subtitle="Object"
        icon={ExplorerIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Inspection</strong>
            <button
              type="button"
              className="drawer-link-button"
              disabled={!inspection?.queryTemplate}
              onClick={() => onApplyTemplate(inspection?.queryTemplate)}
            >
              Apply template
            </button>
          </div>

          <p className="drawer-copy">
            {inspection?.summary ?? 'No object selected.'}
          </p>

          {inspection?.queryTemplate ? (
            <pre className="drawer-code">
              <code>{inspection.queryTemplate}</code>
            </pre>
          ) : null}

          {inspection?.payload ? (
            <pre className="drawer-code">
              <code>{JSON.stringify(inspection.payload, null, 2)}</code>
            </pre>
          ) : null}
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Capabilities</strong>
            <span>adapter</span>
          </div>
          <div className="drawer-pill-row">
            <span className="drawer-pill">Metadata {capabilities.supportsLiveMetadata ? 'yes' : 'no'}</span>
            <span className="drawer-pill">Cancel {capabilities.canCancel ? 'yes' : 'no'}</span>
            <span className="drawer-pill">Explain {capabilities.canExplain ? 'yes' : 'no'}</span>
          </div>
        </div>
      </div>
    </>
  )
}

function DiagnosticsBlade({
  diagnostics,
  exportBundle,
  exportPassphrase,
  health,
  importPayload,
  theme,
  onClose,
  onExportPassphraseChange,
  onExportWorkspace,
  onImportPayloadChange,
  onImportWorkspace,
  onRefreshDiagnostics,
  onToggleTheme,
}: {
  diagnostics?: DiagnosticsReport
  exportBundle?: ExportBundle
  exportPassphrase: string
  health: AppHealth
  importPayload: string
  theme: WorkspaceSnapshot['preferences']['theme']
  onClose(): void
  onExportPassphraseChange(value: string): void
  onExportWorkspace(): void
  onImportPayloadChange(value: string): void
  onImportWorkspace(): void
  onRefreshDiagnostics(): void
  onToggleTheme(): void
}) {
  return (
    <>
      <DrawerHeader
        title="Diagnostics"
        subtitle="Settings"
        icon={SettingsIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Workbench</strong>
            <button type="button" className="drawer-link-button" onClick={onToggleTheme}>
              <ThemeIcon className="drawer-inline-icon" />
              Theme
            </button>
          </div>
          <div className="details-grid details-grid--drawer">
            <DrawerDetailRow label="Theme" value={theme} />
            <DrawerDetailRow label="Runtime" value={health.runtime} />
            <DrawerDetailRow label="Adapters" value={health.adapterHost} />
            <DrawerDetailRow label="Secrets" value={health.secretStorage} />
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Diagnostics</strong>
            <button type="button" className="drawer-link-button" onClick={onRefreshDiagnostics}>
              <RefreshIcon className="drawer-inline-icon" />
              Refresh
            </button>
          </div>
          <div className="details-grid details-grid--drawer">
            <DrawerDetailRow label="Platform" value={diagnostics?.platform ?? health.platform} />
            <DrawerDetailRow label="App Version" value={diagnostics?.appVersion ?? 'Unknown'} />
            <DrawerDetailRow label="Connections" value={String(diagnostics?.counts.connections ?? 0)} />
            <DrawerDetailRow label="Saved Work" value={String(diagnostics?.counts.savedWork ?? 0)} />
          </div>
          <ul className="messages-list">
            {(diagnostics?.warnings.length ? diagnostics.warnings : ['No active warnings.']).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Shortcuts</strong>
            <span>keyboard</span>
          </div>
          <div className="drawer-shortcut-list">
            {SHORTCUTS.map(([label, shortcut]) => (
              <div key={label} className="drawer-shortcut-row">
                <span>{label}</span>
                <kbd>{shortcut}</kbd>
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Bundle</strong>
            <span>{health.telemetry}</span>
          </div>

          <FormField label="Passphrase">
            <input
              value={exportPassphrase}
              onChange={(event) => onExportPassphraseChange(event.target.value)}
            />
          </FormField>

          <div className="drawer-button-row">
            <button type="button" className="drawer-button drawer-button--primary" onClick={onExportWorkspace}>
              Export
            </button>
            <button type="button" className="drawer-button" onClick={onImportWorkspace}>
              Import
            </button>
          </div>

          {exportBundle ? (
            <pre className="drawer-code">
              <code>{exportBundle.encryptedPayload}</code>
            </pre>
          ) : null}

          <FormField label="Encrypted payload">
            <textarea
              rows={8}
              value={importPayload}
              onChange={(event) => onImportPayloadChange(event.target.value)}
              placeholder="Encrypted workspace bundle"
            />
          </FormField>
        </div>
      </div>
    </>
  )
}

function DrawerHeader({
  title,
  subtitle,
  icon: Icon,
  onClose,
}: {
  title: string
  subtitle: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  onClose(): void
}) {
  return (
    <div className="drawer-header">
      <div className="drawer-title-row">
        <span className="drawer-title-icon">
          <Icon className="drawer-inline-icon" />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        className="drawer-close"
        aria-label="Close drawer"
        title="Close this drawer and return to the workbench."
        onClick={onClose}
      >
        <CloseIcon className="drawer-inline-icon" />
      </button>
    </div>
  )
}

function FormField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <label className="drawer-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function DrawerDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function engineFamily(engine: ConnectionProfile['engine']): ConnectionProfile['family'] {
  return engineOption(engine)?.family ?? 'sql'
}

function engineLabel(engine: ConnectionProfile['engine']) {
  return engineOption(engine)?.label ?? engine
}

function engineOption(engine: ConnectionProfile['engine']) {
  return ENGINE_OPTIONS.find((option) => option.value === engine)
}

function isCustomConnectionName(profile: ConnectionProfile) {
  const name = profile.name.trim()

  if (!name) {
    return false
  }

  return ![
    `New ${engineLabel(profile.engine)} connection`,
    `${engineLabel(profile.engine)} connection`,
    inferConnectionName(profile),
  ].includes(name)
}

function inferConnectionName(profile: ConnectionProfile) {
  const database = profile.database?.trim() ?? ''
  const host = profile.host.trim()

  if (profile.engine === 'sqlite') {
    return fileStem(database || host) || 'SQLite connection'
  }

  if (database && !database.includes('${')) {
    return database
  }

  if (host && host !== 'localhost' && !host.includes('${')) {
    return `${engineLabel(profile.engine)} ${host}`
  }

  return `${engineLabel(profile.engine)} connection`
}

function fileStem(path: string) {
  const fileName = path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
  return fileName.replace(/\.[^.]+$/, '')
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
    '--connection-env-tint': hexToRgba(color, 0.1),
    '--connection-env-border': hexToRgba(color, 0.45),
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

function defaultPortForEngine(engine: ConnectionProfile['engine']) {
  return engineOption(engine)?.defaultPort
}

function redactEnvironmentSecrets(
  value: string,
  environmentId: string,
  environments: EnvironmentProfile[],
) {
  if (!environmentId) {
    return value
  }

  const environmentMap = new Map(
    environments.map((environment) => [environment.id, environment]),
  )
  const variables: Record<string, string> = {}
  const sensitiveKeys = new Set<string>()
  const resolvedChain: EnvironmentProfile[] = []
  const visited = new Set<string>()
  let current = environmentMap.get(environmentId)

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    resolvedChain.unshift(current)
    current = current.inheritsFrom ? environmentMap.get(current.inheritsFrom) : undefined
  }

  for (const environment of resolvedChain) {
    Object.assign(variables, environment.variables)

    for (const key of environment.sensitiveKeys) {
      sensitiveKeys.add(key)
    }
  }

  return [...sensitiveKeys].reduce((redacted, key) => {
    const secretValue = variables[key]

    if (!secretValue) {
      return redacted
    }

    return redacted.split(secretValue).join('********')
  }, value)
}
