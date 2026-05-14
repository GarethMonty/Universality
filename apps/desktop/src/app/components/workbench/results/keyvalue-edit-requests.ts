import type {
  ConnectionProfile,
  DataEditExecutionRequest,
  DataEditKind,
} from '@datapadplusplus/shared-types'
import type { DocumentEditContext } from './document-edit-context'
import { parseJsonValue } from './json-utils'

export function keyValueCanEdit(
  connection?: ConnectionProfile,
  editContext?: DocumentEditContext,
) {
  return Boolean(
    connection &&
      editContext &&
      (connection.engine === 'redis' || connection.engine === 'valkey') &&
      !connection.readOnly,
  )
}

export function buildKeyValueEditRequest({
  connection,
  editContext,
  editKind,
  key,
  value,
}: {
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  editKind: Extract<DataEditKind, 'set-key-value' | 'set-ttl' | 'delete-key'>
  key: string
  value?: unknown
}): DataEditExecutionRequest | undefined {
  if (!keyValueCanEdit(connection, editContext) || !editContext) {
    return undefined
  }

  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind,
    confirmationText: editKind === 'delete-key'
      ? keyValueConfirmationText(connection!, editKind)
      : undefined,
    target: {
      objectKind: 'key',
      path: [],
      key,
    },
    changes:
      editKind === 'delete-key'
        ? []
        : [
            {
              value,
              valueType: valueTypeName(value),
            },
          ],
  }
}

export function parseKeyValueInput(value: string) {
  return parseJsonValue(value)
}

export function keyValueConfirmationText(
  connection: ConnectionProfile,
  editKind: 'delete-key',
) {
  return `CONFIRM ${connection.engine.toUpperCase()} ${editKind.toUpperCase()}`
}

export function valueTypeName(value: unknown) {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  return typeof value
}
