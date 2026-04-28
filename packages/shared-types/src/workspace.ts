import type { DatastoreEngine, DatastoreFamily } from './connection'

export const RESULT_RENDERERS = [
  'table',
  'json',
  'document',
  'graph',
  'chart',
  'keyvalue',
  'raw',
  'schema',
  'diff',
  'plan',
  'metrics',
  'series',
  'searchHits',
  'profile',
  'costEstimate',
] as const

export type ResultRenderer = (typeof RESULT_RENDERERS)[number]

export const QUERY_LANGUAGES = [
  'sql',
  'mongodb',
  'redis',
  'cypher',
  'flux',
  'text',
  'json',
  'cql',
  'aql',
  'gremlin',
  'sparql',
  'promql',
  'influxql',
  'opentsdb',
  'query-dsl',
  'esql',
  'google-sql',
  'snowflake-sql',
  'clickhouse-sql',
] as const

export type QueryLanguage = (typeof QUERY_LANGUAGES)[number]

export type QueryExecutionState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'blocked'

export type SavedWorkItemKind =
  | 'query'
  | 'template'
  | 'snippet'
  | 'snapshot'
  | 'investigation-pack'
  | 'bookmark'
  | 'note'

export interface QueryTabDefinition {
  id: string
  title: string
  connectionId: string
  environmentId: string
  family: DatastoreFamily
  language: QueryLanguage
  pinned?: boolean
  savedQueryId?: string
}

export type QueryBuilderKind = 'mongo-find'

export type MongoFilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'regex'
  | 'exists'
  | 'in'

export type MongoBuilderValueType = 'string' | 'number' | 'boolean' | 'null' | 'json'

export interface MongoFindFilterRow {
  id: string
  enabled?: boolean
  field: string
  groupId?: string
  operator: MongoFilterOperator
  value: string
  valueType: MongoBuilderValueType
}

export interface MongoFindFilterGroup {
  id: string
  label: string
  logic: 'and' | 'or'
}

export interface MongoFindProjectionField {
  id: string
  field: string
}

export interface MongoFindSortRow {
  id: string
  field: string
  direction: 'asc' | 'desc'
}

export interface MongoFindBuilderState {
  kind: 'mongo-find'
  collection: string
  filters: MongoFindFilterRow[]
  filterGroups?: MongoFindFilterGroup[]
  projectionMode: 'all' | 'include' | 'exclude'
  projectionFields: MongoFindProjectionField[]
  sort: MongoFindSortRow[]
  skip?: number
  limit?: number
  lastAppliedQueryText?: string
}

export type QueryBuilderState = MongoFindBuilderState

export interface QueryExecutionNotice {
  code: string
  level: 'info' | 'warning' | 'error'
  message: string
}

export interface TabularPayload {
  renderer: 'table'
  columns: string[]
  rows: string[][]
}

export interface JsonPayload {
  renderer: 'json'
  value: unknown
}

export interface DocumentPayload {
  renderer: 'document'
  documents: Array<Record<string, unknown>>
}

export interface KeyValuePayload {
  renderer: 'keyvalue'
  entries: Record<string, string>
  ttl?: string
  memoryUsage?: string
}

export interface RawPayload {
  renderer: 'raw'
  text: string
}

export interface SchemaPayload {
  renderer: 'schema'
  items: Array<{ label: string; detail: string }>
}

export interface GraphPayload {
  renderer: 'graph'
  nodes: Array<{
    id: string
    label: string
    kind?: string
    properties?: Record<string, unknown>
  }>
  edges: Array<{
    id: string
    from: string
    to: string
    label?: string
    kind?: string
    properties?: Record<string, unknown>
  }>
}

export interface ChartPayload {
  renderer: 'chart'
  chartType: 'line' | 'bar' | 'area' | 'scatter'
  xAxis?: string
  yAxis?: string
  series: Array<{
    name: string
    points: Array<{ x: string | number; y: number }>
  }>
}

export interface DiffPayload {
  renderer: 'diff'
  before: unknown
  after: unknown
  summary?: string
}

export interface PlanPayload {
  renderer: 'plan'
  format: 'json' | 'text' | 'graph'
  value: unknown
  summary?: string
}

export interface MetricsPayload {
  renderer: 'metrics'
  metrics: Array<{
    name: string
    value: number
    unit?: string
    labels?: Record<string, string>
  }>
}

export interface SeriesPayload {
  renderer: 'series'
  series: Array<{
    name: string
    unit?: string
    points: Array<{
      timestamp: string
      value: number
      labels?: Record<string, string>
    }>
  }>
}

export interface SearchHitsPayload {
  renderer: 'searchHits'
  total?: number
  hits: Array<{
    id?: string
    score?: number
    source: Record<string, unknown>
    highlights?: Record<string, string[]>
  }>
  aggregations?: Record<string, unknown>
}

export interface ProfilePayload {
  renderer: 'profile'
  summary?: string
  stages: Array<{
    name: string
    durationMs?: number
    rows?: number
    details?: Record<string, unknown>
  }>
}

export interface CostEstimatePayload {
  renderer: 'costEstimate'
  currency?: string
  estimatedBytes?: number
  estimatedCredits?: number
  estimatedCost?: number
  details?: Record<string, unknown>
}

export type ResultPayload =
  | TabularPayload
  | JsonPayload
  | DocumentPayload
  | KeyValuePayload
  | RawPayload
  | SchemaPayload
  | GraphPayload
  | ChartPayload
  | DiffPayload
  | PlanPayload
  | MetricsPayload
  | SeriesPayload
  | SearchHitsPayload
  | ProfilePayload
  | CostEstimatePayload

export interface ResultPageInfo {
  pageSize: number
  pageIndex: number
  bufferedRows: number
  hasMore: boolean
  nextCursor?: string
  totalRowsKnown?: number
}

export interface ExecutionResultEnvelope {
  id: string
  engine: DatastoreEngine
  summary: string
  defaultRenderer: ResultRenderer
  rendererModes: ResultRenderer[]
  payloads: ResultPayload[]
  notices: QueryExecutionNotice[]
  executedAt: string
  durationMs: number
  truncated?: boolean
  rowLimit?: number
  continuationToken?: string
  pageInfo?: ResultPageInfo
  explainPayload?: ResultPayload
}

export interface QueryHistoryEntry {
  id: string
  queryText: string
  executedAt: string
  status: QueryExecutionState
}

export interface UserFacingError {
  code: string
  message: string
}

export interface QueryTabState extends QueryTabDefinition {
  editorLabel: string
  queryText: string
  builderState?: QueryBuilderState
  status: QueryExecutionState
  dirty: boolean
  lastRunAt?: string
  result?: ExecutionResultEnvelope
  history: QueryHistoryEntry[]
  error?: UserFacingError
}

export type ClosedQueryTabReason = 'user' | 'connection-deleted' | 'replaced'

export interface ClosedQueryTabSnapshot extends QueryTabState {
  closedAt: string
  closeReason: ClosedQueryTabReason
}

export interface SavedWorkItem {
  id: string
  kind: SavedWorkItemKind
  name: string
  summary: string
  tags: string[]
  updatedAt: string
  folder?: string
  favorite?: boolean
  connectionId?: string
  environmentId?: string
  language?: QueryLanguage
  queryText?: string
  snapshotResultId?: string
}

export interface ExplorerNode {
  id: string
  family: DatastoreFamily | 'shared'
  label: string
  kind: string
  detail: string
  scope?: string
  path?: string[]
  queryTemplate?: string
  expandable?: boolean
}

export interface StructureMetric {
  label: string
  value: string
}

export interface StructureField {
  name: string
  dataType: string
  detail?: string
  nullable?: boolean
  primary?: boolean
}

export interface StructureGroup {
  id: string
  label: string
  kind: string
  detail?: string
  color?: string
}

export interface StructureNode {
  id: string
  family: DatastoreFamily | 'shared'
  label: string
  kind: string
  groupId?: string
  detail?: string
  metrics?: StructureMetric[]
  fields?: StructureField[]
  sample?: unknown
}

export interface StructureEdge {
  id: string
  from: string
  to: string
  label: string
  kind: string
  inferred?: boolean
}

export interface DiagnosticsReport {
  createdAt: string
  runtime: string
  platform: string
  appVersion: string
  counts: {
    connections: number
    environments: number
    tabs: number
    savedWork: number
  }
  warnings: string[]
}

export type SavedArtifact = SavedWorkItem
export type SavedArtifactKind = SavedWorkItemKind
