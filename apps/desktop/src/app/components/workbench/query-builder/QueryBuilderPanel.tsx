import type {
  MongoFindBuilderState,
  QueryBuilderState,
  QueryTabState,
} from '@universality/shared-types'
import {
  buildMongoFindQueryText,
  isMongoFindBuilderState,
  normalizeFilterGroups,
} from './mongo-find'
import {
  MongoFilterBuilderSection,
  MongoProjectionBuilderSection,
  MongoSortBuilderSection,
} from './MongoFindBuilderSections'

interface QueryBuilderPanelProps {
  tab: QueryTabState
  builderState?: QueryBuilderState
  collectionOptions?: string[]
  onBuilderStateChange?(tabId: string, builderState: QueryBuilderState): void
}

export function QueryBuilderPanel({
  builderState,
  collectionOptions = [],
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
      collectionOptions={collectionOptions}
      onBuilderStateChange={onBuilderStateChange}
    />
  )
}

function MongoFindBuilder({
  tab,
  builderState,
  collectionOptions,
  onBuilderStateChange,
}: {
  tab: QueryTabState
  builderState: MongoFindBuilderState
  collectionOptions: string[]
  onBuilderStateChange?(tabId: string, builderState: QueryBuilderState): void
}) {
  const draft = builderState
  const filterGroups = normalizeFilterGroups(draft.filterGroups)
  const resolvedCollectionOptions = uniqueValues([
    draft.collection,
    ...collectionOptions,
  ]).filter(Boolean)

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
      <div className="query-builder-grid">
        <label className="query-builder-field">
          <span>Collection</span>
          <select
            aria-label="Collection"
            value={draft.collection}
            onChange={(event) => updateDraft({ collection: event.target.value })}
          >
            {resolvedCollectionOptions.length === 0 ? (
              <option value="">Select collection</option>
            ) : null}
            {resolvedCollectionOptions.map((collection) => (
              <option key={collection} value={collection}>
                {collection}
              </option>
            ))}
          </select>
        </label>
      </div>

      <MongoFilterBuilderSection
        draft={draft}
        filterGroups={filterGroups}
        updateDraft={updateDraft}
      />
      <MongoProjectionBuilderSection
        draft={draft}
        filterGroups={filterGroups}
        updateDraft={updateDraft}
      />
      <MongoSortBuilderSection
        draft={draft}
        filterGroups={filterGroups}
        updateDraft={updateDraft}
      />
    </section>
  )
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}
