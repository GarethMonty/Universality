import type { ConnectionProfile } from '@datanaut/shared-types'
import {
  DatabaseIcon,
  ExplorerIcon,
  JsonIcon,
  KeyValueIcon,
  TableIcon,
} from './icons'
import { DatastoreIcon } from './DatastoreIcon'

export function EngineIcon({ connection }: { connection: ConnectionProfile }) {
  return (
    <DatastoreIcon
      decorative={false}
      engine={connection.engine}
      label={`${connection.name} datastore icon`}
    />
  )
}

export function ExplorerNodeIcon({ kind }: { kind: string }) {
  if (
    [
      'bucket',
      'database',
      'databases',
      'dataset',
      'datasets',
      'graph',
      'graphs',
      'keyspace',
      'keyspaces',
      'namespace',
      'namespaces',
      'schema',
      'schemas',
    ].includes(kind)
  ) {
    return <DatabaseIcon className="tree-icon" />
  }

  if (
    [
      'column',
      'constraint',
      'index',
      'indexes',
      'job',
      'jobs',
      'materialized-view',
      'materialized-views',
      'stored-procedure',
      'stored-procedures',
      'table',
      'tables',
      'trigger',
      'triggers',
      'view',
      'views',
    ].includes(kind)
  ) {
    return <TableIcon className="tree-icon" />
  }

  if (
    [
      'collection',
      'collections',
      'data-stream',
      'data-streams',
      'mapping',
      'mappings',
      'sample-documents',
    ].includes(kind)
  ) {
    return <JsonIcon className="tree-icon" />
  }

  if (
    [
      'hash',
      'keyspaces',
      'prefix',
      'prefixes',
      'set',
      'sets',
      'stream',
      'streams',
      'string',
    ].includes(kind)
  ) {
    return <KeyValueIcon className="tree-icon" />
  }

  return <ExplorerIcon className="tree-icon" />
}
