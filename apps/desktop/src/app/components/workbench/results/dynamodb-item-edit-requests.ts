import type {
  ConnectionProfile,
  DataEditExecutionRequest,
} from '@datanaut/shared-types'
import type { DocumentEditContext } from './document-edit-context'
import { valueTypeName } from './document-edit-requests'

export function buildDynamoDbItemCellEditRequest({
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
  if (!connection || !editContext || !canEditDynamoDb(connection)) {
    return undefined
  }

  const table = parseDynamoDbTableName(editContext.queryText)
  const field = columns[columnIndex]
  const itemKey = inferDynamoDbItemKey(columns, row)

  if (!table || !field || !itemKey || itemKey[field] !== undefined) {
    return undefined
  }

  const coercedValue = coerceDynamoDbCellValue(value)
  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind: 'update-item',
    target: {
      objectKind: 'item',
      path: [],
      table,
      itemKey,
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

export function buildDynamoDbItemDeleteRequest({
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
  if (!connection || !editContext || !canEditDynamoDb(connection)) {
    return undefined
  }

  const table = parseDynamoDbTableName(editContext.queryText)
  const itemKey = inferDynamoDbItemKey(columns, row)

  if (!table || !itemKey) {
    return undefined
  }

  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind: 'delete-item',
    confirmationText: `CONFIRM ${connection.engine.toUpperCase()} DELETE-ITEM`,
    target: {
      objectKind: 'item',
      path: [],
      table,
      itemKey,
    },
    changes: [],
  }
}

export function buildDynamoDbItemPutRequest({
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
  if (!connection || !editContext || !canEditDynamoDb(connection)) {
    return undefined
  }

  const table = parseDynamoDbTableName(editContext.queryText)
  const itemKey = inferDynamoDbItemKey(columns, row)

  if (!table || !itemKey) {
    return undefined
  }

  const changes = columns
    .map((field, index) => ({ field, value: row[index] ?? '' }))
    .filter((change) => change.field && change.value.trim() !== '')
    .map((change) => {
      const value = coerceDynamoDbCellValue(change.value)
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
    editKind: 'put-item',
    target: {
      objectKind: 'item',
      path: [],
      table,
      itemKey,
    },
    changes,
  }
}

export function parseDynamoDbTableName(queryText: string) {
  const parsed = parseJsonObject(queryText)
  const tableName = firstStringValue(parsed, ['TableName', 'tableName', 'table', 'Table'])

  if (tableName) {
    return tableName
  }

  return /["'](?:TableName|tableName|table|Table)["']\s*:\s*["']([^"']+)["']/.exec(
    queryText,
  )?.[1]
}

export function inferDynamoDbItemKey(columns: string[], row: string[]) {
  const partitionKey = findColumn(columns, [
    'pk',
    'partitionKey',
    'partition_key',
    'hashKey',
    'hash_key',
    'id',
    'key',
  ])
  const sortKey = findColumn(columns, ['sk', 'sortKey', 'sort_key', 'rangeKey', 'range_key'])

  if (!partitionKey) {
    return undefined
  }

  const partitionValue = valueForColumn(columns, row, partitionKey)

  if (partitionValue === undefined || partitionValue === '') {
    return undefined
  }

  const key: Record<string, unknown> = {
    [partitionKey]: coerceDynamoDbCellValue(partitionValue),
  }
  const sortValue = sortKey ? valueForColumn(columns, row, sortKey) : undefined

  if (sortKey && sortValue !== undefined && sortValue !== '') {
    key[sortKey] = coerceDynamoDbCellValue(sortValue)
  }

  return key
}

export function coerceDynamoDbCellValue(value: string) {
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

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return value
    }
  }

  return value
}

function canEditDynamoDb(connection: ConnectionProfile) {
  return connection.engine === 'dynamodb' && !connection.readOnly
}

function parseJsonObject(queryText: string) {
  try {
    const parsed = JSON.parse(queryText) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function firstStringValue(
  object: Record<string, unknown> | undefined,
  keys: string[],
) {
  for (const key of keys) {
    const value = object?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return undefined
}

function findColumn(columns: string[], candidates: string[]) {
  const byLower = new Map(columns.map((column) => [normalizeKeyName(column), column]))

  for (const candidate of candidates) {
    const column = byLower.get(normalizeKeyName(candidate))
    if (column) {
      return column
    }
  }

  return undefined
}

function valueForColumn(columns: string[], row: string[], column: string) {
  const index = columns.indexOf(column)
  return index >= 0 ? row[index] : undefined
}

function normalizeKeyName(value: string) {
  return value.replaceAll(/[_\s-]/g, '').toLowerCase()
}
