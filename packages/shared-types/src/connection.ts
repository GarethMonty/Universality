export const DATASTORE_FAMILIES = [
  'sql',
  'document',
  'keyvalue',
  'graph',
  'timeseries',
  'widecolumn',
  'search',
  'warehouse',
  'embedded-olap',
] as const

export type DatastoreFamily = (typeof DATASTORE_FAMILIES)[number]

export const DATASTORE_ENGINES = [
  'postgresql',
  'cockroachdb',
  'sqlserver',
  'mysql',
  'mariadb',
  'sqlite',
  'oracle',
  'mongodb',
  'dynamodb',
  'cassandra',
  'cosmosdb',
  'litedb',
  'redis',
  'valkey',
  'memcached',
  'neo4j',
  'neptune',
  'arango',
  'janusgraph',
  'influxdb',
  'timescaledb',
  'prometheus',
  'opentsdb',
  'elasticsearch',
  'opensearch',
  'clickhouse',
  'duckdb',
  'snowflake',
  'bigquery',
] as const

export type DatastoreEngine = (typeof DATASTORE_ENGINES)[number]

export const CONNECTION_MODES = [
  'native',
  'connection-string',
  'local-file',
  'cloud-iam',
  'cloud-sdk',
] as const

export type ConnectionMode = (typeof CONNECTION_MODES)[number]

export const CLOUD_PROVIDERS = ['aws', 'azure', 'gcp', 'snowflake'] as const

export type CloudProvider = (typeof CLOUD_PROVIDERS)[number]

export const ENVIRONMENT_RISKS = ['low', 'medium', 'high', 'critical'] as const

export type EnvironmentRisk = (typeof ENVIRONMENT_RISKS)[number]

export const SECRET_PROVIDERS = ['os-keyring', 'manual', 'session'] as const

export type SecretProvider = (typeof SECRET_PROVIDERS)[number]

export type SslMode = 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'

export interface SecretRef {
  id: string
  provider: SecretProvider
  service: string
  account: string
  label: string
}

export interface ConnectionAuth {
  username?: string
  authMechanism?: string
  sslMode?: SslMode
  cloudProvider?: CloudProvider
  principal?: string
  secretRef?: SecretRef
}

export interface ConnectionProfile {
  id: string
  name: string
  engine: DatastoreEngine
  family: DatastoreFamily
  host: string
  port?: number
  database?: string
  connectionString?: string
  connectionMode?: ConnectionMode
  environmentIds: string[]
  tags: string[]
  favorite: boolean
  readOnly: boolean
  icon: string
  color?: string
  group?: string
  notes?: string
  auth: ConnectionAuth
  createdAt: string
  updatedAt: string
}

export interface EnvironmentProfile {
  id: string
  label: string
  color: string
  risk: EnvironmentRisk
  inheritsFrom?: string
  variables: Record<string, string>
  sensitiveKeys: string[]
  requiresConfirmation: boolean
  safeMode: boolean
  exportable: boolean
  createdAt: string
  updatedAt: string
}

export interface ResolvedEnvironment {
  environmentId: string
  label: string
  risk: EnvironmentRisk
  variables: Record<string, string>
  unresolvedKeys: string[]
  inheritedChain: string[]
  sensitiveKeys: string[]
}

export type ConnectionDefinition = ConnectionProfile
export type WorkspaceEnvironment = EnvironmentProfile
