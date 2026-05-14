import type { MongoBuilderValueType } from '@datanaut/shared-types'
import type { FieldDragPayload } from '../results/field-drag'
import { rowId } from './MongoBuilderSection.types'

export function mongoFilterRow(groupId: string | undefined, field = '') {
  return {
    id: rowId('filter'),
    enabled: true,
    field,
    groupId,
    operator: 'eq' as const,
    value: '',
    valueType: 'string' as const,
  }
}

export function mongoFilterRowFromDroppedField(
  groupId: string | undefined,
  field: string,
  payload: FieldDragPayload,
) {
  const valueType = mongoBuilderValueType(payload.value, payload.valueType)

  return {
    ...mongoFilterRow(groupId, field),
    value: mongoBuilderValue(payload.value, valueType),
    valueType,
  }
}

function mongoBuilderValueType(
  value: unknown,
  dragValueType: string | undefined,
): MongoBuilderValueType {
  if (dragValueType === 'number' || typeof value === 'number') {
    return 'number'
  }

  if (dragValueType === 'boolean' || typeof value === 'boolean') {
    return 'boolean'
  }

  if (dragValueType === 'null' || value === null) {
    return 'null'
  }

  if (
    dragValueType === 'object' ||
    dragValueType === 'array' ||
    (typeof value === 'object' && value !== null)
  ) {
    return 'json'
  }

  return 'string'
}

function mongoBuilderValue(value: unknown, valueType: MongoBuilderValueType) {
  if (valueType === 'null') {
    return ''
  }

  if (valueType === 'json') {
    return JSON.stringify(value ?? null)
  }

  return value === undefined || value === null ? '' : String(value)
}
