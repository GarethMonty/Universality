import type {
  MongoBuilderValueType,
  MongoFindBuilderState,
  MongoFilterOperator,
} from '@datapadplusplus/shared-types'
import {
  DEFAULT_FILTER_GROUP_ID,
  mongoBuilderRowId,
} from './mongo-find-defaults'

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
    filters: filters.map((filter) => ({
      ...filter,
      enabled: filter.enabled ?? true,
      groupId: filter.groupId ?? DEFAULT_FILTER_GROUP_ID,
    })),
    filterGroups: [],
    projectionMode: projection.mode,
    projectionFields: projection.fields,
    sort: sortRowsFromQuery(query.sort),
    skip: numberOrUndefined(query.skip) ?? 0,
    limit: numberOrUndefined(query.limit) ?? 20,
    lastAppliedQueryText: queryText,
  }
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
        id: mongoBuilderRowId('filter'),
        enabled: true,
        field,
        groupId: DEFAULT_FILTER_GROUP_ID,
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
    id: mongoBuilderRowId('filter'),
    enabled: true,
    field,
    groupId: DEFAULT_FILTER_GROUP_ID,
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
    fields: entries.map(([field]) => ({ id: mongoBuilderRowId('projection'), field })),
  }
}

function sortRowsFromQuery(sort: unknown): MongoFindBuilderState['sort'] {
  if (!sort || typeof sort !== 'object' || Array.isArray(sort)) {
    return []
  }

  return Object.entries(sort as Record<string, unknown>)
    .filter(([field]) => Boolean(field.trim()))
    .map(([field, direction]) => ({
      id: mongoBuilderRowId('sort'),
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
