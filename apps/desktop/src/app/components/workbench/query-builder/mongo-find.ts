import type {
  MongoBuilderValueType,
  MongoFilterOperator,
  MongoFindBuilderState,
  MongoFindFilterRow,
  QueryBuilderState,
} from '@universality/shared-types'

const OPERATOR_MAP: Record<Exclude<MongoFilterOperator, 'eq'>, string> = {
  ne: '$ne',
  gt: '$gt',
  gte: '$gte',
  lt: '$lt',
  lte: '$lte',
  regex: '$regex',
  exists: '$exists',
  in: '$in',
}

export function createDefaultMongoFindBuilderState(
  collection: string,
  limit = 50,
): MongoFindBuilderState {
  const queryText = buildMongoFindQueryText({
    kind: 'mongo-find',
    collection,
    filters: [],
    projectionMode: 'all',
    projectionFields: [],
    sort: [],
    skip: 0,
    limit,
  })

  return {
    kind: 'mongo-find',
    collection,
    filters: [],
    projectionMode: 'all',
    projectionFields: [],
    sort: [],
    skip: 0,
    limit,
    lastAppliedQueryText: queryText,
  }
}

export function isMongoFindBuilderState(
  state: QueryBuilderState | undefined,
): state is MongoFindBuilderState {
  return state?.kind === 'mongo-find'
}

export function buildMongoFindQueryText(state: MongoFindBuilderState): string {
  const query: Record<string, unknown> = {
    collection: state.collection.trim(),
    filter: buildMongoFilter(state.filters),
  }
  const projection = buildMongoProjection(state)
  const sort = buildMongoSort(state)

  if (projection) {
    query.projection = projection
  }

  if (sort) {
    query.sort = sort
  }

  if (state.skip && state.skip > 0) {
    query.skip = Math.floor(state.skip)
  }

  if (state.limit && state.limit > 0) {
    query.limit = Math.floor(state.limit)
  }

  return JSON.stringify(query, null, 2)
}

export function parseMongoFindQueryText(queryText: string): MongoFindBuilderState | undefined {
  let parsed: unknown

  try {
    parsed = JSON.parse(queryText)
  } catch {
    return undefined
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined
  }

  const query = parsed as Record<string, unknown>
  const collection = typeof query.collection === 'string' ? query.collection : ''
  const filters = filterRowsFromQuery(query.filter)
  const projection = projectionFromQuery(query.projection)

  return {
    kind: 'mongo-find',
    collection,
    filters,
    projectionMode: projection.mode,
    projectionFields: projection.fields,
    sort: sortRowsFromQuery(query.sort),
    skip: numberOrUndefined(query.skip) ?? 0,
    limit: numberOrUndefined(query.limit) ?? 50,
    lastAppliedQueryText: queryText,
  }
}

export function buildMongoFilter(rows: MongoFindFilterRow[]): Record<string, unknown> {
  const filter: Record<string, unknown> = {}

  for (const row of rows) {
    const field = row.field.trim()

    if (!field) {
      continue
    }

    const value = coerceMongoValue(row.value, row.valueType, row.operator)

    if (row.operator === 'eq') {
      filter[field] = value
      continue
    }

    const operator = OPERATOR_MAP[row.operator]
    const existing = filter[field]
    const operatorExpression =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {}

    operatorExpression[operator] = value
    filter[field] = operatorExpression
  }

  return filter
}

function buildMongoProjection(
  state: MongoFindBuilderState,
): Record<string, 0 | 1> | undefined {
  if (state.projectionMode === 'all') {
    return undefined
  }

  const fields = state.projectionFields
    .map((field) => field.field.trim())
    .filter(Boolean)

  if (fields.length === 0) {
    return undefined
  }

  const value = state.projectionMode === 'include' ? 1 : 0
  return Object.fromEntries(fields.map((field) => [field, value]))
}

function buildMongoSort(state: MongoFindBuilderState): Record<string, 1 | -1> | undefined {
  const rows = state.sort
    .map((row) => [row.field.trim(), row.direction === 'asc' ? 1 : -1] as const)
    .filter(([field]) => Boolean(field))

  return rows.length > 0 ? Object.fromEntries(rows) : undefined
}

function coerceMongoValue(
  value: string,
  valueType: MongoBuilderValueType,
  operator: MongoFilterOperator,
): unknown {
  if (operator === 'exists') {
    return parseBoolean(value, true)
  }

  if (operator === 'in') {
    return parseInValue(value, valueType)
  }

  if (valueType === 'null') {
    return null
  }

  if (valueType === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }

  if (valueType === 'boolean') {
    return parseBoolean(value, false)
  }

  if (valueType === 'json') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  return value
}

function parseInValue(value: string, valueType: MongoBuilderValueType): unknown[] {
  if (valueType === 'json') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return [value]
    }
  }

  return value
    .split(',')
    .map((part) => coerceMongoValue(part.trim(), valueType, 'eq'))
    .filter((part) => part !== '')
}

function parseBoolean(value: string, fallback: boolean) {
  const normalized = value.trim().toLowerCase()

  if (['true', '1', 'yes'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false
  }

  return fallback
}

function filterRowsFromQuery(filter: unknown): MongoFindBuilderState['filters'] {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    return []
  }

  return Object.entries(filter as Record<string, unknown>).flatMap(([field, value]) => {
    if (isPlainObject(value)) {
      const operators = Object.entries(value)
        .map(([operator, operatorValue]) => filterRowForOperator(field, operator, operatorValue))
        .filter(Boolean)
      return operators as MongoFindBuilderState['filters']
    }

    return [
      {
        id: rowId('filter'),
        field,
        operator: 'eq',
        value: valueToBuilderInput(value),
        valueType: valueTypeForBuilder(value),
      },
    ]
  })
}

function filterRowForOperator(field: string, operator: string, value: unknown) {
  const operatorMap: Record<string, MongoFilterOperator> = {
    $ne: 'ne',
    $gt: 'gt',
    $gte: 'gte',
    $lt: 'lt',
    $lte: 'lte',
    $regex: 'regex',
    $exists: 'exists',
    $in: 'in',
  }
  const builderOperator = operatorMap[operator]

  if (!builderOperator) {
    return undefined
  }

  return {
    id: rowId('filter'),
    field,
    operator: builderOperator,
    value: builderOperator === 'in' && Array.isArray(value)
      ? value.map(valueToBuilderInput).join(', ')
      : valueToBuilderInput(value),
    valueType: valueTypeForBuilder(value),
  }
}

function projectionFromQuery(projection: unknown): {
  mode: MongoFindBuilderState['projectionMode']
  fields: MongoFindBuilderState['projectionFields']
} {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    return { mode: 'all', fields: [] }
  }

  const entries = Object.entries(projection as Record<string, unknown>).filter(([field]) =>
    Boolean(field.trim()),
  )

  if (entries.length === 0) {
    return { mode: 'all', fields: [] }
  }

  const includeCount = entries.filter(([, value]) => Number(value) === 1).length
  const mode = includeCount >= entries.length / 2 ? 'include' : 'exclude'

  return {
    mode,
    fields: entries.map(([field]) => ({ id: rowId('projection'), field })),
  }
}

function sortRowsFromQuery(sort: unknown): MongoFindBuilderState['sort'] {
  if (!sort || typeof sort !== 'object' || Array.isArray(sort)) {
    return []
  }

  return Object.entries(sort as Record<string, unknown>)
    .filter(([field]) => Boolean(field.trim()))
    .map(([field, direction]) => ({
      id: rowId('sort'),
      field,
      direction: Number(direction) === -1 ? 'desc' : 'asc',
    }))
}

function valueTypeForBuilder(value: unknown): MongoBuilderValueType {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (typeof value === 'object') {
    return 'json'
  }

  return 'string'
}

function valueToBuilderInput(value: unknown) {
  if (value === null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rowId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
