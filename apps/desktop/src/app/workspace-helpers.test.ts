import { describe, expect, it } from 'vitest'
import type {
  MongoFindBuilderState,
  QueryTabState,
  ResultPayload,
} from '@datanaut/shared-types'
import { createSeedSnapshot } from '../test/fixtures/seed-workspace'
import {
  appendFieldToQueryText,
  builderStateForTab,
  deriveCapabilities,
  mongoCollectionOptions,
  selectPayload,
} from './workspace-helpers'

function createTab(queryText: string, builderState?: MongoFindBuilderState): QueryTabState {
  return {
    id: 'tab-test',
    title: 'products.find',
    connectionId: 'conn-catalog',
    environmentId: 'env-dev',
    family: 'document',
    language: 'mongodb',
    editorLabel: 'Document query',
    queryText,
    builderState,
    status: 'idle',
    dirty: false,
    history: [],
  }
}

describe('workspace query helpers', () => {
  it('builds a default Mongo find builder from raw query text', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-catalog')
    const tab = createTab('{\n  "collection": "orders",\n  "limit": 37\n}')

    expect(connection).toBeDefined()

    const state = builderStateForTab(tab, connection!, {})

    expect(state).toMatchObject({
      kind: 'mongo-find',
      collection: 'orders',
      limit: 37,
    })
  })

  it('prefers draft builder state over persisted tab state', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-catalog')
    const persisted = createBuilderState('products', 20)
    const draft = createBuilderState('inventory', 50)
    const tab = createTab('{}', persisted)

    const state = builderStateForTab(tab, connection!, { [tab.id]: draft })

    expect(state).toBe(draft)
  })

  it('does not expose a builder for non-Mongo connections', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-analytics')
    const tab = createTab('select 1;')

    expect(builderStateForTab(tab, connection!, {})).toBeUndefined()
  })

  it('derives editor capabilities from adapter manifests', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-catalog')

    const capabilities = deriveCapabilities(snapshot, connection!)

    expect(capabilities.editorLanguage).toBe('json')
    expect(capabilities.defaultRowLimit).toBe(100)
    expect(capabilities.supportsLiveMetadata).toBe(true)
  })

  it('dedupes Mongo collection options and keeps useful fixture fallbacks', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-catalog')

    const options = mongoCollectionOptions(connection, [
      { kind: 'collection', label: 'orders' },
      { kind: 'collection', label: 'orders' },
      { kind: 'database', label: 'catalog' },
    ])

    expect(options).toEqual(['orders', 'products', 'inventory'])
  })

  it('selects the requested renderer payload with a safe fallback', () => {
    const tablePayload: ResultPayload = {
      renderer: 'table',
      columns: ['id'],
      rows: [['1']],
    }
    const jsonPayload: ResultPayload = { renderer: 'json', value: { ok: true } }

    expect(selectPayload([tablePayload, jsonPayload], 'json')).toBe(jsonPayload)
    expect(selectPayload([tablePayload, jsonPayload], 'raw')).toBe(tablePayload)
    expect(selectPayload([], 'json')).toBeUndefined()
  })

  it('appends dropped field paths without damaging the current query text', () => {
    expect(appendFieldToQueryText('', 'customer.email')).toBe('customer.email')
    expect(appendFieldToQueryText('select * from accounts;\n', 'customer.email')).toBe(
      'select * from accounts;\ncustomer.email',
    )
    expect(appendFieldToQueryText('select 1;', '   ')).toBe('select 1;')
  })
})

function createBuilderState(collection: string, limit: number): MongoFindBuilderState {
  return {
    kind: 'mongo-find',
    collection,
    filters: [],
    filterGroups: [{ id: 'group-default', label: 'Default', logic: 'and' }],
    projectionMode: 'all',
    projectionFields: [],
    sort: [],
    skip: 0,
    limit,
    lastAppliedQueryText: '{}',
  }
}
