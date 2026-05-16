import { fireEvent, render, screen, within } from '@testing-library/react'
import type {
  ClosedQueryTabSnapshot,
  EnvironmentProfile,
  LibraryNode,
} from '@datapadplusplus/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryPane } from './SideBar.library-pane'

const nodes: LibraryNode[] = [
  folder('library-root-queries', 'Queries'),
  folder('folder-alpha', 'Alpha'),
  folder('folder-beta', 'Beta'),
  folder('folder-reports', 'Reports', 'folder-alpha'),
  item('item-orders', 'Orders query', 'folder-alpha'),
]

describe('LibraryPane', () => {
  beforeEach(() => {
    window.localStorage.removeItem('datapadplusplus.library.recentsHeight')
  })

  it('moves files and folders to folders or back to root with drag and drop', () => {
    const onMoveNode = vi.fn()
    renderLibraryPane(onMoveNode)

    pointerMoveNode('Orders query', 'Beta')
    expect(onMoveNode).toHaveBeenCalledWith('item-orders', 'folder-beta')

    onMoveNode.mockClear()
    pointerMoveNode('Reports', 'Move library item to root')
    expect(onMoveNode).toHaveBeenCalledWith('folder-reports', undefined)
  })

  it('moves items to root when dropped on empty library tree space', () => {
    const onMoveNode = vi.fn()
    renderLibraryPane(onMoveNode)

    pointerMoveNode('Orders query', 'Library tree')

    expect(onMoveNode).toHaveBeenCalledWith('item-orders', undefined)
  })

  it('marks folder and root drop targets while pointer dragging', () => {
    const onMoveNode = vi.fn()
    renderLibraryPane(onMoveNode)

    const source = labelButtonForLabel('Orders query')
    let restoreElementFromPoint = mockElementFromPoint(treeRowForLabel('Beta'))

    fireEvent.pointerDown(source, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(source, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })

    expect(treeItemForLabel('Beta')).toHaveClass('is-folder-drop-target')

    restoreElementFromPoint()
    restoreElementFromPoint = mockElementFromPoint(screen.getByRole('tree', { name: 'Library tree' }))
    fireEvent.pointerMove(source, { button: 0, pointerId: 1, clientX: 30, clientY: 30 })

    expect(
      screen.getByRole('button', { name: 'Move library item to root' }).closest('.library-main-scroll'),
    ).toHaveClass('is-library-root-drag-over')

    fireEvent.pointerUp(source, { button: 0, pointerId: 1, clientX: 30, clientY: 30 })
    restoreElementFromPoint()
  })

  it('blocks moving a folder into one of its descendants', () => {
    const onMoveNode = vi.fn()
    renderLibraryPane(onMoveNode)

    pointerMoveNode('Alpha', 'Reports')

    expect(onMoveNode).not.toHaveBeenCalled()
  })

  it('shows recent library files and closed tabs in a resizable bottom Recents panel', () => {
    renderLibraryPane(vi.fn(), {
      closedTabs: [closedTab('closed-tab-1', 'Closed scratch')],
      libraryNodes: [
        ...nodes,
        {
          ...item('item-recent', 'Recent report', 'folder-beta'),
          lastOpenedAt: '2026-05-14T10:00:00.000Z',
        },
      ],
    })

    expect(screen.getByRole('button', { name: /Collapse Recents section/i })).toBeInTheDocument()
    expect(screen.getAllByText('Recent report').length).toBeGreaterThan(0)
    expect(screen.getByText('Closed scratch')).toBeInTheDocument()

    const resizeHandle = screen.getByRole('separator', { name: 'Resize Recents' })
    const body = document.querySelector('#library-recents-body')

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientY: 100 })
    fireEvent.pointerMove(resizeHandle, { pointerId: 1, clientY: 70 })
    fireEvent.pointerUp(resizeHandle, { pointerId: 1, clientY: 70 })

    expect(body).toHaveStyle({ height: '210px' })
  })

  it('uses the closest assigned Library environment and styles inherited rows', () => {
    renderLibraryPane(vi.fn(), {
      environments,
      libraryNodes: [
        folder('folder-top', 'Top', undefined, 'env-dev'),
        folder('folder-child', 'Child', 'folder-top', 'env-prod'),
        item('item-child', 'Child query', 'folder-child'),
        item('item-top', 'Top query', 'folder-top'),
      ],
      sectionStates: { 'library:node:folder-child': true },
    })

    const childRow = treeRowForLabel('Child query')
    const topRow = treeRowForLabel('Top query')

    expect(childRow).toHaveClass('has-library-env')
    expect(childRow).toHaveClass('is-library-env-inherited')
    expect(childRow).toHaveStyle({ '--library-env-color': '#e06c75' })
    expect(withinRow(childRow).getByText('Prod')).toHaveAttribute(
      'title',
      'Prod is inherited from Child.',
    )
    expect(topRow).toHaveStyle({ '--library-env-color': '#2dbf9b' })
    expect(withinRow(topRow).getByText('Dev')).toHaveAttribute(
      'title',
      'Dev is inherited from Top.',
    )
  })

  it('assigns and clears environments from the context menu', () => {
    const onSetEnvironment = vi.fn()
    renderLibraryPane(vi.fn(), {
      environments,
      onSetEnvironment,
    })

    fireEvent.contextMenu(treeItemForLabel('Orders query'))
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'Assign environment Prod to Orders query',
      }),
    )
    expect(onSetEnvironment).toHaveBeenCalledWith('item-orders', 'env-prod')

    onSetEnvironment.mockClear()
    fireEvent.contextMenu(treeItemForLabel('Orders query'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Inherit from parent' }))

    expect(onSetEnvironment).toHaveBeenCalledWith('item-orders', undefined)
  })
})

function renderLibraryPane(
  onMoveNode: (nodeId: string, parentId?: string) => void,
  overrides: Partial<{
    closedTabs: ClosedQueryTabSnapshot[]
    environments: EnvironmentProfile[]
    libraryNodes: LibraryNode[]
    onSetEnvironment: (nodeId: string, environmentId?: string) => void
    sectionStates: Record<string, boolean>
  }> = {},
) {
  return render(
    <LibraryPane
      closedTabs={overrides.closedTabs ?? []}
      environments={overrides.environments ?? []}
      libraryFilter=""
      libraryNodes={overrides.libraryNodes ?? nodes}
      sectionStates={overrides.sectionStates ?? {}}
      onCreateFolder={vi.fn()}
      onDeleteNode={vi.fn()}
      onLibraryFilterChange={vi.fn()}
      onMoveNode={onMoveNode}
      onOpenLibraryItem={vi.fn()}
      onRenameNode={vi.fn()}
      onReopenClosedTab={vi.fn()}
      onSaveCurrentQuery={vi.fn()}
      onSetNodeEnvironment={overrides.onSetEnvironment ?? vi.fn()}
      onSidebarSectionExpandedChange={vi.fn()}
    />,
  )
}

function pointerMoveNode(sourceName: string, targetName: string) {
  const source = labelButtonForLabel(sourceName)
  const target =
    targetName === 'Move library item to root'
      ? screen.getByRole('button', { name: targetName })
      : targetName === 'Library tree'
        ? screen.getByRole('tree', { name: targetName })
        : treeRowForLabel(targetName)
  const restoreElementFromPoint = mockElementFromPoint(target)

  try {
    fireEvent.pointerDown(source, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(source, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(source, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
  } finally {
    restoreElementFromPoint()
  }
}

function labelButtonForLabel(label: string) {
  return screen.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(label)}$`, 'i'),
  })
}

function treeRowForLabel(label: string) {
  const labelButton = labelButtonForLabel(label)
  const row = labelButton.closest('.library-tree-row')

  if (!(row instanceof HTMLElement)) {
    throw new Error(`Tree row not found for ${label}.`)
  }

  return row
}

function withinRow(row: Element) {
  return within(row as HTMLElement)
}

function treeItemForLabel(label: string) {
  const labelButton = labelButtonForLabel(label)
  const treeItem = labelButton.closest('[role="treeitem"]')

  if (!(treeItem instanceof HTMLElement)) {
    throw new Error(`Tree item not found for ${label}.`)
  }

  return treeItem
}

function mockElementFromPoint(target: Element) {
  const originalElementFromPoint = document.elementFromPoint
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => target),
  })

  return () => {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint,
    })
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function folder(
  id: string,
  name: string,
  parentId?: string,
  environmentId?: string,
): LibraryNode {
  return {
    id,
    kind: 'folder',
    parentId,
    name,
    environmentId,
    tags: [],
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
  }
}

const environments: EnvironmentProfile[] = [
  {
    id: 'env-dev',
    label: 'Dev',
    color: '#2dbf9b',
    risk: 'low',
    variables: {},
    sensitiveKeys: [],
    requiresConfirmation: false,
    safeMode: false,
    exportable: true,
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
  },
  {
    id: 'env-prod',
    label: 'Prod',
    color: '#e06c75',
    risk: 'high',
    variables: {},
    sensitiveKeys: [],
    requiresConfirmation: true,
    safeMode: true,
    exportable: false,
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
  },
]

function item(id: string, name: string, parentId?: string): LibraryNode {
  return {
    id,
    kind: 'query',
    parentId,
    name,
    tags: [],
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    queryText: 'select 1;',
    language: 'sql',
  }
}

function closedTab(id: string, title: string): ClosedQueryTabSnapshot {
  return {
    id,
    title,
    connectionId: 'connection-1',
    environmentId: 'environment-1',
    family: 'sql',
    language: 'sql',
    editorLabel: 'SQL',
    queryText: 'select 1;',
    status: 'idle',
    dirty: false,
    history: [],
    closedAt: '2026-05-14T11:00:00.000Z',
    closeReason: 'user',
  }
}
