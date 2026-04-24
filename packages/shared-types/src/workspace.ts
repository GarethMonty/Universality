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
] as const

export type ResultRenderer = (typeof RESULT_RENDERERS)[number]

export type QueryLanguage =
  | 'sql'
  | 'mongodb'
  | 'redis'
  | 'cypher'
  | 'flux'
  | 'text'
  | 'json'

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

export type ResultPayload =
  | TabularPayload
  | JsonPayload
  | DocumentPayload
  | KeyValuePayload
  | RawPayload
  | SchemaPayload

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
  status: QueryExecutionState
  dirty: boolean
  lastRunAt?: string
  result?: ExecutionResultEnvelope
  history: QueryHistoryEntry[]
  error?: UserFacingError
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
