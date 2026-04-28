import type { DragEvent, ReactNode } from 'react'
import type {
  MongoBuilderValueType,
  MongoFilterOperator,
  MongoFindBuilderState,
  QueryBuilderState,
  QueryTabState,
} from '@universality/shared-types'
import {
  buildMongoFindQueryText,
  isMongoFindBuilderState,
} from './mongo-find'
import { readFieldDragData } from '../results/field-drag'

interface QueryBuilderPanelProps {
  tab: QueryTabState
  builderState?: QueryBuilderState
  onBuilderStateChange?(tabId: string, builderState: QueryBuilderState): void
}

const FILTER_OPERATORS: Array<{ value: MongoFilterOperator; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'regex', label: 'Regex' },
  { value: 'exists', label: 'Exists' },
  { value: 'in', label: 'In' },
]

const VALUE_TYPES: MongoBuilderValueType[] = ['string', 'number', 'boolean', 'null', 'json']

export function QueryBuilderPanel({
  builderState,
  tab,
  onBuilderStateChange,
}: QueryBuilderPanelProps) {
  const resolvedBuilderState = builderState ?? tab.builderState

  if (!isMongoFindBuilderState(resolvedBuilderState)) {
    return null
  }

  return (
    <MongoFindBuilder
      key={tab.id}
      tab={tab}
      builderState={resolvedBuilderState}
      onBuilderStateChange={onBuilderStateChange}
    />
  )
}

function MongoFindBuilder({
  tab,
  builderState,
  onBuilderStateChange,
}: {
  tab: QueryTabState
  builderState: MongoFindBuilderState
  onBuilderStateChange?(tabId: string, builderState: QueryBuilderState): void
}) {
  const draft = builderState

  const updateDraft = (patch: Partial<MongoFindBuilderState>) => {
    const nextDraft = { ...draft, ...patch }
    const next = {
      ...nextDraft,
      lastAppliedQueryText: buildMongoFindQueryText(nextDraft),
    }

    if (onBuilderStateChange) {
      onBuilderStateChange(tab.id, next)
    }
  }

  return (
    <section className="query-builder-panel" aria-label="MongoDB query builder">
      <div className="query-builder-header">
        <div>
          <p className="sidebar-eyebrow">Mongo Find Builder</p>
          <h2>{draft.collection || 'Collection query'}</h2>
        </div>
        <div className="query-builder-status">
          <span className="query-builder-warning">Live query</span>
        </div>
      </div>

      <div className="query-builder-grid">
        <label className="query-builder-field">
          <span>Collection</span>
          <input
            value={draft.collection}
            onChange={(event) => updateDraft({ collection: event.target.value })}
          />
        </label>
        <label className="query-builder-field">
          <span>Skip</span>
          <input
            type="number"
            min={0}
            value={draft.skip ?? 0}
            onChange={(event) => updateDraft({ skip: numericValue(event.target.value) })}
          />
        </label>
        <label className="query-builder-field">
          <span>Limit</span>
          <input
            type="number"
            min={1}
            value={draft.limit ?? 50}
            onChange={(event) => updateDraft({ limit: numericValue(event.target.value) })}
          />
        </label>
      </div>

      <BuilderSection
        title="Filters"
        actionLabel="Add Filter"
        dropHint="Drop a result field to filter"
        onDropField={(field) =>
          updateDraft({
            filters: [
              ...draft.filters,
              {
                id: rowId('filter'),
                field,
                operator: 'eq',
                value: '',
                valueType: 'string',
              },
            ],
          })
        }
        onAdd={() =>
          updateDraft({
            filters: [
              ...draft.filters,
              {
                id: rowId('filter'),
                field: '',
                operator: 'eq',
                value: '',
                valueType: 'string',
              },
            ],
          })
        }
      >
        {draft.filters.length === 0 ? <p className="query-builder-empty">No filters.</p> : null}
        {draft.filters.map((row) => (
          <div className="query-builder-row" key={row.id}>
            <input
              aria-label="Filter field"
              placeholder="field"
              value={row.field}
              onChange={(event) =>
                updateDraft({
                  filters: draft.filters.map((item) =>
                    item.id === row.id ? { ...item, field: event.target.value } : item,
                  ),
                })
              }
            />
            <select
              aria-label="Filter operator"
              value={row.operator}
              onChange={(event) =>
                updateDraft({
                  filters: draft.filters.map((item) =>
                    item.id === row.id
                      ? { ...item, operator: event.target.value as MongoFilterOperator }
                      : item,
                  ),
                })
              }
            >
              {FILTER_OPERATORS.map((operator) => (
                <option key={operator.value} value={operator.value}>
                  {operator.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Value type"
              value={row.valueType}
              onChange={(event) =>
                updateDraft({
                  filters: draft.filters.map((item) =>
                    item.id === row.id
                      ? { ...item, valueType: event.target.value as MongoBuilderValueType }
                      : item,
                  ),
                })
              }
            >
              {VALUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              aria-label="Filter value"
              placeholder={row.operator === 'exists' ? 'true' : 'value'}
              value={row.value}
              disabled={row.valueType === 'null'}
              onChange={(event) =>
                updateDraft({
                  filters: draft.filters.map((item) =>
                    item.id === row.id ? { ...item, value: event.target.value } : item,
                  ),
                })
              }
            />
            <button
              type="button"
              className="query-builder-remove"
              aria-label="Remove filter"
              onClick={() =>
                updateDraft({ filters: draft.filters.filter((item) => item.id !== row.id) })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </BuilderSection>

      <BuilderSection
        title="Projection"
        actionLabel="Add Field"
        dropHint="Drop a result field to project"
        onDropField={(field) =>
          updateDraft({
            projectionMode: draft.projectionMode === 'all' ? 'include' : draft.projectionMode,
            projectionFields: [
              ...draft.projectionFields,
              { id: rowId('projection'), field },
            ],
          })
        }
        onAdd={() =>
          updateDraft({
            projectionMode: draft.projectionMode === 'all' ? 'include' : draft.projectionMode,
            projectionFields: [...draft.projectionFields, { id: rowId('projection'), field: '' }],
          })
        }
      >
        <label className="query-builder-inline-field">
          <span>Mode</span>
          <select
            value={draft.projectionMode}
            onChange={(event) =>
              updateDraft({
                projectionMode: event.target.value as MongoFindBuilderState['projectionMode'],
              })
            }
          >
            <option value="all">All fields</option>
            <option value="include">Include fields</option>
            <option value="exclude">Exclude fields</option>
          </select>
        </label>
        {draft.projectionFields.map((field) => (
          <div className="query-builder-row query-builder-row--simple" key={field.id}>
            <input
              aria-label="Projection field"
              placeholder="field"
              value={field.field}
              onChange={(event) =>
                updateDraft({
                  projectionFields: draft.projectionFields.map((item) =>
                    item.id === field.id ? { ...item, field: event.target.value } : item,
                  ),
                })
              }
            />
            <button
              type="button"
              className="query-builder-remove"
              aria-label="Remove projection field"
              onClick={() =>
                updateDraft({
                  projectionFields: draft.projectionFields.filter(
                    (item) => item.id !== field.id,
                  ),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </BuilderSection>

      <BuilderSection
        title="Sort"
        actionLabel="Add Sort"
        dropHint="Drop a result field to order"
        onDropField={(field) =>
          updateDraft({
            sort: [...draft.sort, { id: rowId('sort'), field, direction: 'asc' }],
          })
        }
        onAdd={() =>
          updateDraft({
            sort: [...draft.sort, { id: rowId('sort'), field: '', direction: 'asc' }],
          })
        }
      >
        {draft.sort.length === 0 ? <p className="query-builder-empty">No sort.</p> : null}
        {draft.sort.map((row) => (
          <div className="query-builder-row query-builder-row--sort" key={row.id}>
            <input
              aria-label="Sort field"
              placeholder="field"
              value={row.field}
              onChange={(event) =>
                updateDraft({
                  sort: draft.sort.map((item) =>
                    item.id === row.id ? { ...item, field: event.target.value } : item,
                  ),
                })
              }
            />
            <select
              aria-label="Sort direction"
              value={row.direction}
              onChange={(event) =>
                updateDraft({
                  sort: draft.sort.map((item) =>
                    item.id === row.id
                      ? { ...item, direction: event.target.value as 'asc' | 'desc' }
                      : item,
                  ),
                })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button
              type="button"
              className="query-builder-remove"
              aria-label="Remove sort"
              onClick={() => updateDraft({ sort: draft.sort.filter((item) => item.id !== row.id) })}
            >
              Remove
            </button>
          </div>
        ))}
      </BuilderSection>
    </section>
  )
}

function BuilderSection({
  actionLabel,
  children,
  dropHint,
  onAdd,
  onDropField,
  title,
}: {
  actionLabel: string
  children: ReactNode
  dropHint?: string
  onAdd(): void
  onDropField?(field: string): void
  title: string
}) {
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    const field = readFieldDragData(event)

    if (field) {
      onDropField(field)
    }
  }

  return (
    <section
      className="query-builder-section"
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="query-builder-section-header">
        <h3>{title}</h3>
        {dropHint ? <span className="query-builder-drop-hint">{dropHint}</span> : null}
        <button type="button" className="drawer-button" onClick={onAdd}>
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  )
}

function numericValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

function rowId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
