import { describe, expect, it } from 'vitest'
import { createSeedSnapshot } from '../../test/fixtures/seed-workspace'
import {
  createExplorerTabInSnapshot,
  createScopedQueryTabInSnapshot,
  scopedTargetsMatch,
} from './browser-tabs'

describe('browser tab runtime', () => {
  it('opens Explorer as one unsaveable tab per connection', () => {
    const snapshot = createSeedSnapshot()
    const opened = createExplorerTabInSnapshot(snapshot, 'conn-catalog')
    const explorerTab = opened.tabs.find((tab) => tab.tabKind === 'explorer')

    expect(explorerTab).toMatchObject({
      connectionId: 'conn-catalog',
      dirty: false,
      editorLabel: 'Explorer',
      queryText: '',
    })
    expect(explorerTab?.saveTarget).toBeUndefined()
    expect(opened.ui.activeTabId).toBe(explorerTab?.id)
    expect(opened.ui.rightDrawer).toBe('none')
    expect(opened.ui.explorerView).toBe('structure')

    const reopened = createExplorerTabInSnapshot(opened, 'conn-catalog')

    expect(reopened.tabs.filter((tab) => tab.tabKind === 'explorer')).toHaveLength(1)
    expect(reopened.ui.activeTabId).toBe(explorerTab?.id)
  })

  it('reuses an already-open scoped object query tab', () => {
    const request = {
      connectionId: 'conn-catalog',
      target: {
        kind: 'collection',
        label: 'products',
        path: ['Catalog Mongo', 'catalog', 'Collections'],
        scope: 'collection:products',
        preferredBuilder: 'mongo-find' as const,
      },
    }
    const snapshot = createSeedSnapshot()
    const opened = createScopedQueryTabInSnapshot(snapshot, request)
    const openedTab = opened.tabs.find(
      (tab) => tab.scopedTarget?.scope === 'collection:products',
    )

    expect(openedTab).toBeDefined()

    const reopened = createScopedQueryTabInSnapshot(opened, request)
    const scopedTabs = reopened.tabs.filter(
      (tab) => tab.scopedTarget?.scope === 'collection:products',
    )

    expect(scopedTabs).toHaveLength(1)
    expect(reopened.ui.activeTabId).toBe(openedTab?.id)
  })

  it('reuses legacy scoped tabs that were opened before scoped target metadata existed', () => {
    const snapshot = createSeedSnapshot()
    const legacyTab = {
      ...snapshot.tabs[0]!,
      id: 'tab-legacy-products',
      title: 'products.find.json',
      connectionId: 'conn-catalog',
      environmentId: 'env-dev',
      family: 'document' as const,
      language: 'mongodb' as const,
      scopedTarget: undefined,
    }
    snapshot.tabs = [legacyTab]

    const reopened = createScopedQueryTabInSnapshot(snapshot, {
      connectionId: 'conn-catalog',
      target: {
        kind: 'collection',
        label: 'products',
        path: ['Catalog Mongo', 'catalog', 'Collections'],
        scope: 'collection:products',
        preferredBuilder: 'mongo-find',
      },
    })

    expect(reopened.tabs).toHaveLength(1)
    expect(reopened.ui.activeTabId).toBe('tab-legacy-products')
  })

  it('matches scoped targets by object identity instead of generated query text', () => {
    const left = {
      kind: 'collection',
      label: 'products',
      path: ['Catalog Mongo', 'catalog', 'Collections'],
      scope: 'collection:products',
      queryTemplate: '{ "collection": "products" }',
      preferredBuilder: 'mongo-find' as const,
    }
    const right = {
      ...left,
      queryTemplate: '{ "collection": "products", "limit": 10 }',
    }
    const differentScope = {
      ...left,
      scope: 'collection:orders',
    }

    expect(scopedTargetsMatch(left, right)).toBe(true)
    expect(scopedTargetsMatch(left, differentScope)).toBe(false)
  })
})
