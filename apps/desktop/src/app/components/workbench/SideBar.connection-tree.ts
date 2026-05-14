import type { ConnectionProfile, ScopedQueryTarget } from '@datapadplusplus/shared-types'

export interface ConnectionTreeNode {
  id: string
  label: string
  kind: string
  detail?: string
  scope?: string
  path?: string[]
  queryTemplate?: string
  queryable?: boolean
  builderKind?: ScopedQueryTarget['preferredBuilder']
  children?: ConnectionTreeNode[]
}

export function buildConnectionObjectTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  switch (connection.family) {
    case 'document':
      return documentConnectionTree(connection)
    case 'keyvalue':
      return keyValueConnectionTree(connection)
    case 'graph':
      return graphConnectionTree(connection)
    case 'timeseries':
      return timeseriesConnectionTree(connection)
    case 'widecolumn':
      return wideColumnConnectionTree(connection)
    case 'search':
      return searchConnectionTree(connection)
    case 'warehouse':
    case 'embedded-olap':
      return analyticsConnectionTree(connection)
    case 'sql':
    default:
      return sqlConnectionTree(connection)
  }
}

function sqlConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  const schema = defaultSqlSchema(connection)
  const supportsStoredRoutines = !['sqlite', 'duckdb'].includes(connection.engine)

  return [
    branch('schemas', 'Schemas', 'schemas', `${connection.engine} metadata scopes`, [
      branch(`schema-${schema}`, schema, 'schema', connection.database ?? 'default schema', [
        branch('tables', 'Tables', 'tables', 'Base tables and table-like relations', [
          leaf('table-accounts', 'accounts', 'table', 'sample table', {
            path: [connection.name, schema, 'Tables'],
            queryable: true,
            queryTemplate: sqlObjectQueryTemplate(connection, schema, 'accounts'),
          }),
          leaf('table-transactions', 'transactions', 'table', 'sample table', {
            path: [connection.name, schema, 'Tables'],
            queryable: true,
            queryTemplate: sqlObjectQueryTemplate(connection, schema, 'transactions'),
          }),
        ]),
        branch('views', 'Views', 'views', 'Saved select projections', [
          leaf('view-active-accounts', 'active_accounts', 'view', 'sample view', {
            path: [connection.name, schema, 'Views'],
            queryable: true,
            queryTemplate: sqlObjectQueryTemplate(connection, schema, 'active_accounts'),
          }),
        ]),
        supportsStoredRoutines
          ? branch('stored-procedures', 'Stored Procedures', 'stored-procedures', 'Callable routines', [
              leaf('procedure-refresh-rollups', 'refresh_rollups', 'stored-procedure', 'sample procedure'),
            ])
          : branch('triggers', 'Triggers', 'triggers', 'Local table triggers', [
              leaf('trigger-audit-updated-at', 'audit_updated_at', 'trigger', 'sample trigger'),
            ]),
        branch('indexes', 'Indexes', 'indexes', 'Secondary access paths', [
          leaf('index-accounts-email', 'accounts_email_idx', 'index', 'sample index'),
        ]),
      ]),
    ]),
  ]
}

function documentConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  const database = connection.database || (connection.engine === 'litedb' ? 'local file' : 'admin')

  return [
    branch('databases', 'Databases', 'databases', 'Document database namespaces', [
      branch(`database-${database}`, database, 'database', `${connection.engine} database`, [
        branch('collections', 'Collections', 'collections', 'Document collections', [
          documentCollectionLeaf(connection, 'products'),
          documentCollectionLeaf(connection, 'inventory'),
          documentCollectionLeaf(connection, 'orders'),
        ]),
        branch('indexes', 'Indexes', 'indexes', 'Collection index definitions', [
          leaf('index-products-sku', 'products.sku_1', 'index', 'sample index'),
        ]),
      ]),
    ]),
  ]
}

function documentCollectionLeaf(connection: ConnectionProfile, collection: string) {
  return leaf(`collection-${collection}`, collection, 'collection', 'sample collection', {
    path: [connection.name, connection.database ?? 'default', 'Collections'],
    scope: `collection:${collection}`,
    queryable: true,
    builderKind: connection.engine === 'mongodb' ? 'mongo-find' : undefined,
    queryTemplate: `{\n  "collection": "${collection}",\n  "filter": {},\n  "limit": 20\n}`,
  })
}

function sqlObjectQueryTemplate(connection: ConnectionProfile, schema: string, objectName: string) {
  if (connection.engine === 'sqlserver') {
    return `select top 100 * from ${schema}.${objectName};`
  }

  if (connection.engine === 'sqlite' || connection.engine === 'duckdb') {
    return `select * from ${objectName} limit 100;`
  }

  return `select * from ${schema}.${objectName} limit 100;`
}

function keyValueConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  if (connection.engine === 'memcached') {
    return [
      branch('namespaces', 'Namespaces', 'namespaces', 'Application key prefixes', [
        leaf('prefix-session', 'session:*', 'prefix', 'sample prefix'),
        leaf('prefix-cache', 'cache:*', 'prefix', 'sample prefix'),
      ]),
      branch('diagnostics', 'Diagnostics', 'diagnostics', 'Runtime cache metadata', [
        leaf('stats-slabs', 'slabs', 'metric', 'slab stats'),
        leaf('stats-items', 'items', 'metric', 'item stats'),
      ]),
    ]
  }

  return [
    branch('keyspaces', 'Key Spaces', 'keyspaces', 'Logical key groups and modules', [
      branch('prefixes', 'Prefixes', 'prefixes', 'SCAN-friendly key prefixes', [
        leaf('prefix-session', 'session:*', 'prefix', 'hashes'),
        leaf('prefix-cache', 'cache:*', 'prefix', 'strings'),
      ]),
      branch('streams', 'Streams', 'streams', 'Append-only event streams', [
        leaf('stream-orders', 'orders.events', 'stream', 'sample stream'),
      ]),
      branch('sets', 'Sets', 'sets', 'Set and sorted-set keys', [
        leaf('set-online-users', 'online_users', 'set', 'sample set'),
      ]),
    ]),
  ]
}

function graphConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  const database = connection.database || 'graph'

  return [
    branch('graphs', 'Graphs', 'graphs', 'Graph databases or named graphs', [
      branch(`graph-${database}`, database, 'graph', `${connection.engine} graph`, [
        branch('node-labels', 'Node Labels', 'node-labels', 'Vertex/node categories', [
          leaf('label-customer', 'Customer', 'node-label', 'sample label'),
          leaf('label-order', 'Order', 'node-label', 'sample label'),
        ]),
        branch('relationships', 'Relationship Types', 'relationships', 'Edges and relationship types', [
          leaf('rel-purchased', 'PURCHASED', 'relationship', 'sample relationship'),
        ]),
        branch('constraints', 'Indexes & Constraints', 'constraints', 'Graph lookup and uniqueness rules', [
          leaf('constraint-customer-id', 'Customer.id', 'constraint', 'sample constraint'),
        ]),
      ]),
    ]),
  ]
}

function timeseriesConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  if (connection.engine === 'prometheus') {
    return [
      branch('metrics', 'Metrics', 'metrics', 'PromQL metric families', [
        leaf('metric-up', 'up', 'metric', 'instant/range metric'),
        leaf('metric-http-duration', 'http_request_duration_seconds', 'metric', 'histogram'),
      ]),
      branch('labels', 'Labels', 'labels', 'Metric dimensions', [
        leaf('label-job', 'job', 'label', 'target label'),
        leaf('label-instance', 'instance', 'label', 'target label'),
      ]),
      branch('rules', 'Rules', 'rules', 'Alerting and recording rules', [
        leaf('rule-slo-burn', 'slo:burn_rate', 'rule', 'sample recording rule'),
      ]),
    ]
  }

  return [
    branch('buckets', 'Buckets', 'buckets', 'Time-series storage scopes', [
      branch('bucket-telemetry', 'telemetry', 'bucket', `${connection.engine} bucket`, [
        branch('measurements', 'Measurements', 'measurements', 'Series measurement names', [
          leaf('measurement-cpu', 'cpu_usage', 'measurement', 'sample measurement'),
          leaf('measurement-memory', 'memory_usage', 'measurement', 'sample measurement'),
        ]),
        branch('retention', 'Retention Policies', 'retention-policies', 'Data retention rules', [
          leaf('retention-thirty-days', '30d', 'retention-policy', 'sample policy'),
        ]),
      ]),
    ]),
  ]
}

function wideColumnConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  if (connection.engine === 'dynamodb') {
    return [
      branch('tables', 'Tables', 'tables', 'DynamoDB tables', [
        branch('table-orders', 'Orders', 'table', 'partition/sort-key table', [
          branch('indexes', 'Indexes', 'indexes', 'GSI and LSI definitions', [
            leaf('index-gsi-customer', 'GSI1CustomerOrders', 'index', 'sample GSI'),
          ]),
          branch('streams', 'Streams', 'streams', 'Change data capture', [
            leaf('stream-orders', 'Orders stream', 'stream', 'sample stream'),
          ]),
        ], {
          path: [connection.name, 'Tables'],
          queryable: true,
          builderKind: 'dynamodb-key-condition',
          queryTemplate: dynamoDbQueryTemplate('Orders'),
        }),
      ]),
    ]
  }

  return [
    branch('keyspaces', 'Keyspaces', 'keyspaces', 'Wide-column namespaces', [
      branch('keyspace-app', 'app', 'keyspace', `${connection.engine} keyspace`, [
        branch('tables', 'Tables', 'tables', 'Partition-key-first tables', [
          cassandraTableLeaf(connection, 'app', 'events_by_customer'),
          cassandraTableLeaf(connection, 'app', 'orders_by_day'),
        ]),
        branch('materialized-views', 'Materialized Views', 'materialized-views', 'Derived query tables', [
          leaf('view-orders-status', 'orders_by_status', 'materialized-view', 'sample view'),
        ]),
        branch('indexes', 'Indexes', 'indexes', 'SAI/secondary indexes', [
          leaf('index-events-type', 'events_type_idx', 'index', 'sample index'),
        ]),
      ]),
    ]),
  ]
}

function cassandraTableLeaf(connection: ConnectionProfile, keyspace: string, table: string) {
  return leaf(`table-${table}`, table, 'table', 'partition-key table', {
    path: [connection.name, keyspace, 'Tables'],
    queryable: true,
    builderKind: connection.engine === 'cassandra' ? 'cql-partition' : undefined,
    queryTemplate: `select *\nfrom ${keyspace}.${table}\nwhere customer_id = 'CUSTOMER#123'\nlimit 20;`,
  })
}

function dynamoDbQueryTemplate(table: string) {
  return JSON.stringify(
    {
      operation: 'Query',
      tableName: table,
      keyConditionExpression: '#pk = :pk',
      expressionAttributeNames: { '#pk': 'pk' },
      expressionAttributeValues: { ':pk': { S: 'CUSTOMER#123' } },
      limit: 20,
    },
    null,
    2,
  )
}

function searchConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  return [
    branch('indices', 'Indices', 'indices', `${connection.engine} searchable indices`, [
      searchIndexLeaf(connection, 'products'),
      searchIndexLeaf(connection, 'events-*'),
    ]),
    branch('data-streams', 'Data Streams', 'data-streams', 'Append-oriented streams', [
      searchIndexLeaf(connection, 'logs-app-default', 'data-stream'),
    ]),
    branch('mappings', 'Mappings', 'mappings', 'Field mappings and analyzers', [
      leaf('mapping-products', 'products mapping', 'mapping', 'sample mapping'),
    ]),
  ]
}

function searchIndexLeaf(
  connection: ConnectionProfile,
  index: string,
  kind: 'index' | 'data-stream' = 'index',
) {
  return leaf(`${kind}-${index}`, index, kind, kind === 'index' ? 'sample index' : 'sample stream', {
    path: [connection.name, kind === 'index' ? 'Indices' : 'Data Streams'],
    queryable: true,
    builderKind: 'search-dsl',
    queryTemplate: searchDslQueryTemplate(index),
  })
}

function searchDslQueryTemplate(index: string) {
  return JSON.stringify(
    {
      index,
      body: {
        query: { match_all: {} },
        size: 20,
      },
    },
    null,
    2,
  )
}

function analyticsConnectionTree(connection: ConnectionProfile): ConnectionTreeNode[] {
  const dataset = connection.database || (connection.engine === 'bigquery' ? 'analytics' : 'public')
  const topLabel = connection.engine === 'bigquery' ? 'Datasets' : 'Schemas'
  const topKind = connection.engine === 'bigquery' ? 'datasets' : 'schemas'

  return [
    branch(topKind, topLabel, topKind, 'Analytical object namespaces', [
      branch(`dataset-${dataset}`, dataset, connection.engine === 'bigquery' ? 'dataset' : 'schema', `${connection.engine} namespace`, [
        branch('tables', 'Tables', 'tables', 'Columnar/warehouse tables', [
          leaf('table-orders', 'fact_orders', 'table', 'sample table'),
          leaf('table-customers', 'dim_customers', 'table', 'sample table'),
        ]),
        branch('views', 'Views', 'views', 'Saved analytical projections', [
          leaf('view-daily-sales', 'daily_sales', 'view', 'sample view'),
        ]),
        branch('jobs', 'Jobs & Tasks', 'jobs', 'Warehouse jobs, tasks, or scheduled queries', [
          leaf('job-refresh-rollups', 'refresh_rollups', 'job', 'sample job'),
        ]),
      ]),
    ]),
  ]
}

function defaultSqlSchema(connection: ConnectionProfile) {
  if (connection.engine === 'sqlite' || connection.engine === 'duckdb') {
    return 'main'
  }

  if (connection.engine === 'mysql' || connection.engine === 'mariadb') {
    return connection.database || 'default'
  }

  if (connection.engine === 'sqlserver') {
    return 'dbo'
  }

  return 'public'
}

function branch(
  id: string,
  label: string,
  kind: string,
  detail: string,
  children: ConnectionTreeNode[],
  options: Partial<ConnectionTreeNode> = {},
): ConnectionTreeNode {
  return { id, label, kind, detail, children, ...options }
}

function leaf(
  id: string,
  label: string,
  kind: string,
  detail: string,
  options: Partial<ConnectionTreeNode> = {},
): ConnectionTreeNode {
  return { id, label, kind, detail, ...options }
}
