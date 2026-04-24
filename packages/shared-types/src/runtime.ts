import type { BottomPanelTab, RightDrawerView, SidebarPane, UiActivity } from './app'
import type { ConnectionProfile, DatastoreEngine } from './connection'
import type { ExecutionCapabilities } from './capabilities'
import type { GuardrailDecision } from './security'
import type {
  ExecutionResultEnvelope,
  ExplorerNode,
  QueryLanguage,
  QueryTabState,
} from './workspace'

export type QueryExecutionMode = 'full' | 'selection' | 'explain'

export interface ConnectionTestRequest {
  profile: ConnectionProfile
  environmentId: string
}

export interface ConnectionTestResult {
  ok: boolean
  engine: DatastoreEngine
  message: string
  warnings: string[]
  resolvedHost: string
  resolvedDatabase?: string
  durationMs?: number
}

export interface ExplorerRequest {
  connectionId: string
  environmentId: string
  limit?: number
  scope?: string
}

export interface ExplorerResponse {
  connectionId: string
  environmentId: string
  scope?: string
  summary: string
  capabilities: ExecutionCapabilities
  nodes: ExplorerNode[]
}

export interface ExplorerInspectRequest {
  connectionId: string
  environmentId: string
  nodeId: string
}

export interface ExplorerInspectResponse {
  nodeId: string
  summary: string
  queryTemplate?: string
  payload?: unknown
}

export interface ExecutionRequest {
  executionId?: string
  tabId: string
  connectionId: string
  environmentId: string
  language: QueryLanguage
  queryText: string
  selectedText?: string
  mode?: QueryExecutionMode
  rowLimit?: number
  confirmedGuardrailId?: string
}

export interface ExecutionResponse {
  executionId: string
  tab: QueryTabState
  result?: ExecutionResultEnvelope
  guardrail: GuardrailDecision
  diagnostics: string[]
}

export interface CancelExecutionRequest {
  executionId: string
  tabId?: string
}

export interface CancelExecutionResult {
  ok: boolean
  supported: boolean
  message: string
}

export interface UpdateUiStateRequest {
  activeActivity?: UiActivity
  sidebarCollapsed?: boolean
  activeSidebarPane?: SidebarPane
  explorerFilter?: string
  bottomPanelVisible?: boolean
  activeBottomPanelTab?: BottomPanelTab
  bottomPanelHeight?: number
  rightDrawer?: RightDrawerView
}
