/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react'
import type { ReactNode } from 'react'
import type {
  BootstrapPayload,
  ConnectionProfile,
  ConnectionTestResult,
  DiagnosticsReport,
  EnvironmentProfile,
  ExecutionRequest,
  ExecutionResponse,
  ExportBundle,
  ExplorerInspectResponse,
  ExplorerRequest,
  ExplorerResponse,
  LocalDatabaseCreateRequest,
  LocalDatabaseCreateResult,
  LocalDatabasePickRequest,
  LocalDatabasePickResult,
  ResultPageRequest,
  ResultPageResponse,
  ResultPayload,
  SavedWorkItem,
  SecretRef,
  StructureRequest,
  StructureResponse,
  UpdateUiStateRequest,
  WorkspaceSnapshot,
} from '@universality/shared-types'
import { datastoreBacklogByEngine } from '@universality/shared-types'
import { desktopClient } from '../../services/runtime/client'
import { createId } from './helpers'

type LoadStatus = 'booting' | 'ready' | 'error'
type RemoteStatus = 'idle' | 'loading' | 'ready'

interface StateShape {
  status: LoadStatus
  payload?: BootstrapPayload
  diagnostics?: DiagnosticsReport
  exportBundle?: ExportBundle
  explorerStatus: RemoteStatus
  explorer?: ExplorerResponse
  explorerError?: string
  explorerInspection?: ExplorerInspectResponse
  structureStatus: RemoteStatus
  structure?: StructureResponse
  structureError?: string
  executionStatus: RemoteStatus
  lastExecution?: ExecutionResponse
  lastExecutionRequest?: ExecutionRequest
  connectionTests: Record<string, ConnectionTestResult>
  errorMessage?: string
}

type Action =
  | { type: 'BOOTSTRAP_SUCCESS'; payload: BootstrapPayload }
  | { type: 'COMMAND_SUCCESS'; payload: BootstrapPayload }
  | { type: 'DIAGNOSTICS_READY'; diagnostics: DiagnosticsReport }
  | { type: 'EXPORT_READY'; exportBundle: ExportBundle }
  | { type: 'CONNECTION_TEST_READY'; profileId: string; result: ConnectionTestResult }
  | { type: 'EXPLORER_LOADING' }
  | { type: 'EXPLORER_READY'; explorer: ExplorerResponse }
  | { type: 'EXPLORER_ERROR'; message: string }
  | { type: 'EXPLORER_INSPECTION_READY'; inspection: ExplorerInspectResponse }
  | { type: 'STRUCTURE_LOADING' }
  | { type: 'STRUCTURE_READY'; structure: StructureResponse }
  | { type: 'STRUCTURE_ERROR'; message: string }
  | { type: 'EXECUTION_LOADING' }
  | { type: 'EXECUTION_READY'; execution: ExecutionResponse; request: ExecutionRequest }
  | { type: 'RESULT_PAGE_READY'; page: ResultPageResponse }
  | { type: 'BOOTSTRAP_ERROR'; message: string }
  | { type: 'COMMAND_ERROR'; message: string }

const initialState: StateShape = {
  status: 'booting',
  explorerStatus: 'idle',
  structureStatus: 'idle',
  executionStatus: 'idle',
  connectionTests: {},
}

function clonePayload(payload: BootstrapPayload): BootstrapPayload {
  return JSON.parse(JSON.stringify(payload)) as BootstrapPayload
}

function applyExecutionToPayload(
  payload: BootstrapPayload | undefined,
  execution: ExecutionResponse,
): BootstrapPayload | undefined {
  if (!payload) {
    return payload
  }

  const next = clonePayload(payload)
  const index = next.snapshot.tabs.findIndex((item) => item.id === execution.tab.id)

  if (index >= 0) {
    next.snapshot.tabs[index] = execution.tab
  } else {
    next.snapshot.tabs.push(execution.tab)
  }

  next.snapshot.guardrails = [execution.guardrail]
  next.snapshot.ui.activeTabId = execution.tab.id
  next.snapshot.ui.activeConnectionId = execution.tab.connectionId
  next.snapshot.ui.activeEnvironmentId = execution.tab.environmentId
  next.snapshot.ui.bottomPanelVisible = true
  next.snapshot.ui.activeBottomPanelTab = execution.result ? 'results' : 'messages'
  next.snapshot.updatedAt = new Date().toISOString()
  return next
}

function applyResultPageToPayload(
  payload: BootstrapPayload | undefined,
  page: ResultPageResponse,
): BootstrapPayload | undefined {
  if (!payload) {
    return payload
  }

  const next = clonePayload(payload)
  const tab = next.snapshot.tabs.find((item) => item.id === page.tabId)

  if (!tab?.result) {
    return next
  }

  const payloadIndex = tab.result.payloads.findIndex(
    (item) => item.renderer === page.payload.renderer,
  )

  let mergedPayload = page.payload

  if (payloadIndex < 0) {
    tab.result.payloads.push(page.payload)
  } else {
    const currentPayload = tab.result.payloads[payloadIndex]

    if (currentPayload) {
      mergedPayload = mergeResultPayload(currentPayload, page.payload)
      tab.result.payloads[payloadIndex] = mergedPayload
    }
  }

  tab.result.pageInfo = {
    ...page.pageInfo,
    bufferedRows: resultPayloadSize(mergedPayload),
  }
  tab.result.truncated = page.pageInfo.hasMore
  tab.result.continuationToken = page.pageInfo.nextCursor
  tab.result.notices = [
    ...tab.result.notices,
    ...page.notices.map((message) => ({
      code: 'result-page',
      level: 'info' as const,
      message,
    })),
  ]
  next.snapshot.ui.bottomPanelVisible = true
  next.snapshot.ui.activeBottomPanelTab = 'results'
  next.snapshot.updatedAt = new Date().toISOString()
  return next
}

function mergeExplorerResponse(
  current: ExplorerResponse | undefined,
  incoming: ExplorerResponse,
): ExplorerResponse {
  if (
    !current ||
    current.connectionId !== incoming.connectionId ||
    current.environmentId !== incoming.environmentId
  ) {
    return incoming
  }

  const mergedNodes = new Map(current.nodes.map((node) => [node.id, node]))

  for (const node of incoming.nodes) {
    mergedNodes.set(node.id, node)
  }

  return {
    ...incoming,
    summary: incoming.summary,
    nodes: Array.from(mergedNodes.values()),
  }
}

function mergeResultPayload(current: ResultPayload, incoming: ResultPayload): ResultPayload {
  if (current.renderer === 'table' && incoming.renderer === 'table') {
    return {
      ...current,
      columns: current.columns.length ? current.columns : incoming.columns,
      rows: [...current.rows, ...incoming.rows],
    }
  }

  if (current.renderer === 'document' && incoming.renderer === 'document') {
    return {
      ...current,
      documents: [...current.documents, ...incoming.documents],
    }
  }

  if (current.renderer === 'keyvalue' && incoming.renderer === 'keyvalue') {
    return {
      ...current,
      entries: {
        ...current.entries,
        ...incoming.entries,
      },
      ttl: incoming.ttl ?? current.ttl,
      memoryUsage: incoming.memoryUsage ?? current.memoryUsage,
    }
  }

  if (current.renderer === 'schema' && incoming.renderer === 'schema') {
    return {
      ...current,
      items: [...current.items, ...incoming.items],
    }
  }

  return incoming
}

function resultPayloadSize(payload: ResultPayload) {
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

function toUserMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message

    if (typeof message === 'string' && message.length > 0) {
      return message
    }
  }

  return fallback
}

function ensureWorkspaceUnlocked(payload: BootstrapPayload | undefined) {
  if (payload?.snapshot.lockState.isLocked) {
    throw new Error('Unlock the workspace before using privileged desktop commands.')
  }
}

function secretRefForConnection(profile: ConnectionProfile): SecretRef {
  return {
    id: `secret-${profile.id}`,
    provider: 'os-keyring',
    service: 'Universality',
    account: profile.id,
    label: `${profile.name} password`,
  }
}

function iconForEngine(engine: ConnectionProfile['engine']) {
  return engine
    .split('')
    .filter((character) => /[a-z0-9]/i.test(character))
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function familyForEngine(engine: ConnectionProfile['engine']): ConnectionProfile['family'] {
  return datastoreBacklogByEngine(engine)?.family ?? 'sql'
}

function defaultPortForEngine(engine: ConnectionProfile['engine']) {
  return datastoreBacklogByEngine(engine)?.defaultPort
}

function defaultConnectionModeForEngine(engine: ConnectionProfile['engine']) {
  return datastoreBacklogByEngine(engine)?.connectionModes[0]
}

function createConnectionProfile(
  environmentId: string,
  source?: ConnectionProfile,
): ConnectionProfile {
  const timestamp = new Date().toISOString()
  const id = createId('conn')
  const engine = source?.engine ?? 'postgresql'
  const family = source?.family ?? familyForEngine(engine)

  return {
    id,
    name: source ? `Copy of ${source.name}` : 'New PostgreSQL connection',
    engine,
    family,
    host: source?.host ?? 'localhost',
    port: source?.port ?? defaultPortForEngine(engine),
    database: source?.database ?? '',
    connectionString: source?.connectionString,
    connectionMode: source?.connectionMode ?? defaultConnectionModeForEngine(engine),
    environmentIds: source?.environmentIds?.length ? [...source.environmentIds] : [environmentId],
    tags: source ? [...source.tags] : [],
    favorite: false,
    readOnly: source?.readOnly ?? false,
    icon: source?.icon ?? iconForEngine(engine),
    color: source?.color,
    group: source?.group ?? 'Connections',
    notes: source?.notes,
    auth: {
      ...source?.auth,
      secretRef: source?.auth.secretRef,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function createEnvironmentProfile(source?: Partial<EnvironmentProfile>): EnvironmentProfile {
  const timestamp = new Date().toISOString()

  return {
    id: createId('env'),
    label: source?.label ?? 'Local',
    color: source?.color ?? '#2dbf9b',
    risk: source?.risk ?? 'low',
    inheritsFrom: source?.inheritsFrom,
    variables: source?.variables ?? {},
    sensitiveKeys: source?.sensitiveKeys ?? [],
    requiresConfirmation: source?.requiresConfirmation ?? false,
    safeMode: source?.safeMode ?? false,
    exportable: source?.exportable ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function reducer(state: StateShape, action: Action): StateShape {
  switch (action.type) {
    case 'BOOTSTRAP_SUCCESS':
      return {
        ...state,
        status: 'ready',
        payload: action.payload,
        diagnostics: action.payload.diagnostics,
        errorMessage: undefined,
      }
    case 'COMMAND_SUCCESS':
      return {
        ...state,
        status: 'ready',
        payload: action.payload,
        diagnostics: action.payload.diagnostics,
        errorMessage: undefined,
      }
    case 'DIAGNOSTICS_READY':
      return {
        ...state,
        diagnostics: action.diagnostics,
        errorMessage: undefined,
      }
    case 'EXPORT_READY':
      return {
        ...state,
        exportBundle: action.exportBundle,
        errorMessage: undefined,
      }
    case 'CONNECTION_TEST_READY':
      return {
        ...state,
        connectionTests: {
          ...state.connectionTests,
          [action.profileId]: action.result,
        },
        errorMessage: undefined,
      }
    case 'EXPLORER_LOADING':
      return {
        ...state,
        explorerStatus: 'loading',
        explorerError: undefined,
        errorMessage: undefined,
      }
    case 'EXPLORER_READY':
      return {
        ...state,
        explorerStatus: 'ready',
        explorer: mergeExplorerResponse(state.explorer, action.explorer),
        explorerError: undefined,
        errorMessage: undefined,
      }
    case 'EXPLORER_ERROR':
      return {
        ...state,
        explorerStatus: 'ready',
        explorerError: action.message,
        errorMessage: undefined,
      }
    case 'EXPLORER_INSPECTION_READY':
      return {
        ...state,
        explorerInspection: action.inspection,
        errorMessage: undefined,
      }
    case 'STRUCTURE_LOADING':
      return {
        ...state,
        structureStatus: 'loading',
        structureError: undefined,
        errorMessage: undefined,
      }
    case 'STRUCTURE_READY':
      return {
        ...state,
        structureStatus: 'ready',
        structure: action.structure,
        structureError: undefined,
        errorMessage: undefined,
      }
    case 'STRUCTURE_ERROR':
      return {
        ...state,
        structureStatus: 'ready',
        structureError: action.message,
        errorMessage: undefined,
      }
    case 'EXECUTION_LOADING':
      return {
        ...state,
        executionStatus: 'loading',
        errorMessage: undefined,
      }
    case 'EXECUTION_READY': {
      const payload = applyExecutionToPayload(state.payload, action.execution)

      return {
        ...state,
        executionStatus: 'ready',
        payload,
        lastExecution: action.execution,
        lastExecutionRequest: action.request,
        errorMessage:
          action.execution.guardrail.status === 'confirm'
            ? undefined
            : action.execution.diagnostics[0],
      }
    }
    case 'RESULT_PAGE_READY':
      return {
        ...state,
        payload: applyResultPageToPayload(state.payload, action.page),
        errorMessage: undefined,
      }
    case 'BOOTSTRAP_ERROR':
      return {
        ...state,
        status: 'error',
        errorMessage: action.message,
      }
    case 'COMMAND_ERROR':
      return {
        ...state,
        status: state.payload ? 'ready' : 'error',
        explorerStatus: state.explorerStatus === 'loading' ? 'idle' : state.explorerStatus,
        structureStatus: state.structureStatus === 'loading' ? 'idle' : state.structureStatus,
        executionStatus:
          state.executionStatus === 'loading' ? 'idle' : state.executionStatus,
        errorMessage: action.message,
      }
    default:
      return state
  }
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

function savedWorkItemForTab(
  snapshot: WorkspaceSnapshot,
  tabId: string,
): SavedWorkItem {
  const tab = snapshot.tabs.find((item) => item.id === tabId)
  const connection = tab
    ? snapshot.connections.find((item) => item.id === tab.connectionId)
    : undefined
  const environment = tab
    ? snapshot.environments.find((item) => item.id === tab.environmentId)
    : undefined

  if (!tab || !connection || !environment) {
    throw new Error('The active query tab cannot be saved yet.')
  }

  const existingSavedWork = tab.savedQueryId
    ? snapshot.savedWork.find((item) => item.id === tab.savedQueryId)
    : undefined

  return {
    id: existingSavedWork?.id ?? tab.savedQueryId ?? createId('saved'),
    kind: 'query',
    name: tab.title,
    summary: `${connection.name} / ${environment.label}`,
    tags:
      existingSavedWork?.tags ??
      [connection.engine, environment.label.toLowerCase()],
    folder: existingSavedWork?.folder ?? 'Saved Queries',
    favorite: existingSavedWork?.favorite ?? false,
    updatedAt: new Date().toISOString(),
    connectionId: connection.id,
    environmentId: environment.id,
    language: tab.language,
    queryText: tab.queryText,
  }
}

interface Actions {
  selectConnection(connectionId: string): Promise<void>
  selectTab(tabId: string): Promise<void>
  selectEnvironment(tabId: string, environmentId: string): Promise<void>
  createConnection(): Promise<void>
  duplicateConnection(connectionId: string): Promise<void>
  deleteConnection(connectionId: string): Promise<void>
  saveConnection(profile: ConnectionProfile, secret?: string): Promise<void>
  createEnvironment(): Promise<void>
  saveEnvironment(profile: EnvironmentProfile): Promise<void>
  createTab(connectionId: string): Promise<void>
  closeTab(tabId: string): Promise<void>
  reopenClosedTab(closedTabId: string): Promise<void>
  updateQuery(tabId: string, queryText: string): Promise<void>
  renameTab(tabId: string, title: string): Promise<void>
  saveCurrentQuery(tabId: string): Promise<void>
  saveAndCloseTab(tabId: string): Promise<void>
  openSavedWork(savedWorkId: string): Promise<void>
  deleteSavedWork(savedWorkId: string): Promise<void>
  testConnection(profile: ConnectionProfile, environmentId: string): Promise<void>
  loadExplorer(request: ExplorerRequest): Promise<void>
  loadStructureMap(request: StructureRequest): Promise<void>
  inspectExplorer(
    request: Pick<ExplorerRequest, 'connectionId' | 'environmentId'> & { nodeId: string },
  ): Promise<void>
  executeQuery(
    tabId: string,
    mode?: ExecutionRequest['mode'],
    confirmedGuardrailId?: string,
  ): Promise<void>
  fetchResultPage(tabId: string, renderer?: string): Promise<void>
  cancelExecution(executionId: string, tabId?: string): Promise<void>
  pickLocalDatabaseFile(request: LocalDatabasePickRequest): Promise<LocalDatabasePickResult>
  createLocalDatabase(
    request: LocalDatabaseCreateRequest,
  ): Promise<LocalDatabaseCreateResult | undefined>
  setTheme(theme: WorkspaceSnapshot['preferences']['theme']): Promise<void>
  updateUiState(patch: UpdateUiStateRequest): Promise<void>
  setLocked(isLocked: boolean): Promise<void>
  refreshDiagnostics(): Promise<void>
  exportWorkspace(passphrase: string): Promise<void>
  importWorkspace(passphrase: string, encryptedPayload: string): Promise<void>
}

interface AppContextValue extends StateShape {
  activeConnection?: ConnectionProfile
  activeEnvironment?: EnvironmentProfile
  actions: Actions
}

const noop = async () => {}

const defaultActions: Actions = {
  selectConnection: noop,
  selectTab: noop,
  selectEnvironment: noop,
  createConnection: noop,
  duplicateConnection: noop,
  deleteConnection: noop,
  saveConnection: noop,
  createEnvironment: noop,
  saveEnvironment: noop,
  createTab: noop,
  closeTab: noop,
  reopenClosedTab: noop,
  updateQuery: noop,
  renameTab: noop,
  saveCurrentQuery: noop,
  saveAndCloseTab: noop,
  openSavedWork: noop,
  deleteSavedWork: noop,
  testConnection: noop,
  loadExplorer: noop,
  loadStructureMap: noop,
  inspectExplorer: noop,
  executeQuery: noop,
  fetchResultPage: noop,
  cancelExecution: noop,
  pickLocalDatabaseFile: async () => ({ canceled: true }),
  createLocalDatabase: async () => undefined,
  setTheme: noop,
  updateUiState: noop,
  setLocked: noop,
  refreshDiagnostics: noop,
  exportWorkspace: noop,
  importWorkspace: noop,
}

const AppStateContext = createContext<AppContextValue>({
  ...initialState,
  actions: defaultActions,
})

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    let mounted = true

    void desktopClient
      .bootstrapApp()
      .then((payload) => {
        if (mounted) {
          dispatch({ type: 'BOOTSTRAP_SUCCESS', payload })
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          dispatch({
            type: 'BOOTSTRAP_ERROR',
            message: toUserMessage(error, 'Unable to bootstrap workspace.'),
          })
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const applyPayload = useCallback((payload: BootstrapPayload) => {
    startTransition(() => {
      dispatch({ type: 'COMMAND_SUCCESS', payload })
    })
  }, [])

  const handleError = useCallback((error: unknown) => {
    dispatch({
      type: 'COMMAND_ERROR',
      message: toUserMessage(error, 'Unexpected desktop command failure.'),
    })
  }, [])

  const selectConnection = useCallback<Actions['selectConnection']>(
    async (connectionId) => {
      try {
        applyPayload(await desktopClient.setActiveConnection(connectionId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const selectTab = useCallback<Actions['selectTab']>(
    async (tabId) => {
      try {
        applyPayload(await desktopClient.setActiveTab(tabId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const selectEnvironment = useCallback<Actions['selectEnvironment']>(
    async (tabId, environmentId) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        applyPayload(await desktopClient.setTabEnvironment(tabId, environmentId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const createConnection = useCallback<Actions['createConnection']>(
    async () => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for connection creation.')
        }
        ensureWorkspaceUnlocked(state.payload)
        let environmentId =
          state.payload.snapshot.ui.activeEnvironmentId ||
          state.payload.snapshot.environments[0]?.id

        if (!environmentId) {
          const environment = createEnvironmentProfile()
          environmentId = environment.id
          await desktopClient.upsertEnvironment(environment)
        }

        const profile = createConnectionProfile(environmentId)

        await desktopClient.upsertConnection(profile)
        await desktopClient.createQueryTab(profile.id)
        applyPayload(
          await desktopClient.updateUiState({
            activeActivity: 'connections',
            activeSidebarPane: 'connections',
            rightDrawer: 'connection',
          }),
        )
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const duplicateConnection = useCallback<Actions['duplicateConnection']>(
    async (connectionId) => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for connection duplication.')
        }
        ensureWorkspaceUnlocked(state.payload)
        const source = state.payload.snapshot.connections.find(
          (connection) => connection.id === connectionId,
        )

        if (!source) {
          throw new Error('Connection was not found.')
        }

        const profile = createConnectionProfile(
          state.payload.snapshot.ui.activeEnvironmentId,
          source,
        )

        await desktopClient.upsertConnection(profile)
        await desktopClient.createQueryTab(profile.id)
        applyPayload(
          await desktopClient.updateUiState({
            activeActivity: 'connections',
            activeSidebarPane: 'connections',
            rightDrawer: 'connection',
          }),
        )
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const deleteConnection = useCallback<Actions['deleteConnection']>(
    async (connectionId) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        applyPayload(await desktopClient.deleteConnection(connectionId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const saveConnection = useCallback<Actions['saveConnection']>(
    async (profile, secret) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        let nextProfile = profile

        if (secret?.trim()) {
          const secretRef = profile.auth.secretRef ?? secretRefForConnection(profile)
          await desktopClient.storeSecret(secretRef, secret)
          nextProfile = {
            ...profile,
            auth: {
              ...profile.auth,
              secretRef,
            },
            updatedAt: new Date().toISOString(),
          }
        }

        await desktopClient.upsertConnection(nextProfile)
        applyPayload(await desktopClient.updateUiState({ rightDrawer: 'none' }))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const createEnvironment = useCallback<Actions['createEnvironment']>(
    async () => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for environment creation.')
        }
        ensureWorkspaceUnlocked(state.payload)

        const environmentCount = state.payload.snapshot.environments.length
        const environment = createEnvironmentProfile({
          label: environmentCount === 0 ? 'Local' : `Environment ${environmentCount + 1}`,
        })
        await desktopClient.upsertEnvironment(environment)
        applyPayload(
          await desktopClient.updateUiState({
            activeEnvironmentId: environment.id,
            activeActivity: 'environments',
            activeSidebarPane: 'environments',
            sidebarCollapsed: false,
          }),
        )
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const saveEnvironment = useCallback<Actions['saveEnvironment']>(
    async (profile) => {
      try {
        applyPayload(await desktopClient.upsertEnvironment(profile))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const createTab = useCallback<Actions['createTab']>(
    async (connectionId) => {
      try {
        applyPayload(await desktopClient.createQueryTab(connectionId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const closeTab = useCallback<Actions['closeTab']>(
    async (tabId) => {
      try {
        applyPayload(await desktopClient.closeQueryTab(tabId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const reopenClosedTab = useCallback<Actions['reopenClosedTab']>(
    async (closedTabId) => {
      try {
        applyPayload(await desktopClient.reopenClosedQueryTab(closedTabId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const updateQuery = useCallback<Actions['updateQuery']>(
    async (tabId, queryText) => {
      try {
        applyPayload(await desktopClient.updateQueryTab(tabId, queryText))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const renameTab = useCallback<Actions['renameTab']>(
    async (tabId, title) => {
      try {
        applyPayload(await desktopClient.renameQueryTab(tabId, title))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const saveCurrentQuery = useCallback<Actions['saveCurrentQuery']>(
    async (tabId) => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for saved work.')
        }
        ensureWorkspaceUnlocked(state.payload)

        const savedWorkItem = savedWorkItemForTab(state.payload.snapshot, tabId)

        applyPayload(await desktopClient.saveQueryTab(tabId, savedWorkItem))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const saveAndCloseTab = useCallback<Actions['saveAndCloseTab']>(
    async (tabId) => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for saved work.')
        }
        ensureWorkspaceUnlocked(state.payload)

        const savedWorkItem = savedWorkItemForTab(state.payload.snapshot, tabId)
        await desktopClient.saveQueryTab(tabId, savedWorkItem)
        applyPayload(await desktopClient.closeQueryTab(tabId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const openSavedWork = useCallback<Actions['openSavedWork']>(
    async (savedWorkId) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        applyPayload(await desktopClient.openSavedWork(savedWorkId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const deleteSavedWork = useCallback<Actions['deleteSavedWork']>(
    async (savedWorkId) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        applyPayload(await desktopClient.deleteSavedWork(savedWorkId))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const testConnection = useCallback<Actions['testConnection']>(
    async (profile, environmentId) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        const result = await desktopClient.testConnection({ profile, environmentId })
        dispatch({
          type: 'CONNECTION_TEST_READY',
          profileId: profile.id,
          result,
        })
      } catch (error) {
        dispatch({
          type: 'EXPLORER_ERROR',
          message: toUserMessage(error, 'Unable to load live explorer metadata.'),
        })
      }
    },
    [state.payload],
  )

  const loadExplorer = useCallback<Actions['loadExplorer']>(
    async (request) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        dispatch({ type: 'EXPLORER_LOADING' })
        const explorer = await desktopClient.loadExplorer(request)
        dispatch({ type: 'EXPLORER_READY', explorer })
      } catch (error) {
        dispatch({
          type: 'EXPLORER_ERROR',
          message: toUserMessage(error, 'Unable to load live explorer metadata.'),
        })
      }
    },
    [state.payload],
  )

  const loadStructureMap = useCallback<Actions['loadStructureMap']>(
    async (request) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        dispatch({ type: 'STRUCTURE_LOADING' })
        const structure = await desktopClient.loadStructureMap(request)
        dispatch({ type: 'STRUCTURE_READY', structure })
      } catch (error) {
        dispatch({
          type: 'STRUCTURE_ERROR',
          message: toUserMessage(error, 'Unable to load visual database structure.'),
        })
      }
    },
    [state.payload],
  )

  const inspectExplorer = useCallback<Actions['inspectExplorer']>(
    async ({ connectionId, environmentId, nodeId }) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        const inspection = await desktopClient.inspectExplorer({
          connectionId,
          environmentId,
          nodeId,
        })
        dispatch({ type: 'EXPLORER_INSPECTION_READY', inspection })
      } catch (error) {
        dispatch({
          type: 'EXPLORER_ERROR',
          message: toUserMessage(error, 'Unable to inspect explorer object.'),
        })
      }
    },
    [state.payload],
  )

  const executeQuery = useCallback<Actions['executeQuery']>(
    async (tabId, mode = 'full', confirmedGuardrailId) => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for query execution.')
        }
        ensureWorkspaceUnlocked(state.payload)

        const tab = state.payload.snapshot.tabs.find((item) => item.id === tabId)

        if (!tab) {
          throw new Error('Query tab was not found.')
        }

        const executionRequest: ExecutionRequest = {
          executionId: undefined,
          tabId: tab.id,
          connectionId: tab.connectionId,
          environmentId: tab.environmentId,
          language: tab.language,
          queryText: tab.queryText,
          mode,
          rowLimit: 500,
          confirmedGuardrailId,
        }

        dispatch({ type: 'EXECUTION_LOADING' })
        const execution = await desktopClient.executeQuery(executionRequest)
        dispatch({ type: 'EXECUTION_READY', execution, request: executionRequest })
      } catch (error) {
        handleError(error)
      }
    },
    [handleError, state.payload],
  )

  const fetchResultPage = useCallback<Actions['fetchResultPage']>(
    async (tabId, renderer) => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for paged result loading.')
        }
        ensureWorkspaceUnlocked(state.payload)
        const tab = state.payload.snapshot.tabs.find((item) => item.id === tabId)

        if (!tab?.result) {
          throw new Error('Run a query before loading another result page.')
        }

        const pageInfo = tab.result.pageInfo

        if (!pageInfo?.hasMore) {
          return
        }

        const request: ResultPageRequest = {
          tabId: tab.id,
          connectionId: tab.connectionId,
          environmentId: tab.environmentId,
          language: tab.language,
          queryText: tab.queryText,
          renderer: renderer ?? tab.result.defaultRenderer,
          pageSize: pageInfo.pageSize,
          pageIndex: pageInfo.pageIndex + 1,
          cursor: pageInfo.nextCursor,
        }

        const page = await desktopClient.fetchResultPage(request)
        dispatch({ type: 'RESULT_PAGE_READY', page })
      } catch (error) {
        handleError(error)
      }
    },
    [handleError, state.payload],
  )

  const cancelExecution = useCallback<Actions['cancelExecution']>(
    async (executionId, tabId) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        const result = await desktopClient.cancelExecution({ executionId, tabId })

        if (!result.ok) {
          dispatch({
            type: 'COMMAND_ERROR',
            message: result.message,
          })
        }
      } catch (error) {
        handleError(error)
      }
    },
    [handleError, state.payload],
  )

  const pickLocalDatabaseFile = useCallback<Actions['pickLocalDatabaseFile']>(
    async (request) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        return await desktopClient.pickLocalDatabaseFile(request)
      } catch (error) {
        handleError(error)
        return { canceled: true }
      }
    },
    [handleError, state.payload],
  )

  const createLocalDatabase = useCallback<Actions['createLocalDatabase']>(
    async (request) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        return await desktopClient.createLocalDatabase(request)
      } catch (error) {
        handleError(error)
        return undefined
      }
    },
    [handleError, state.payload],
  )

  const setTheme = useCallback<Actions['setTheme']>(
    async (theme) => {
      try {
        applyPayload(await desktopClient.setTheme(theme))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const updateUiState = useCallback<Actions['updateUiState']>(
    async (patch) => {
      try {
        applyPayload(await desktopClient.updateUiState(patch))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const setLocked = useCallback<Actions['setLocked']>(
    async (isLocked) => {
      try {
        applyPayload(await desktopClient.setLocked(isLocked))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
  )

  const refreshDiagnostics = useCallback<Actions['refreshDiagnostics']>(
    async () => {
      try {
        const diagnostics = await desktopClient.createDiagnosticsReport()
        dispatch({ type: 'DIAGNOSTICS_READY', diagnostics })
      } catch (error) {
        handleError(error)
      }
    },
    [handleError],
  )

  const exportWorkspace = useCallback<Actions['exportWorkspace']>(
    async (passphrase) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        const exportBundle = await desktopClient.exportWorkspaceBundle(passphrase)
        dispatch({ type: 'EXPORT_READY', exportBundle })
      } catch (error) {
        handleError(error)
      }
    },
    [handleError, state.payload],
  )

  const importWorkspace = useCallback<Actions['importWorkspace']>(
    async (passphrase, encryptedPayload) => {
      try {
        ensureWorkspaceUnlocked(state.payload)
        applyPayload(
          await desktopClient.importWorkspaceBundle(passphrase, encryptedPayload),
        )
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError, state.payload],
  )

  const snapshot = state.payload?.snapshot
  const activeConnection =
    snapshot && snapshot.connections.length > 0
      ? findConnection(snapshot, snapshot.ui.activeConnectionId)
      : undefined
  const activeEnvironment =
    snapshot && snapshot.environments.length > 0
      ? findEnvironment(snapshot, snapshot.ui.activeEnvironmentId)
      : undefined

  const actions = useMemo<Actions>(
    () => ({
      selectConnection,
      selectTab,
      selectEnvironment,
      createConnection,
      duplicateConnection,
      deleteConnection,
      saveConnection,
      createEnvironment,
      saveEnvironment,
      createTab,
      closeTab,
      reopenClosedTab,
      updateQuery,
      renameTab,
      saveCurrentQuery,
      saveAndCloseTab,
      openSavedWork,
      deleteSavedWork,
      testConnection,
      loadExplorer,
      loadStructureMap,
      inspectExplorer,
      executeQuery,
      fetchResultPage,
      cancelExecution,
      pickLocalDatabaseFile,
      createLocalDatabase,
      setTheme,
      updateUiState,
      setLocked,
      refreshDiagnostics,
      exportWorkspace,
      importWorkspace,
    }),
    [
      cancelExecution,
      createLocalDatabase,
      createConnection,
      createEnvironment,
      createTab,
      closeTab,
      deleteConnection,
      duplicateConnection,
      executeQuery,
      exportWorkspace,
      fetchResultPage,
      importWorkspace,
      inspectExplorer,
      pickLocalDatabaseFile,
      loadExplorer,
      loadStructureMap,
      deleteSavedWork,
      openSavedWork,
      renameTab,
      reopenClosedTab,
      refreshDiagnostics,
      saveAndCloseTab,
      saveCurrentQuery,
      saveConnection,
      saveEnvironment,
      selectConnection,
      selectEnvironment,
      selectTab,
      setLocked,
      setTheme,
      testConnection,
      updateUiState,
      updateQuery,
    ],
  )

  const value: AppContextValue = {
    ...state,
    activeConnection,
    activeEnvironment,
    actions,
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  return useContext(AppStateContext)
}
