import { describe, expect, it } from 'vitest'
import { createSeedSnapshot } from '../../test/fixtures/seed-workspace'
import { setActiveConnection } from './browser-connections'

describe('browser connection runtime', () => {
  it('selects a connection without creating a query tab when none exists', () => {
    const snapshot = createSeedSnapshot()
    snapshot.tabs = snapshot.tabs.filter((tab) => tab.connectionId !== 'conn-analytics')
    snapshot.ui.activeConnectionId = 'conn-orders'
    snapshot.ui.activeEnvironmentId = 'env-uat'
    snapshot.ui.activeTabId = 'tab-orders-audit'

    const tabCount = snapshot.tabs.length
    const next = setActiveConnection(snapshot, 'conn-analytics')

    expect(next.tabs).toHaveLength(tabCount)
    expect(next.ui.activeConnectionId).toBe('conn-analytics')
    expect(next.ui.activeEnvironmentId).toBe('env-dev')
    expect(next.ui.activeTabId).toBe('')
  })
})
