import type {
  ConnectionProfile,
  DataEditExecutionRequest,
} from '@datapadplusplus/shared-types'
import type { DocumentEditContext } from './document-edit-context'
import { valueTypeName } from './document-edit-requests'

export interface SqlTableTarget {
  schema?: string
  table: string
}

export function buildTableCellEditRequest({
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
  if (!connection || !editContext || connection.family !== 'sql' || connection.readOnly) {
    return undefined
  }

  const target = parseSqlTableTarget(editContext.queryText)
  const field = columns[columnIndex]

  if (!target || !field) {
    return undefined
  }

  const primaryKeyColumn = inferPrimaryKeyColumn(columns, target.table)
  const primaryKeyIndex = primaryKeyColumn ? columns.indexOf(primaryKeyColumn) : -1

  if (!primaryKeyColumn || primaryKeyIndex < 0 || primaryKeyIndex === columnIndex) {
    return undefined
  }

  const primaryKey = primaryKeyPredicate(columns, row, target.table)

  if (!primaryKey) {
    return undefined
  }

  const coercedValue = coerceSqlCellValue(value)

  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind: 'update-row',
    target: {
      objectKind: 'row',
      path: [],
      schema: target.schema,
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

export function buildTableRowDeleteRequest({
  columns,
  connection,
  editContext,
  row,
}: {
  columns: string[]
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  row: string[]
}): DataEditExecutionRequest | undefined {
  if (!connection || !editContext || connection.family !== 'sql' || connection.readOnly) {
    return undefined
  }

  const target = parseSqlTableTarget(editContext.queryText)

  if (!target) {
    return undefined
  }

  const primaryKey = primaryKeyPredicate(columns, row, target.table)

  if (!primaryKey) {
    return undefined
  }

  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind: 'delete-row',
    confirmationText: dataEditConfirmationText(connection, 'delete-row'),
    target: {
      objectKind: 'row',
      path: [],
      schema: target.schema,
      table: target.table,
      primaryKey,
    },
    changes: [],
  }
}

export function buildTableRowInsertRequest({
  columns,
  connection,
  editContext,
  row,
}: {
  columns: string[]
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  row: string[]
}): DataEditExecutionRequest | undefined {
  if (!connection || !editContext || connection.family !== 'sql' || connection.readOnly) {
    return undefined
  }

  const target = parseSqlTableTarget(editContext.queryText)

  if (!target) {
    return undefined
  }

  const changes = columns
    .map((field, index) => ({ field, value: row[index] ?? '' }))
    .filter((change) => change.field && change.value.trim() !== '')
    .map((change) => {
      const value = coerceSqlCellValue(change.value)
      return {
        field: change.field,
        value,
        valueType: valueTypeName(value),
      }
    })

  if (changes.length === 0) {
    return undefined
  }

  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind: 'insert-row',
    target: {
      objectKind: 'row',
      path: [],
      schema: target.schema,
      table: target.table,
    },
    changes,
  }
}

export function parseSqlTableTarget(queryText: string): SqlTableTarget | undefined {
  const normalized = queryText.replace(/--.*$/gm, ' ')
  const fromMatch = /\bfrom\s+(.+?)(?:\s+where\b|\s+order\s+by\b|\s+group\s+by\b|\s+limit\b|\s+offset\b|\s+fetch\b|\s+for\b|;|$)/i.exec(
    normalized,
  )

  if (!fromMatch?.[1]) {
    return undefined
  }

  const tableReference = tableReferenceFromFromClause(fromMatch[1])

  if (!tableReference) {
    return undefined
  }

  const identifiers = tableReference
    .match(identifierPattern)
    ?.map(unquoteIdentifier)
    .filter(Boolean)

  if (!identifiers?.length) {
    return undefined
  }

  const table = identifiers.at(-1)
  const schema = identifiers.length > 1 ? identifiers.at(-2) : undefined

  return table ? { schema, table } : undefined
}

const identifierPattern = /(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\[(?:[^\]]|\]\])+\]|[A-Za-z_][\w$-]*)/g

function tableReferenceFromFromClause(fromClause: string) {
  const trimmed = fromClause.trim()

  if (!trimmed || trimmed.startsWith('(')) {
    return undefined
  }

  const referenceMatch =
    /^(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\[(?:[^\]]|\]\])+\]|[A-Za-z_][\w$-]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\[(?:[^\]]|\]\])+\]|[A-Za-z_][\w$-]*))*/.exec(
      trimmed,
    )

  return referenceMatch?.[0]
}

export function inferPrimaryKeyColumn(columns: string[], table: string) {
  const lowerColumns = new Map(columns.map((column) => [column.toLowerCase(), column]))
  const normalizedTable = table.toLowerCase()
  const singular = normalizedTable.endsWith('s')
    ? normalizedTable.slice(0, -1)
    : normalizedTable
  const candidates = ['id', `${normalizedTable}_id`, `${singular}_id`]

  for (const candidate of candidates) {
    const column = lowerColumns.get(candidate)
    if (column) {
      return column
    }
  }

  const idColumns = columns.filter((column) => column.toLowerCase().endsWith('_id'))
  return idColumns.length === 1 ? idColumns[0] : undefined
}

function primaryKeyPredicate(columns: string[], row: string[], table: string) {
  const primaryKeyColumn = inferPrimaryKeyColumn(columns, table)
  const primaryKeyIndex = primaryKeyColumn ? columns.indexOf(primaryKeyColumn) : -1

  if (!primaryKeyColumn || primaryKeyIndex < 0) {
    return undefined
  }

  const primaryKeyValue = row[primaryKeyIndex]

  if (primaryKeyValue === undefined || primaryKeyValue === '') {
    return undefined
  }

  return {
    [primaryKeyColumn]: coerceSqlCellValue(primaryKeyValue),
  }
}

export function coerceSqlCellValue(value: string) {
  const trimmed = value.trim()

  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null
  }

  if (trimmed.toLowerCase() === 'true') {
    return true
  }

  if (trimmed.toLowerCase() === 'false') {
    return false
  }

  if (/^-?\d+$/.test(trimmed)) {
    const numberValue = Number(trimmed)
    return Number.isSafeInteger(numberValue) ? numberValue : value
  }

  if (/^-?(?:\d+\.\d+|\d+\.|\.\d+)$/.test(trimmed)) {
    const numberValue = Number(trimmed)
    return Number.isFinite(numberValue) ? numberValue : value
  }

  return value
}

function unquoteIdentifier(identifier: string) {
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replace(/""/g, '"')
  }

  if (identifier.startsWith('`') && identifier.endsWith('`')) {
    return identifier.slice(1, -1).replace(/``/g, '`')
  }

  if (identifier.startsWith('[') && identifier.endsWith(']')) {
    return identifier.slice(1, -1).replace(/\]\]/g, ']')
  }

  return identifier
}

function dataEditConfirmationText(
  connection: ConnectionProfile,
  editKind: DataEditExecutionRequest['editKind'],
) {
  return `CONFIRM ${connection.engine.toUpperCase()} ${editKind.toUpperCase()}`
}
