import { describe, expect, it } from 'vitest'
import type { ExplorerNode } from '@datanaut/shared-types'
import { createSeedSnapshot } from '../../../test/fixtures/seed-workspace'
import {
  buildConnectionObjectTree,
  connectionGroupLabel,
  connectionTreeNodeTarget,
  environmentAccentVariables,
  explorerNodeTarget,
  isExplorerNodeQueryable,
  isScopedQueryable,
  sidebarSectionId,
} from './SideBar.helpers'
import type { ConnectionTreeNode } from './SideBar.helpers'

describe('sidebar connection tree helpers', () => {
  it('builds SQL object nodes with scoped select templates', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-analytics')

    expect(connection).toBeDefined()

    const tree = buildConnectionObjectTree(connection!)
    const accounts = findNode(tree, 'table-accounts')

    expect(accounts).toMatchObject({
      kind: 'table',
      label: 'accounts',
      queryable: true,
      queryTemplate: 'select * from public.accounts limit 100;',
    })
  })

  it('builds SQL Server table templates using T-SQL top syntax', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-orders')

    const tree = buildConnectionObjectTree(connection!)
    const accounts = findNode(tree, 'table-accounts')

    expect(accounts?.queryTemplate).toBe('select top 100 * from dbo.accounts;')
  })

  it('marks Mongo collection nodes as builder-capable scoped targets', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-catalog')

    const tree = buildConnectionObjectTree(connection!)
    const products = findNode(tree, 'collection-products')

    expect(products).toMatchObject({
      kind: 'collection',
      scope: 'collection:products',
      builderKind: 'mongo-find',
    })
    expect(isScopedQueryable(products!)).toBe(true)
    expect(connectionTreeNodeTarget(products!)).toMatchObject({
      kind: 'collection',
      label: 'products',
      preferredBuilder: 'mongo-find',
      queryTemplate: expect.stringContaining('"collection": "products"'),
    })
  })

  it('derives stable section ids and group labels', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-catalog')

    expect(sidebarSectionId('connections', 'database-type', 'NoSQL / Document')).toBe(
      'connections:database-type:nosql-document',
    )
    expect(connectionGroupLabel(connection!, 'none', snapshot.environments)).toBe('Connections')
    expect(connectionGroupLabel(connection!, 'database-type', snapshot.environments)).toBe(
      'NoSQL / Document',
    )
    expect(connectionGroupLabel(connection!, 'environment', snapshot.environments)).toBe('Dev')
  })

  it('normalizes environment accent colors into custom CSS variables', () => {
    const style = environmentAccentVariables({
      ...createSeedSnapshot().environments[0]!,
      color: '#2db',
    }) as Record<string, string>

    expect(style['--connection-env-color']).toBe('#22ddbb')
    expect(style['--connection-env-tint']).toBe('rgba(34, 221, 187, 0.09)')
    expect(style['--connection-env-border']).toBe('rgba(34, 221, 187, 0.5)')
  })

  it('maps explorer collection nodes to Mongo builder targets', () => {
    const snapshot = createSeedSnapshot()
    const connection = snapshot.connections.find((item) => item.id === 'conn-catalog')
    const node: ExplorerNode = {
      id: 'collection-products',
      label: 'products',
      kind: 'collection',
      detail: 'sample collection',
      family: 'document',
      path: ['catalog', 'products'],
      scope: 'collection:products',
    }

    expect(isExplorerNodeQueryable(node)).toBe(true)
    expect(explorerNodeTarget(node, connection)).toMatchObject({
      kind: 'collection',
      label: 'products',
      preferredBuilder: 'mongo-find',
      scope: 'collection:products',
    })
  })
})

function findNode(
  nodes: ConnectionTreeNode[],
  id: string,
): ConnectionTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node
    }

    const child = node.children ? findNode(node.children, id) : undefined

    if (child) {
      return child
    }
  }

  return undefined
}
