import type { ConnectionProfile, ResultPayload } from '@datanaut/shared-types'
import { DataGridView } from './DataGridView'
import { DocumentResultsView } from './DocumentResultsView'
import { JsonTreeView } from './JsonTreeView'
import { RawResultView } from './RawResultView'
import { parseJsonValue } from './json-utils'

export function ResultPayloadView({
  connection,
  pageIndex = 0,
  pageSize,
  payload,
  resultDurationMs,
  resultSummary,
}: {
  connection?: ConnectionProfile
  pageIndex?: number
  pageSize?: number
  payload?: ResultPayload
  resultDurationMs?: number
  resultSummary?: string
}) {
  if (!payload) {
    return <p className="panel-footnote">No result payload yet.</p>
  }

  if (payload.renderer === 'table') {
    return (
      <DataGridView
        columns={payload.columns}
        rows={sliceItems(payload.rows, pageIndex, pageSize)}
      />
    )
  }

  if (payload.renderer === 'document') {
    return (
      <DocumentResultsView
        key={documentPayloadKey(payload.documents)}
        connection={connection}
        documents={sliceItems(payload.documents, pageIndex, pageSize)}
        resultDurationMs={resultDurationMs}
        resultSummary={resultSummary}
        totalDocumentCount={payload.documents.length}
      />
    )
  }

  if (payload.renderer === 'keyvalue') {
    return <KeyValueTreeList entries={sliceRecord(payload.entries, pageIndex, pageSize)} />
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
      <SearchHitsTree
        payload={{
          ...payload,
          hits: sliceItems(payload.hits, pageIndex, pageSize),
        }}
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

function KeyValueTreeList({ entries }: { entries: Record<string, string> }) {
  return (
    <div className="json-tree-list" aria-label="Key-value results">
      {Object.entries(entries).map(([key, value]) => (
        <JsonTreeView key={key} value={parseJsonValue(value)} label={key} />
      ))}
    </div>
  )
}

function SearchHitsTree({ payload }: { payload: Extract<ResultPayload, { renderer: 'searchHits' }> }) {
  const treeValue = {
    total: payload.total,
    hits: payload.hits.map((hit, index) => ({
      id: hit.id ?? `hit-${index + 1}`,
      score: hit.score,
      source: hit.source,
      highlights: hit.highlights,
    })),
    aggregations: payload.aggregations,
  }

  return (
    <div className="json-tree-list">
      <JsonTreeView value={treeValue} label="search hits" />
    </div>
  )
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
