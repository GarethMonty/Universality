import type { DatastoreEngine, DatastoreFamily } from './connection'

export const ADAPTER_CAPABILITIES = [
  'supports_sql_editor',
  'supports_document_view',
  'supports_graph_view',
  'supports_time_series_charting',
  'supports_explain_plan',
  'supports_transactions',
  'supports_visual_query_builder',
  'supports_key_browser',
  'supports_schema_browser',
  'supports_ttl_management',
  'supports_result_snapshots',
  'supports_query_cancellation',
  'supports_streaming_results',
] as const

export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number]

export interface AdapterManifest {
  id: string
  engine: DatastoreEngine
  family: DatastoreFamily
  label: string
  maturity: 'mvp' | 'beta' | 'planned'
  capabilities: AdapterCapability[]
  defaultLanguage: string
}

export interface ExecutionCapabilities {
  canCancel: boolean
  canExplain: boolean
  supportsLiveMetadata: boolean
  editorLanguage: string
  defaultRowLimit: number
}
