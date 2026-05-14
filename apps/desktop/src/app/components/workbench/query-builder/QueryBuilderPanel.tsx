import type {
  ConnectionProfile,
  MongoFindBuilderState,
  QueryBuilderState,
  QueryTabState,
} from '@datanaut/shared-types'
import { CqlPartitionBuilder } from './CqlPartitionBuilder'
import { isCqlPartitionBuilderState } from './cql-partition'
import { DynamoDbKeyConditionBuilder } from './DynamoDbKeyConditionBuilder'
import { isDynamoDbKeyConditionBuilderState } from './dynamodb-key-condition'
import {
  buildMongoFindQueryText,
  isMongoFindBuilderState,
} from './mongo-find'
import {
  MongoFilterBuilderSection,
  MongoProjectionBuilderSection,
  MongoSortBuilderSection,
} from './MongoFindBuilderSections'
import { isSqlSelectBuilderState } from './sql-select'
import { SqlSelectBuilder } from './SqlSelectBuilder'
import { isSearchDslBuilderState } from './search-dsl'
import { SearchDslBuilder } from './SearchDslBuilder'

interface QueryBuilderPanelProps {
  connection?: ConnectionProfile
  tab: QueryTabState
  builderState?: QueryBuilderState
  collectionOptions?: string[]
  tableOptions?: string[]
  onBuilderStateChange?(tabId: string, builderState: QueryBuilderState): void
}

export function QueryBuilderPanel({
  builderState,
  collectionOptions = [],
  connection,
  tab,
  tableOptions = [],
  onBuilderStateChange,
}: QueryBuilderPanelProps) {
  const resolvedBuilderState = builderState ?? tab.builderState

  if (isMongoFindBuilderState(resolvedBuilderState)) {
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

  if (connection && isSqlSelectBuilderState(resolvedBuilderState)) {
    return (
      <SqlSelectBuilder
        key={tab.id}
        connection={connection}
        tab={tab}
        builderState={resolvedBuilderState}
        tableOptions={tableOptions}
        onBuilderStateChange={onBuilderStateChange}
      />
    )
  }

  if (isDynamoDbKeyConditionBuilderState(resolvedBuilderState)) {
    return (
      <DynamoDbKeyConditionBuilder
        key={tab.id}
        tab={tab}
        builderState={resolvedBuilderState}
        tableOptions={tableOptions}
        onBuilderStateChange={onBuilderStateChange}
      />
    )
  }

  if (isCqlPartitionBuilderState(resolvedBuilderState)) {
    return (
      <CqlPartitionBuilder
        key={tab.id}
        tab={tab}
        builderState={resolvedBuilderState}
        tableOptions={tableOptions}
        onBuilderStateChange={onBuilderStateChange}
      />
    )
  }

  if (isSearchDslBuilderState(resolvedBuilderState)) {
    return (
      <SearchDslBuilder
        key={tab.id}
        tab={tab}
        builderState={resolvedBuilderState}
        indexOptions={tableOptions}
        onBuilderStateChange={onBuilderStateChange}
      />
    )
  }

  return null
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
  const filterGroups = draft.filterGroups ?? []
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
