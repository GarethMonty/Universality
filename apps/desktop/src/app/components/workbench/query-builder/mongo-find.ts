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
