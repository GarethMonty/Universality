import type { MongoBuilderValueType, MongoFindBuilderState, MongoFindFilterGroup, MongoFilterOperator } from '@datanaut/shared-types'
import { BuilderSection } from './BuilderSection'

type BuilderUpdater = (patch: Partial<MongoFindBuilderState>) => void

interface MongoFindSectionProps {
  draft: MongoFindBuilderState
  filterGroups: MongoFindFilterGroup[]
  updateDraft: BuilderUpdater
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

export function MongoFilterBuilderSection({
  draft,
  filterGroups,
  updateDraft,
}: MongoFindSectionProps) {
  return (
    <BuilderSection
      title="Filters"
      actionLabel="Add Group"
      dropHint="Drop a result field to filter"
      onDropField={(field) =>
        updateDraft({
          filterGroups,
          filters: [
            ...draft.filters,
            filterRow(filterGroups[0]?.id ?? 'filter-group-default', field),
          ],
        })
      }
      onAdd={() =>
        updateDraft({
          filterGroups: [
            ...filterGroups,
            {
              id: rowId('filter-group'),
              label: `Group ${filterGroups.length + 1}`,
              logic: 'and',
            },
          ],
        })
      }
    >
      {draft.filters.length === 0 ? <p className="query-builder-empty">No filters.</p> : null}
      {filterGroups.map((group) => {
        const rows = draft.filters.filter(
          (row) => (row.groupId ?? filterGroups[0]?.id) === group.id,
        )

        return (
          <div className="query-builder-filter-group" key={group.id}>
            <div className="query-builder-filter-group-header">
              <strong>{group.label}</strong>
              <label>
                <span>Match</span>
                <select
                  aria-label={`Filter group logic ${group.label}`}
                  value={group.logic}
                  onChange={(event) =>
                    updateDraft({
                      filterGroups: filterGroups.map((item) =>
                        item.id === group.id
                          ? { ...item, logic: event.target.value as MongoFindFilterGroup['logic'] }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="and">All (AND)</option>
                  <option value="or">Any (OR)</option>
                </select>
              </label>
              <button
                type="button"
                className="drawer-button"
                onClick={() =>
                  updateDraft({
                    filterGroups,
                    filters: [...draft.filters, filterRow(group.id)],
                  })
                }
              >
                Add Filter
              </button>
              {filterGroups.length > 1 ? (
                <button
                  type="button"
                  className="query-builder-remove"
                  aria-label={`Remove ${group.label}`}
                  onClick={() =>
                    updateDraft({
                      filterGroups: filterGroups.filter((item) => item.id !== group.id),
                      filters: draft.filters.filter(
                        (row) => (row.groupId ?? filterGroups[0]?.id) !== group.id,
                      ),
                    })
                  }
                >
                  Remove Group
                </button>
              ) : null}
            </div>
            {rows.length === 0 ? (
              <p className="query-builder-empty">No filters in this group.</p>
            ) : null}
            {rows.map((row) => (
              <div
                className={`query-builder-row query-builder-row--filter${
                  row.enabled === false ? ' is-disabled' : ''
                }`}
                key={row.id}
              >
                <label className="query-builder-toggle">
                  <input
                    aria-label={`Apply filter ${row.field || row.id}`}
                    type="checkbox"
                    checked={row.enabled ?? true}
                    onChange={(event) =>
                      updateDraft({
                        filterGroups,
                        filters: draft.filters.map((item) =>
                          item.id === row.id ? { ...item, enabled: event.target.checked } : item,
                        ),
                      })
                    }
                  />
                  <span>{row.enabled === false ? 'Off' : 'On'}</span>
                </label>
                <input
                  aria-label="Filter field"
                  placeholder="field"
                  value={row.field}
                  onChange={(event) =>
                    updateDraft({
                      filterGroups,
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
                      filterGroups,
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
                      filterGroups,
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
                      filterGroups,
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
                    updateDraft({
                      filterGroups,
                      filters: draft.filters.filter((item) => item.id !== row.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </BuilderSection>
  )
}

export function MongoProjectionBuilderSection({
  draft,
  filterGroups,
  updateDraft,
}: MongoFindSectionProps) {
  return (
    <BuilderSection
      title="Projection"
      actionLabel="Add Field"
      dropHint="Drop a result field to project"
      onDropField={(field) =>
        updateDraft({
          filterGroups,
          projectionMode: draft.projectionMode === 'all' ? 'include' : draft.projectionMode,
          projectionFields: [...draft.projectionFields, { id: rowId('projection'), field }],
        })
      }
      onAdd={() =>
        updateDraft({
          filterGroups,
          projectionMode: draft.projectionMode === 'all' ? 'include' : draft.projectionMode,
          projectionFields: [...draft.projectionFields, { id: rowId('projection'), field: '' }],
        })
      }
    >
      {draft.projectionFields.length === 0 ? (
        <p className="query-builder-empty">All fields.</p>
      ) : null}
      {draft.projectionFields.map((field) => (
        <div className="query-builder-row query-builder-row--projection" key={field.id}>
          <input
            aria-label="Projection field"
            placeholder="field"
            value={field.field}
            onChange={(event) =>
              updateDraft({
                filterGroups,
                projectionFields: draft.projectionFields.map((item) =>
                  item.id === field.id ? { ...item, field: event.target.value } : item,
                ),
              })
            }
          />
          <select
            aria-label={`Projection mode ${field.field || field.id}`}
            value={draft.projectionMode === 'all' ? 'include' : draft.projectionMode}
            onChange={(event) =>
              updateDraft({
                filterGroups,
                projectionMode: event.target.value as MongoFindBuilderState['projectionMode'],
              })
            }
          >
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </select>
          <button
            type="button"
            className="query-builder-remove"
            aria-label="Remove projection field"
            onClick={() =>
              updateDraft({
                filterGroups,
                projectionFields: draft.projectionFields.filter((item) => item.id !== field.id),
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
    </BuilderSection>
  )
}

export function MongoSortBuilderSection({
  draft,
  filterGroups,
  updateDraft,
}: MongoFindSectionProps) {
  return (
    <BuilderSection
      title="Sort"
      actionLabel="Add Sort"
      dropHint="Drop a result field to order"
      onDropField={(field) =>
        updateDraft({
          filterGroups,
          sort: [...draft.sort, { id: rowId('sort'), field, direction: 'asc' }],
        })
      }
      onAdd={() =>
        updateDraft({
          filterGroups,
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
                filterGroups,
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
                filterGroups,
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
            onClick={() =>
              updateDraft({
                filterGroups,
                sort: draft.sort.filter((item) => item.id !== row.id),
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
    </BuilderSection>
  )
}

function rowId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function filterRow(groupId: string, field = '') {
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
