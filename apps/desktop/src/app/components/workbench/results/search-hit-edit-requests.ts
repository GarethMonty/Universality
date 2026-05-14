import type {
  ConnectionProfile,
  DataEditExecutionRequest,
  DataEditKind,
  ResultPayload,
} from '@datapadplusplus/shared-types'
import type { DocumentEditContext } from './document-edit-context'

export type SearchHit = Extract<ResultPayload, { renderer: 'searchHits' }>['hits'][number] & {
  _id?: string
  _index?: string
  _score?: number
  _source?: Record<string, unknown>
}

export function searchCanEdit(
  connection?: ConnectionProfile,
  editContext?: DocumentEditContext,
) {
  return Boolean(
    connection &&
      editContext &&
      (connection.engine === 'elasticsearch' || connection.engine === 'opensearch') &&
      !connection.readOnly,
  )
}

export function buildSearchDocumentEditRequest({
  connection,
  editContext,
  editKind,
  hit,
  source,
}: {
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  editKind: Extract<DataEditKind, 'update-document' | 'delete-document'>
  hit: SearchHit
  source?: Record<string, unknown>
}): DataEditExecutionRequest | undefined {
  if (!searchCanEdit(connection, editContext) || !editContext) {
    return undefined
  }

  const index = searchHitIndex(hit, editContext)
  const documentId = searchHitId(hit)

  if (!index || !documentId) {
    return undefined
  }

  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind,
    confirmationText:
      editKind === 'delete-document'
        ? searchConfirmationText(connection!, editKind)
        : undefined,
    target: {
      objectKind: 'document',
      path: [],
      table: index,
      documentId,
    },
    changes:
      editKind === 'delete-document'
        ? []
        : Object.entries(source ?? searchHitSource(hit)).map(([field, value]) => ({
            field,
            value,
            valueType: valueTypeName(value),
          })),
  }
}

export function buildSearchDocumentIndexRequest({
  connection,
  documentId,
  editContext,
  index,
  source,
}: {
  connection?: ConnectionProfile
  documentId: string
  editContext?: DocumentEditContext
  index?: string
  source: Record<string, unknown>
}): DataEditExecutionRequest | undefined {
  if (!searchCanEdit(connection, editContext) || !editContext) {
    return undefined
  }

  const targetIndex = index?.trim() || searchIndexFromQueryText(editContext.queryText)
  const targetDocumentId = documentId.trim()

  if (!targetIndex || !targetDocumentId) {
    return undefined
  }

  return {
    connectionId: editContext.connectionId,
    environmentId: editContext.environmentId,
    editKind: 'index-document',
    target: {
      objectKind: 'document',
      path: [],
      table: targetIndex,
      documentId: targetDocumentId,
    },
    changes: Object.entries(source).map(([field, value]) => ({
      field,
      value,
      valueType: valueTypeName(value),
    })),
  }
}

export function searchHitId(hit: SearchHit) {
  return hit.id ?? hit._id
}

export function searchHitIndex(hit: SearchHit | undefined, editContext?: DocumentEditContext) {
  return hit?._index ?? searchIndexFromQueryText(editContext?.queryText)
}

export function searchHitScore(hit: SearchHit) {
  return hit.score ?? hit._score
}

export function searchHitSource(hit: SearchHit) {
  return hit.source ?? hit._source ?? {}
}

export function searchConfirmationText(
  connection: ConnectionProfile,
  editKind: 'delete-document',
) {
  return `CONFIRM ${connection.engine.toUpperCase()} ${editKind.toUpperCase()}`
}

export function searchIndexFromQueryText(queryText: string | undefined) {
  if (!queryText) {
    return undefined
  }

  try {
    const parsed = JSON.parse(queryText) as { index?: unknown }
    return typeof parsed.index === 'string' && parsed.index.trim()
      ? parsed.index
      : undefined
  } catch {
    return undefined
  }
}

function valueTypeName(value: unknown) {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  return typeof value
}
