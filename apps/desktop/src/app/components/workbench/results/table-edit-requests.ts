import type {
  ConnectionProfile,
  DataEditExecutionRequest,
} from '@datanaut/shared-types'
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

  const primaryKeyValue = row[primaryKeyIndex]
  if (primaryKeyValue === undefined || primaryKeyValue === '') {
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
      primaryKey: {
        [primaryKeyColumn]: coerceSqlCellValue(primaryKeyValue),
      },
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

export function parseSqlTableTarget(queryText: string): SqlTableTarget | undefined {
  const normalized = queryText.replace(/--.*$/gm, ' ')
  const fromMatch = /\bfrom\s+(.+?)(?:\s+where\b|\s+order\s+by\b|\s+group\s+by\b|\s+limit\b|\s+offset\b|\s+fetch\b|\s+for\b|;|$)/i.exec(
    normalized,
  )

  if (!fromMatch?.[1]) {
    return undefined
  }

  const identifiers = fromMatch[1]
    .trim()
    .match(/(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\[(?:[^\]]|\]\])+\]|[A-Za-z_][\w$-]*)/g)
    ?.map(unquoteIdentifier)
    .filter(Boolean)

  if (!identifiers?.length) {
    return undefined
  }

  const table = identifiers.at(-1)
  const schema = identifiers.length > 1 ? identifiers.at(-2) : undefined

  return table ? { schema, table } : undefined
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
