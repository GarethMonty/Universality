import type { ResultPayload } from '@universality/shared-types'
import { DataGridView } from './DataGridView'
import { DocumentResultsView } from './DocumentResultsView'
import { JsonTreeView } from './JsonTreeView'
import { RawResultView } from './RawResultView'
import { parseJsonValue } from './json-utils'

export function ResultPayloadView({ payload }: { payload?: ResultPayload }) {
  if (!payload) {
    return <p className="panel-footnote">No result payload yet.</p>
  }

  if (payload.renderer === 'table') {
    return <DataGridView columns={payload.columns} rows={payload.rows} />
  }

  if (payload.renderer === 'document') {
    return <DocumentResultsView documents={payload.documents} />
  }

  if (payload.renderer === 'keyvalue') {
    return <KeyValueTreeList entries={payload.entries} />
  }

  if (payload.renderer === 'json') {
    return (
      <div className="json-tree-list">
        <JsonTreeView value={payload.value} label="result" />
      </div>
    )
  }

  if (payload.renderer === 'searchHits') {
    return <SearchHitsTree payload={payload} />
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
