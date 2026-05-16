import { describe, expect, it } from 'vitest'
import { createSeedSnapshot } from '../../test/fixtures/seed-workspace'
import { applyExecutionRequestLocally } from './browser-execution'

describe('browser execution runtime', () => {
  it('keeps dirty query tabs dirty after execution', () => {
    const snapshot = createSeedSnapshot()
    const tab = snapshot.tabs.find((item) => item.id === 'tab-sql-ops')

    if (!tab) {
      throw new Error('Expected seed query tab.')
    }

    tab.dirty = true

    const { snapshot: executed } = applyExecutionRequestLocally(snapshot, {
      tabId: tab.id,
      connectionId: tab.connectionId,
      environmentId: tab.environmentId,
      language: tab.language,
      queryText: tab.queryText,
    })

    expect(executed.tabs.find((item) => item.id === tab.id)?.dirty).toBe(true)
  })

  it('keeps saved query tabs clean when execution does not change them', () => {
    const snapshot = createSeedSnapshot()
    const tab = snapshot.tabs.find((item) => item.id === 'tab-sql-ops')

    if (!tab) {
      throw new Error('Expected seed query tab.')
    }

    tab.dirty = false

    const { snapshot: executed } = applyExecutionRequestLocally(snapshot, {
      tabId: tab.id,
      connectionId: tab.connectionId,
      environmentId: tab.environmentId,
      language: tab.language,
      queryText: tab.queryText,
    })

    expect(executed.tabs.find((item) => item.id === tab.id)?.dirty).toBe(false)
  })
})
