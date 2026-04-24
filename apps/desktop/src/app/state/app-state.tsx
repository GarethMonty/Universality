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
  SavedWorkItem,
  UpdateUiStateRequest,
  WorkspaceSnapshot,
} from '@universality/shared-types'
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
  | { type: 'EXECUTION_LOADING' }
  | { type: 'EXECUTION_READY'; execution: ExecutionResponse; request: ExecutionRequest }
  | { type: 'BOOTSTRAP_ERROR'; message: string }
  | { type: 'COMMAND_ERROR'; message: string }

const initialState: StateShape = {
  status: 'booting',
  explorerStatus: 'idle',
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
        explorer: action.explorer,
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

interface Actions {
  selectConnection(connectionId: string): Promise<void>
  selectTab(tabId: string): Promise<void>
  saveConnection(profile: ConnectionProfile): Promise<void>
  saveEnvironment(profile: EnvironmentProfile): Promise<void>
  createTab(connectionId: string): Promise<void>
  updateQuery(tabId: string, queryText: string): Promise<void>
  saveCurrentQuery(tabId: string): Promise<void>
  openSavedWork(savedWorkId: string): Promise<void>
  deleteSavedWork(savedWorkId: string): Promise<void>
  testConnection(profile: ConnectionProfile, environmentId: string): Promise<void>
  loadExplorer(request: ExplorerRequest): Promise<void>
  inspectExplorer(
    request: Pick<ExplorerRequest, 'connectionId' | 'environmentId'> & { nodeId: string },
  ): Promise<void>
  executeQuery(
    tabId: string,
    mode?: ExecutionRequest['mode'],
    confirmedGuardrailId?: string,
  ): Promise<void>
  cancelExecution(executionId: string, tabId?: string): Promise<void>
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
  saveConnection: noop,
  saveEnvironment: noop,
  createTab: noop,
  updateQuery: noop,
  saveCurrentQuery: noop,
  openSavedWork: noop,
  deleteSavedWork: noop,
  testConnection: noop,
  loadExplorer: noop,
  inspectExplorer: noop,
  executeQuery: noop,
  cancelExecution: noop,
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

  const saveConnection = useCallback<Actions['saveConnection']>(
    async (profile) => {
      try {
        applyPayload(await desktopClient.upsertConnection(profile))
      } catch (error) {
        handleError(error)
      }
    },
    [applyPayload, handleError],
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

  const saveCurrentQuery = useCallback<Actions['saveCurrentQuery']>(
    async (tabId) => {
      try {
        if (!state.payload) {
          throw new Error('Workspace is not ready for saved work.')
        }
        ensureWorkspaceUnlocked(state.payload)

        const tab = state.payload.snapshot.tabs.find((item) => item.id === tabId)
        const connection = tab
          ? state.payload.snapshot.connections.find((item) => item.id === tab.connectionId)
          : undefined
        const environment = tab
          ? state.payload.snapshot.environments.find((item) => item.id === tab.environmentId)
          : undefined

        if (!tab || !connection || !environment) {
          throw new Error('The active query tab cannot be saved yet.')
        }

        const savedWorkItem: SavedWorkItem = {
          id: createId('saved'),
          kind: 'query',
          name: tab.title,
          summary: `${connection.name} / ${environment.label}`,
          tags: [connection.engine, environment.label.toLowerCase()],
          folder: 'Saved Queries',
          favorite: false,
          updatedAt: new Date().toISOString(),
          connectionId: connection.id,
          environmentId: environment.id,
          language: tab.language,
          queryText: tab.queryText,
        }

        applyPayload(await desktopClient.upsertSavedWork(savedWorkItem))
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
          rowLimit: 200,
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
      saveConnection,
      saveEnvironment,
      createTab,
      updateQuery,
      saveCurrentQuery,
      openSavedWork,
      deleteSavedWork,
      testConnection,
      loadExplorer,
      inspectExplorer,
      executeQuery,
      cancelExecution,
      setTheme,
      updateUiState,
      setLocked,
      refreshDiagnostics,
      exportWorkspace,
      importWorkspace,
    }),
    [
      cancelExecution,
      createTab,
      executeQuery,
      exportWorkspace,
      importWorkspace,
      inspectExplorer,
      loadExplorer,
      deleteSavedWork,
      openSavedWork,
      refreshDiagnostics,
      saveCurrentQuery,
      saveConnection,
      saveEnvironment,
      selectConnection,
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
