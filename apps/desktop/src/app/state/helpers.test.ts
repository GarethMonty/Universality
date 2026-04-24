import { describe, expect, it } from 'vitest'
import { createSeedSnapshot } from '../data/seed'
import {
  evaluateGuardrails,
  migrateWorkspaceSnapshot,
  resolveEnvironment,
} from './helpers'

describe('resolveEnvironment', () => {
  it('resolves inherited variables for prod', () => {
    const snapshot = createSeedSnapshot()
    const resolved = resolveEnvironment(snapshot.environments, 'env-prod')

    expect(resolved.variables.DB_HOST).toBe('analytics-prod.internal')
    expect(resolved.variables.DB_NAME).toBe('universality_dev')
    expect(resolved.inheritedChain).toEqual(['Dev', 'Prod'])
  })
})

describe('evaluateGuardrails', () => {
  it('blocks writes on read-only connections', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-orders')
    const environment = snapshot.environments.find((item) => item.id === 'env-uat')
    const resolved = resolveEnvironment(snapshot.environments, 'env-uat')

    expect(connection).toBeDefined()
    expect(environment).toBeDefined()

    const decision = evaluateGuardrails(
      connection!,
      environment!,
      resolved,
      'delete from dbo.orders where order_id = 1;',
      true,
    )

    expect(decision.status).toBe('block')
  })

  it('requires confirmation for critical production work before execution', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-analytics')
    const environment = snapshot.environments.find((item) => item.id === 'env-prod')
    const resolved = resolveEnvironment(snapshot.environments, 'env-prod')

    expect(connection).toBeDefined()
    expect(environment).toBeDefined()

    const decision = evaluateGuardrails(
      connection!,
      environment!,
      resolved,
      'select * from observability.table_health;',
      true,
    )

    expect(decision.status).toBe('confirm')
    expect(decision.requiredConfirmationText).toBe('CONFIRM Prod')
  })
})

describe('migrateWorkspaceSnapshot', () => {
  it('maps legacy ui state into ADS workbench defaults', () => {
    const snapshot = createSeedSnapshot()
    const legacy = {
      ...snapshot,
      schemaVersion: 1,
      ui: {
        activeConnectionId: snapshot.ui.activeConnectionId,
        activeEnvironmentId: snapshot.ui.activeEnvironmentId,
        activeTabId: snapshot.ui.activeTabId,
        explorerFilter: 'orders',
        commandPaletteOpen: true,
        diagnosticsOpen: true,
      },
    } as unknown as typeof snapshot

    const migrated = migrateWorkspaceSnapshot(legacy)

    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.ui.activeActivity).toBe('connections')
    expect(migrated.ui.activeSidebarPane).toBe('connections')
    expect(migrated.ui.bottomPanelVisible).toBe(true)
    expect(migrated.ui.activeBottomPanelTab).toBe('results')
    expect(migrated.ui.rightDrawer).toBe('none')
    expect(migrated.ui.explorerFilter).toBe('orders')
  })
})
