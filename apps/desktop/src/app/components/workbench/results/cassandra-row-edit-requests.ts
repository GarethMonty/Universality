import type {
  ConnectionProfile,
  DataEditExecutionRequest,
} from '@datapadplusplus/shared-types'
import type { DocumentEditContext } from './document-edit-context'
import { valueTypeName } from './document-edit-requests'
import { coerceSqlCellValue } from './table-edit-requests'

export interface CassandraTableTarget {
  keyspace?: string
  table: string
}

export function buildCassandraRowCellEditRequest({
  columnIndex,
  columns,
  connection,
  editContext,
  row,
  value,
}: {
  columnIndex: number
  columns: string[]
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  row: string[]
  value: string
}): DataEditExecutionRequest | undefined {
  if (!connection || !editContext || !canEditCassandra(connection)) {
    return undefined
  }

  const target = parseCassandraTableTarget(editContext.queryText)
  const field = columns[columnIndex]
  const primaryKey = inferCassandraPrimaryKey(columns, row, target?.table, editContext.queryText)

  if (!target || !field || !primaryKey || primaryKey[field] !== undefined) {
    return undefined
  }

  const coercedValue = coerceCassandraCellValue(value)
  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind: 'update-row',
    target: {
      objectKind: 'row',
      path: [],
      schema: target.keyspace,
      table: target.table,
      primaryKey,
    },
    changes: [
      {
        field,
        value: coercedValue,
        valueType: valueTypeName(coercedValue),
      },
    ],
  }
}

export function parseCassandraTableTarget(queryText: string): CassandraTableTarget | undefined {
  const normalized = queryText.replace(/--.*$/gm, ' ')
  const fromMatch = /\bfrom\s+(.+?)(?:\s+where\b|\s+limit\b|\s+allow\s+filtering\b|;|$)/i.exec(
    normalized,
  )
  const reference = fromMatch?.[1] ? cqlReferenceFromFromClause(fromMatch[1]) : undefined

  if (!reference) {
    return undefined
  }

  const identifiers = cqlIdentifiers(reference)

  if (!identifiers.length) {
    return undefined
  }

  const table = identifiers.at(-1)
  const keyspace = identifiers.length > 1 ? identifiers.at(-2) : undefined

  return table ? { keyspace, table } : undefined
}

export function inferCassandraPrimaryKey(
  columns: string[],
  row: string[],
  table: string | undefined,
  queryText: string,
) {
  const equalityFields = cqlEqualityFields(queryText)
  const keyedByWhere = keyedValues(columns, row, equalityFields)

  if (keyedByWhere) {
    return keyedByWhere
  }

  const inferredKeyColumns = inferSingleKeyColumns(columns, table)
  return keyedValues(columns, row, inferredKeyColumns)
}

export function coerceCassandraCellValue(value: string) {
  const trimmed = value.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return value
    }
  }

  return coerceSqlCellValue(value)
}

function canEditCassandra(connection: ConnectionProfile) {
  return connection.engine === 'cassandra' && connection.family === 'widecolumn' && !connection.readOnly
}

function cqlReferenceFromFromClause(fromClause: string) {
  const trimmed = fromClause.trim()

  if (!trimmed || trimmed.startsWith('(')) {
    return undefined
  }

  return /^("[^"]*(?:""[^"]*)*"|[A-Za-z_][\w$-]*)(?:\s*\.\s*("[^"]*(?:""[^"]*)*"|[A-Za-z_][\w$-]*))*/.exec(
    trimmed,
  )?.[0]
}

function cqlIdentifiers(reference: string) {
  return (
    reference
      .match(/"[^"]*(?:""[^"]*)*"|[A-Za-z_][\w$-]*/g)
      ?.map(unquoteCqlIdentifier)
      .filter(Boolean) ?? []
  )
}

function cqlEqualityFields(queryText: string) {
  const normalized = queryText.replace(/--.*$/gm, ' ')
  const whereMatch = /\bwhere\s+(.+?)(?:\s+limit\b|\s+allow\s+filtering\b|;|$)/i.exec(normalized)

  if (!whereMatch?.[1]) {
    return []
  }

  return whereMatch[1]
    .split(/\s+and\s+/i)
    .map((part) => /^("[^"]*(?:""[^"]*)*"|[A-Za-z_][\w$-]*)\s*=\s*(?![=>])/.exec(part.trim())?.[1])
    .filter((field): field is string => Boolean(field))
    .map(unquoteCqlIdentifier)
}

function inferSingleKeyColumns(columns: string[], table: string | undefined) {
  const byNormalizedName = new Map(columns.map((column) => [normalizeColumn(column), column]))
  const tableName = table ? normalizeColumn(table) : ''
  const singular = tableName.endsWith('s') ? tableName.slice(0, -1) : tableName
  const candidates = [
    'id',
    'pk',
    'partition_key',
    'key',
    tableName ? `${tableName}_id` : '',
    singular ? `${singular}_id` : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const column = byNormalizedName.get(normalizeColumn(candidate))
    if (column) {
      return [column]
    }
  }

  const idColumns = columns.filter((column) => normalizeColumn(column).endsWith('id'))
  return idColumns.length === 1 ? idColumns : []
}

function keyedValues(columns: string[], row: string[], keyColumns: string[]) {
  if (keyColumns.length === 0) {
    return undefined
  }

  const values = Object.fromEntries(
    keyColumns.map((column) => {
      const index = columns.findIndex((candidate) => candidate === column)
      return [column, index >= 0 ? row[index] : undefined]
    }),
  )
  const missing = Object.values(values).some((value) => value === undefined || value === '')

  if (missing) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(values).map(([field, fieldValue]) => [
      field,
      coerceCassandraCellValue(String(fieldValue)),
    ]),
  )
}

function normalizeColumn(value: string) {
  return value.replaceAll(/[_\s-]/g, '').toLowerCase()
}

function unquoteCqlIdentifier(identifier: string) {
  return identifier.startsWith('"') && identifier.endsWith('"')
    ? identifier.slice(1, -1).replaceAll('""', '"')
    : identifier
}
