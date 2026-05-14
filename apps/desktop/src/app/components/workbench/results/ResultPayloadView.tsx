import type {
  ConnectionProfile,
  DataEditExecutionRequest,
  DataEditExecutionResponse,
  ResultPayload,
} from '@datapadplusplus/shared-types'
import type { ReactNode } from 'react'
import { DataGridView } from './DataGridView'
import type { DocumentEditContext } from './document-edit-context'
import { DocumentResultsView } from './DocumentResultsView'
import { JsonTreeView } from './JsonTreeView'
import { KeyValueResultsView } from './KeyValueResultsView'
import { RawResultView } from './RawResultView'
import { SearchHitsResultsView } from './SearchHitsResultsView'

export function ResultPayloadView({
  connection,
  pageIndex = 0,
  pageSize,
  payload,
  resultDurationMs,
  resultSummary,
  editContext,
  documentFooterControls,
  onExecuteDataEdit,
}: {
  connection?: ConnectionProfile
  documentFooterControls?: ReactNode
  editContext?: DocumentEditContext
  pageIndex?: number
  pageSize?: number
  payload?: ResultPayload
  resultDurationMs?: number
  resultSummary?: string
  onExecuteDataEdit?(
    request: DataEditExecutionRequest,
  ): Promise<DataEditExecutionResponse | undefined>
}) {
  if (!payload) {
    return <p className="panel-footnote">No result payload yet.</p>
  }

  if (payload.renderer === 'table') {
    return (
      <DataGridView
        connection={connection}
        editContext={editContext}
        columns={payload.columns}
        rows={sliceItems(payload.rows, pageIndex, pageSize)}
        onExecuteDataEdit={onExecuteDataEdit}
      />
    )
  }

  if (payload.renderer === 'document') {
    return (
      <DocumentResultsView
        key={documentPayloadKey(payload.documents)}
        connection={connection}
        editContext={editContext}
        documents={sliceItems(payload.documents, pageIndex, pageSize)}
        footerControls={documentFooterControls}
        resultDurationMs={resultDurationMs}
        resultSummary={resultSummary}
        totalDocumentCount={payload.documents.length}
        onExecuteDataEdit={onExecuteDataEdit}
      />
    )
  }

  if (payload.renderer === 'keyvalue') {
    return (
      <KeyValueResultsView
        key={keyValuePayloadKey(payload.entries)}
        connection={connection}
        editContext={editContext}
        entries={sliceRecord(payload.entries, pageIndex, pageSize)}
        onExecuteDataEdit={onExecuteDataEdit}
      />
    )
  }

  if (payload.renderer === 'json') {
    return (
      <div className="json-tree-list">
        <JsonTreeView value={payload.value} label="result" />
      </div>
    )
  }

  if (payload.renderer === 'searchHits') {
    return (
      <SearchHitsResultsView
        key={searchHitsPayloadKey(payload.hits)}
        connection={connection}
        editContext={editContext}
        payload={{
          ...payload,
          hits: sliceItems(payload.hits, pageIndex, pageSize),
        }}
        onExecuteDataEdit={onExecuteDataEdit}
      />
    )
  }

  if (payload.renderer === 'graph') {
    return <GraphTree payload={payload} />
  }

  if (payload.renderer === 'schema') {
    return (
      <div className="details-grid">
        {payload.items.map((item) => (
          <div key={item.label} className="detail-row">
            <span>{item.label}</span>
            <strong>{item.detail}</strong>
          </div>
        ))}
      </div>
    )
  }

  return <RawResultView text={payload.renderer === 'raw' ? payload.text : JSON.stringify(payload, null, 2)} />
}


function sliceRecord(
  entries: Record<string, string>,
  pageIndex: number,
  pageSize: number | undefined,
) {
  if (!pageSize || pageSize <= 0) {
    return entries
  }

  return Object.fromEntries(
    Object.entries(entries).slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
  )
}

function sliceItems<T>(items: T[], pageIndex: number, pageSize: number | undefined) {
  if (!pageSize || pageSize <= 0) {
    return items
  }

  const start = Math.max(0, pageIndex) * pageSize
  return items.slice(start, start + pageSize)
}

function documentPayloadKey(documents: Array<Record<string, unknown>>) {
  return documents
    .map((document, index) => {
      const id = document._id ?? document.id ?? document.key
      return `${index}:${typeof id === 'string' || typeof id === 'number' ? id : Object.keys(document).join(',')}`
    })
    .join('|')
}

function keyValuePayloadKey(entries: Record<string, string>) {
  return Object.entries(entries)
    .map(([key, value]) => `${key}:${value}`)
    .join('|')
}

function searchHitsPayloadKey(hits: Extract<ResultPayload, { renderer: 'searchHits' }>['hits']) {
  return hits
    .map((hit, index) => {
      const rawHit = hit as typeof hit & { _id?: string; _source?: unknown }
      return `${index}:${hit.id ?? rawHit._id ?? JSON.stringify(hit.source ?? rawHit._source)}`
    })
    .join('|')
}

function GraphTree({ payload }: { payload: Extract<ResultPayload, { renderer: 'graph' }> }) {
  return (
    <div className="json-tree-list">
      <JsonTreeView
        value={{
          nodes: payload.nodes,
          edges: payload.edges,
        }}
        label="graph"
      />
    </div>
  )
}
