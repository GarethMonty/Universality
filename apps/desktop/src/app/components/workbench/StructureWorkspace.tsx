import { useMemo, useState } from 'react'
import type {
  ConnectionProfile,
  EnvironmentProfile,
  StructureNode,
  StructureResponse,
  UiState,
} from '@universality/shared-types'
import {
  DatabaseIcon,
  ExplorerIcon,
  JsonIcon,
  KeyValueIcon,
  RefreshIcon,
  SearchIcon,
  TableIcon,
} from './icons'

interface StructureWorkspaceProps {
  activeConnection?: ConnectionProfile
  activeEnvironment?: EnvironmentProfile
  explorerView: UiState['explorerView']
  status: 'idle' | 'loading' | 'ready'
  structure?: StructureResponse
  error?: string
  onExplorerViewChange(view: UiState['explorerView']): void
  onRefresh(): void
  onInspectNode(node: StructureNode): void
}

export function StructureWorkspace({
  activeConnection,
  activeEnvironment,
  explorerView,
  status,
  structure,
  error,
  onExplorerViewChange,
  onRefresh,
  onInspectNode,
}: StructureWorkspaceProps) {
  const [filter, setFilter] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const filteredNodes = useMemo(() => {
    const needle = filter.trim().toLowerCase()

    if (!needle) {
      return structure?.nodes ?? []
    }

    return (structure?.nodes ?? []).filter((node) => {
      const haystack = `${node.label} ${node.kind} ${node.detail ?? ''} ${(node.fields ?? [])
        .map((field) => `${field.name} ${field.dataType}`)
        .join(' ')}`.toLowerCase()

      return haystack.includes(needle)
    })
  }, [filter, structure?.nodes])
  const selectedNode =
    filteredNodes.find((node) => node.id === selectedNodeId) ?? filteredNodes[0]

  return (
    <section className="structure-workspace" aria-label="Visual database structure">
      <header className="structure-header">
        <div>
          <p className="sidebar-eyebrow">Explorer</p>
          <h1>{activeConnection ? activeConnection.name : 'Database structure'}</h1>
          <p>
            {activeConnection && activeEnvironment
              ? `${activeConnection.engine} / ${activeEnvironment.label}`
              : 'Choose a connection to inspect its structure.'}
          </p>
        </div>

        <div className="structure-actions">
          <div className="structure-toggle" role="tablist" aria-label="Explorer view">
            <button
              type="button"
              role="tab"
              aria-selected={explorerView === 'tree'}
              className={`structure-toggle-button${explorerView === 'tree' ? ' is-active' : ''}`}
              title="Use the left Explorer sidebar tree for lazy object browsing."
              onClick={() => onExplorerViewChange('tree')}
            >
              Tree
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={explorerView === 'structure'}
              className={`structure-toggle-button${explorerView === 'structure' ? ' is-active' : ''}`}
              title="Show the visual structure map for schemas, collections, prefixes, and relationships."
              onClick={() => onExplorerViewChange('structure')}
            >
              Structure
            </button>
          </div>
          <button
            type="button"
            className="toolbar-action"
            disabled={!activeConnection || !activeEnvironment || status === 'loading'}
            title="Reload the visual structure map using safe bounded metadata sampling."
            onClick={onRefresh}
          >
            <RefreshIcon className="toolbar-icon" />
            Refresh
          </button>
        </div>
      </header>

      {!activeConnection || !activeEnvironment ? (
        <div className="structure-empty">
          <ExplorerIcon className="empty-icon" />
          <h2>Connect first</h2>
          <p>Create or select a connection, then Explorer can map schemas, collections, or keys.</p>
        </div>
      ) : error ? (
        <div className="structure-empty structure-empty--error">
          <ExplorerIcon className="empty-icon" />
          <h2>Structure unavailable</h2>
          <p>{error}</p>
        </div>
      ) : explorerView === 'tree' ? (
        <div className="structure-empty">
          <ExplorerIcon className="empty-icon" />
          <h2>Tree view is in the sidebar</h2>
          <p>The central map stays ready here. Use the Explorer sidebar tree to drill into objects.</p>
        </div>
      ) : (
        <div className="structure-body">
          <div className="structure-toolbar">
            <label className="structure-search">
              <SearchIcon className="toolbar-icon" />
              <span className="sr-only">Search structure</span>
              <input
                type="search"
                placeholder="Search tables, collections, keys, fields"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
            <div className="structure-metrics">
              {(structure?.metrics ?? []).map((metric) => (
                <span key={`${metric.label}-${metric.value}`}>
                  {metric.label}: <strong>{metric.value}</strong>
                </span>
              ))}
              {structure?.truncated ? <span>Metadata truncated</span> : null}
            </div>
          </div>

          {status === 'loading' ? (
            <div className="structure-empty">
              <ExplorerIcon className="empty-icon" />
              <h2>Loading structure...</h2>
              <p>Metadata is being sampled with safe limits.</p>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="structure-empty">
              <ExplorerIcon className="empty-icon" />
              <h2>No structure objects found</h2>
              <p>Refresh metadata or adjust the filter.</p>
            </div>
          ) : (
            <div className="structure-map-layout">
              <div className="structure-canvas">
                {(structure?.groups ?? [{ id: 'objects', label: 'Objects', kind: 'group' }]).map(
                  (group) => {
                    const groupNodes = filteredNodes.filter(
                      (node) => (node.groupId ?? 'objects') === group.id,
                    )

                    if (groupNodes.length === 0) {
                      return null
                    }

                    return (
                      <section key={group.id} className="structure-group">
                        <div className="structure-group-header">
                          <strong>{group.label}</strong>
                          <span>{group.kind}</span>
                        </div>
                        <div className="structure-node-grid">
                          {groupNodes.map((node) => (
                            <button
                              key={node.id}
                              type="button"
                              className={`structure-node${selectedNode?.id === node.id ? ' is-active' : ''}`}
                              title={`${node.label}: inspect fields, metrics, and sampled relationships.`}
                              onClick={() => {
                                setSelectedNodeId(node.id)
                                onInspectNode(node)
                              }}
                            >
                              <span className="structure-node-title">
                                <StructureNodeIcon node={node} />
                                <strong>{node.label}</strong>
                              </span>
                              <span className="structure-node-kind">{node.kind}</span>
                              {(node.fields ?? []).slice(0, 5).map((field) => (
                                <span key={`${node.id}-${field.name}`} className="structure-field">
                                  <span>{field.primary ? 'PK ' : ''}{field.name}</span>
                                  <code>{field.dataType}</code>
                                </span>
                              ))}
                              {(node.fields?.length ?? 0) > 5 ? (
                                <span className="structure-node-more">
                                  +{(node.fields?.length ?? 0) - 5} more field(s)
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </section>
                    )
                  },
                )}
              </div>

              <aside className="structure-details" aria-label="Selected structure details">
                {selectedNode ? (
                  <>
                    <div className="structure-details-header">
                      <StructureNodeIcon node={selectedNode} />
                      <div>
                        <strong>{selectedNode.label}</strong>
                        <span>{selectedNode.detail ?? selectedNode.kind}</span>
                      </div>
                    </div>
                    <div className="structure-details-grid">
                      {(selectedNode.metrics ?? []).map((metric) => (
                        <div key={`${metric.label}-${metric.value}`} className="detail-row">
                          <span>{metric.label}</span>
                          <strong>{metric.value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="details-section">
                      <strong>Fields</strong>
                      {(selectedNode.fields ?? []).length === 0 ? (
                        <p className="panel-footnote">No field metadata for this object.</p>
                      ) : (
                        <div className="structure-field-list">
                          {(selectedNode.fields ?? []).map((field) => (
                            <div key={`${selectedNode.id}-${field.name}`} className="structure-field-row">
                              <span>{field.name}</span>
                              <code>{field.dataType}</code>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="details-section">
                      <strong>Relationships</strong>
                      {(structure?.edges ?? []).filter(
                        (edge) => edge.from === selectedNode.id || edge.to === selectedNode.id,
                      ).length === 0 ? (
                        <p className="panel-footnote">No relationships sampled.</p>
                      ) : (
                        <ul className="messages-list">
                          {(structure?.edges ?? [])
                            .filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id)
                            .map((edge) => (
                              <li key={edge.id}>
                                {edge.label}
                                {edge.inferred ? ' (inferred)' : ''}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="panel-footnote">Select an object to inspect fields and relationships.</p>
                )}
              </aside>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function StructureNodeIcon({ node }: { node: StructureNode }) {
  if (node.family === 'document') {
    return <JsonIcon className="structure-icon" />
  }

  if (node.family === 'keyvalue') {
    return <KeyValueIcon className="structure-icon" />
  }

  if (node.kind === 'table' || node.kind.includes('table')) {
    return <TableIcon className="structure-icon" />
  }

  return <DatabaseIcon className="structure-icon" />
}
