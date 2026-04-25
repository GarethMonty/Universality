import type { BottomPanelTab, RightDrawerView, SidebarPane, UiActivity } from './app'
import type { ConnectionProfile, DatastoreEngine, DatastoreFamily } from './connection'
import type { AdapterCapability, ExecutionCapabilities } from './capabilities'
import type { GuardrailDecision } from './security'
import type {
  ExecutionResultEnvelope,
  ExplorerNode,
  QueryBuilderKind,
  QueryBuilderState,
  QueryLanguage,
  QueryTabState,
  ResultPageInfo,
  ResultPayload,
  ResultRenderer,
  StructureEdge,
  StructureGroup,
  StructureMetric,
  StructureNode,
} from './workspace'

export type QueryExecutionMode = 'full' | 'selection' | 'explain'

export const DATASTORE_OPERATION_RISKS = [
  'read',
  'diagnostic',
  'write',
  'destructive',
  'costly',
] as const

export type DatastoreOperationRisk = (typeof DATASTORE_OPERATION_RISKS)[number]

export const DATASTORE_OPERATION_SCOPES = [
  'connection',
  'cluster',
  'database',
  'schema',
  'table',
  'collection',
  'index',
  'query',
  'user',
  'role',
  'file',
] as const

export type DatastoreOperationScope = (typeof DATASTORE_OPERATION_SCOPES)[number]

export type DatastoreOperationExecutionSupport = 'live' | 'plan-only' | 'unsupported'

export interface DatastoreOperationManifest {
  id: string
  engine: DatastoreEngine
  family: DatastoreFamily
  label: string
  scope: DatastoreOperationScope
  risk: DatastoreOperationRisk
  requiredCapabilities: AdapterCapability[]
  supportedRenderers: ResultRenderer[]
  description: string
  requiresConfirmation: boolean
  executionSupport: DatastoreOperationExecutionSupport
  disabledReason?: string
  previewOnly?: boolean
}

export interface OperationPlan {
  operationId: string
  engine: DatastoreEngine
  summary: string
  generatedRequest: string
  requestLanguage: QueryLanguage
  destructive: boolean
  estimatedCost?: string
  estimatedScanImpact?: string
  requiredPermissions: string[]
  confirmationText?: string
  warnings: string[]
}

export interface PermissionInspection {
  engine: DatastoreEngine
  principal?: string
  effectiveRoles: string[]
  effectivePrivileges: string[]
  iamSignals: string[]
  unavailableActions: Array<{
    operationId: string
    reason: string
  }>
  warnings: string[]
}

export interface AdapterDiagnostics {
  engine: DatastoreEngine
  plans: ResultPayload[]
  profiles: ResultPayload[]
  metrics: ResultPayload[]
  queryHistory: ResultPayload[]
  costEstimates: ResultPayload[]
  warnings: string[]
}

export interface OperationManifestRequest {
  connectionId: string
  environmentId: string
  scope?: string
}

export interface OperationManifestResponse {
  connectionId: string
  environmentId: string
  engine: DatastoreEngine
  operations: DatastoreOperationManifest[]
}

export interface OperationPlanRequest {
  connectionId: string
  environmentId: string
  operationId: string
  objectName?: string
  parameters?: Record<string, unknown>
}

export interface OperationPlanResponse {
  connectionId: string
  environmentId: string
  plan: OperationPlan
}

export interface OperationExecutionRequest {
  connectionId: string
  environmentId: string
  operationId: string
  objectName?: string
  parameters?: Record<string, unknown>
  confirmationText?: string
  rowLimit?: number
  tabId?: string
}

export interface OperationExecutionResponse {
  connectionId: string
  environmentId: string
  operationId: string
  executionSupport: DatastoreOperationExecutionSupport
  executed: boolean
  plan: OperationPlan
  result?: ExecutionResultEnvelope
  permissionInspection?: PermissionInspection
  diagnostics?: AdapterDiagnostics
  metadata?: unknown
  messages: string[]
  warnings: string[]
}

export interface PermissionInspectionRequest {
  connectionId: string
  environmentId: string
}

export interface PermissionInspectionResponse {
  connectionId: string
  environmentId: string
  inspection: PermissionInspection
}

export interface AdapterDiagnosticsRequest {
  connectionId: string
  environmentId: string
  scope?: string
}

export interface AdapterDiagnosticsResponse {
  connectionId: string
  environmentId: string
  diagnostics: AdapterDiagnostics
}

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

export interface StructureRequest {
  connectionId: string
  environmentId: string
  limit?: number
  scope?: string
}

export interface StructureResponse {
  connectionId: string
  environmentId: string
  engine: DatastoreEngine
  summary: string
  groups: StructureGroup[]
  nodes: StructureNode[]
  edges: StructureEdge[]
  metrics: StructureMetric[]
  truncated?: boolean
  nextCursor?: string
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

export interface ResultPageRequest {
  tabId: string
  connectionId: string
  environmentId: string
  language: QueryLanguage
  queryText: string
  selectedText?: string
  renderer: string
  pageSize?: number
  pageIndex?: number
  cursor?: string
}

export interface ResultPageResponse {
  tabId: string
  resultId?: string
  payload: ResultPayload
  pageInfo: ResultPageInfo
  notices: string[]
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

export interface QueryTabReorderRequest {
  orderedTabIds: string[]
}

export interface ScopedQueryTarget {
  kind: string
  label: string
  path?: string[]
  scope?: string
  queryTemplate?: string
  preferredBuilder?: QueryBuilderKind
}

export interface CreateScopedQueryTabRequest {
  connectionId: string
  environmentId?: string
  target: ScopedQueryTarget
}

export interface UpdateQueryBuilderStateRequest {
  tabId: string
  builderState: QueryBuilderState
  queryText?: string
}

export type LocalDatabaseCreateMode = 'empty' | 'starter'

export interface LocalDatabasePickRequest {
  engine: DatastoreEngine
  purpose: 'open' | 'create'
  currentPath?: string
}

export interface LocalDatabasePickResult {
  canceled: boolean
  path?: string
}

export interface LocalDatabaseCreateRequest {
  engine: DatastoreEngine
  path: string
  mode: LocalDatabaseCreateMode
  connectionId?: string
  environmentId?: string
}

export interface LocalDatabaseCreateResult {
  engine: DatastoreEngine
  path: string
  message: string
  warnings: string[]
}

export interface UpdateUiStateRequest {
  activeEnvironmentId?: string
  activeActivity?: UiActivity
  sidebarCollapsed?: boolean
  activeSidebarPane?: SidebarPane
  sidebarWidth?: number
  explorerFilter?: string
  explorerView?: 'tree' | 'structure'
  bottomPanelVisible?: boolean
  activeBottomPanelTab?: BottomPanelTab
  bottomPanelHeight?: number
  rightDrawer?: RightDrawerView
  rightDrawerWidth?: number
}
