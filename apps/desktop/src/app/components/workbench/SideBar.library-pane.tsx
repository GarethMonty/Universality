import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type {
  ClosedQueryTabSnapshot,
  EnvironmentProfile,
  LibraryNode,
} from '@datapadplusplus/shared-types'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  DatabaseIcon,
  EnvironmentsIcon,
  ExplorerIcon,
  PlayIcon,
  PlusIcon,
  RenameIcon,
  TrashIcon,
} from './icons'
import { sidebarSectionId } from './SideBar.helpers'

interface LibraryPaneProps {
  closedTabs: ClosedQueryTabSnapshot[]
  environments: EnvironmentProfile[]
  libraryFilter: string
  libraryNodes: LibraryNode[]
  sectionStates: Record<string, boolean>
  onCreateFolder(parentId?: string): void
  onDeleteNode(nodeId: string): void
  onLibraryFilterChange(value: string): void
  onMoveNode(nodeId: string, parentId?: string): void
  onOpenLibraryItem(nodeId: string): void
  onRenameNode(nodeId: string, name: string): void
  onReopenClosedTab(closedTabId: string): void
  onSaveCurrentQuery(): void
  onSetNodeEnvironment(nodeId: string, environmentId?: string): void
  onSidebarSectionExpandedChange(sectionId: string, expanded: boolean): void
}

interface TreeNode {
  node: LibraryNode
  children: TreeNode[]
}

interface LibraryContextMenuState {
  node: LibraryNode
  x: number
  y: number
}

interface LibraryPointerDragState {
  nodeId: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
}

interface LibraryDropTarget {
  kind: 'folder' | 'root'
  parentId?: string
}

interface LibraryEnvironmentState {
  environment: EnvironmentProfile
  source: 'direct' | 'inherited'
  sourceNode: LibraryNode
}

const POINTER_DRAG_THRESHOLD = 4
const RECENTS_SECTION_ID = 'library:recents'
const DEFAULT_RECENTS_HEIGHT = 180
const MIN_RECENTS_HEIGHT = 92
const MAX_RECENTS_HEIGHT = 360

export function LibraryPane({
  closedTabs,
  environments,
  libraryFilter,
  libraryNodes,
  sectionStates,
  onCreateFolder,
  onDeleteNode,
  onLibraryFilterChange,
  onMoveNode,
  onOpenLibraryItem,
  onRenameNode,
  onReopenClosedTab,
  onSaveCurrentQuery,
  onSetNodeEnvironment,
  onSidebarSectionExpandedChange,
}: LibraryPaneProps) {
  const [contextMenu, setContextMenu] = useState<LibraryContextMenuState>()
  const [draggedNodeId, setDraggedNodeId] = useState<string>()
  const pointerDragRef = useRef<LibraryPointerDragState | undefined>(undefined)
  const suppressOpenClickNodeIdRef = useRef<string | undefined>(undefined)
  const [rootDragActive, setRootDragActive] = useState(false)
  const [folderDropTargetId, setFolderDropTargetId] = useState<string>()
  const [recentsHeight, setRecentsHeight] = useState(readInitialRecentsHeight)
  const [isResizingRecents, setIsResizingRecents] = useState(false)
  const lastRecentsPointerY = useRef(0)
  const filteredNodes = useMemo(
    () => filterLibraryNodes(libraryNodes, libraryFilter),
    [libraryFilter, libraryNodes],
  )
  const tree = useMemo(() => buildLibraryTree(filteredNodes), [filteredNodes])
  const hasLibraryNodes = filteredNodes.length > 0
  const recentLibraryItems = useMemo(() => recentLibraryNodes(libraryNodes), [libraryNodes])
  const recentsCount = recentLibraryItems.length + closedTabs.length
  const recentsExpanded = sectionStates[RECENTS_SECTION_ID] ?? true

  useEffect(() => {
    if (!contextMenu) {
      return undefined
    }

    const close = () => setContextMenu(undefined)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
    }
  }, [contextMenu])

  const renameNode = (node: LibraryNode) => {
    const name = window.prompt(`Rename ${node.name}`, node.name)
    if (name?.trim()) {
      onRenameNode(node.id, name.trim())
    }
  }

  const deleteNode = (node: LibraryNode) => {
    const suffix = node.kind === 'folder' ? ' and everything inside it' : ''
    if (window.confirm(`Delete ${node.name}${suffix}?`)) {
      onDeleteNode(node.id)
    }
  }

  const moveNode = (node: LibraryNode) => {
    const folderPath = window.prompt(
      'Move to Library folder',
      node.parentId
        ? libraryNodePath(libraryNodes, libraryNodes.find((item) => item.id === node.parentId))
        : '',
    )
    const parentId = folderPath?.trim()
      ? findFolderIdByPath(libraryNodes, folderPath.trim())
      : undefined

    if (folderPath !== null && (!folderPath.trim() || parentId)) {
      onMoveNode(node.id, parentId)
    }
  }

  const showDropTarget = (target?: LibraryDropTarget) => {
    setRootDragActive(target?.kind === 'root')
    setFolderDropTargetId(target?.kind === 'folder' ? target.parentId : undefined)
  }

  const clearDrag = () => {
    pointerDragRef.current = undefined
    setDraggedNodeId(undefined)
    setFolderDropTargetId(undefined)
    setRootDragActive(false)
  }

  const beginPointerDrag = (nodeId: string, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    pointerDragRef.current = {
      nodeId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const updatePointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = pointerDragRef.current

    if (!session || session.pointerId !== event.pointerId) {
      return
    }

    const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)
    if (!session.active && distance < POINTER_DRAG_THRESHOLD) {
      return
    }

    session.active = true
    setDraggedNodeId(session.nodeId)
    showDropTarget(dropTargetFromPoint(event.clientX, event.clientY, session.nodeId, libraryNodes))
    event.preventDefault()
    event.stopPropagation()
  }

  const finishPointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = pointerDragRef.current

    if (!session || session.pointerId !== event.pointerId) {
      return
    }

    if (session.active) {
      const target = dropTargetFromPoint(event.clientX, event.clientY, session.nodeId, libraryNodes)

      if (target) {
        onMoveNode(session.nodeId, target.parentId)
      }
      suppressOpenClickNodeIdRef.current = session.nodeId
      window.setTimeout(() => {
        if (suppressOpenClickNodeIdRef.current === session.nodeId) {
          suppressOpenClickNodeIdRef.current = undefined
        }
      }, 0)
      event.preventDefault()
      event.stopPropagation()
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId)
    clearDrag()
  }

  const shouldSuppressOpenClick = (nodeId: string) => {
    if (suppressOpenClickNodeIdRef.current !== nodeId) {
      return false
    }
    suppressOpenClickNodeIdRef.current = undefined
    return true
  }

  const resizeRecents = (nextHeight: number) => {
    const clamped = clamp(nextHeight, MIN_RECENTS_HEIGHT, MAX_RECENTS_HEIGHT)
    setRecentsHeight(clamped)
    window.localStorage.setItem('datapadplusplus.library.recentsHeight', String(clamped))
  }

  return (
    <>
      <div className="sidebar-header">
        <h1>Library</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="New library folder"
            title="Create a folder in the Library."
            onClick={() => onCreateFolder()}
          >
            <ExplorerIcon className="sidebar-icon" />
          </button>
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="Save current query to library"
            title="Save the active query tab to the Library."
            onClick={onSaveCurrentQuery}
          >
            <PlusIcon className="sidebar-icon" />
          </button>
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Search library</span>
        <input
          type="search"
          placeholder="Search library"
          value={libraryFilter}
          onChange={(event) => onLibraryFilterChange(event.target.value)}
        />
      </label>

      <div className="library-workspace">
        <div
          className={`library-main-scroll${draggedNodeId ? ' is-library-dragging' : ''}${
            rootDragActive ? ' is-library-root-drag-over' : ''
          }`}
          data-library-drop-root="true"
        >
          {!hasLibraryNodes && recentsCount === 0 ? (
            <div className="sidebar-empty">
              <DatabaseIcon className="empty-icon" />
              <p>No Library items yet.</p>
            </div>
          ) : null}

          <div
            className="library-root-drop-target"
            role="button"
            tabIndex={0}
            aria-label="Move library item to root"
            data-library-drop-root="true"
          >
            <span className="sr-only">Drop here to move to Library root</span>
          </div>

          <div className="library-tree" role="tree" aria-label="Library tree">
            {tree.map((item) => (
              <LibraryTreeItem
                key={item.node.id}
                item={item}
                environments={environments}
                libraryNodes={libraryNodes}
                draggedNodeId={draggedNodeId}
                folderDropTargetId={folderDropTargetId}
                sectionStates={sectionStates}
                depth={0}
                onContextMenu={setContextMenu}
                onCreateFolder={onCreateFolder}
                onDeleteNode={deleteNode}
                onBeginPointerDrag={beginPointerDrag}
                onClearDrag={clearDrag}
                onFinishPointerDrag={finishPointerDrag}
                onOpenLibraryItem={onOpenLibraryItem}
                onPointerDragMove={updatePointerDrag}
                onRenameNode={renameNode}
                onSidebarSectionExpandedChange={onSidebarSectionExpandedChange}
                shouldSuppressOpenClick={shouldSuppressOpenClick}
              />
            ))}
          </div>
        </div>

        {recentsCount > 0 ? (
          <section
            className={`library-recents-panel sidebar-section${
              recentsExpanded ? ' is-expanded' : ' is-collapsed'
            }${isResizingRecents ? ' is-resizing' : ''}`}
          >
            {recentsExpanded ? (
              <div
                role="separator"
                aria-label="Resize Recents"
                aria-orientation="horizontal"
                aria-valuemin={MIN_RECENTS_HEIGHT}
                aria-valuemax={MAX_RECENTS_HEIGHT}
                aria-valuenow={recentsHeight}
                className="library-recents-resize-handle"
                tabIndex={0}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  lastRecentsPointerY.current = event.clientY
                  setIsResizingRecents(true)
                }}
                onPointerMove={(event) => {
                  if (!isResizingRecents) {
                    return
                  }
                  const delta = lastRecentsPointerY.current - event.clientY
                  lastRecentsPointerY.current = event.clientY
                  resizeRecents(recentsHeight + delta)
                }}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture?.(event.pointerId)
                  setIsResizingRecents(false)
                }}
                onPointerCancel={() => setIsResizingRecents(false)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    resizeRecents(recentsHeight + 16)
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    resizeRecents(recentsHeight - 16)
                  }
                }}
              />
            ) : null}
            <button
              type="button"
              className="sidebar-section-header sidebar-section-header--button"
              aria-label={`${recentsExpanded ? 'Collapse' : 'Expand'} Recents section (${recentsCount})`}
              aria-expanded={recentsExpanded}
              aria-controls="library-recents-body"
              onClick={() => onSidebarSectionExpandedChange(RECENTS_SECTION_ID, !recentsExpanded)}
            >
              <span className="sidebar-section-title">
                {recentsExpanded ? (
                  <ChevronDownIcon className="sidebar-section-chevron" />
                ) : (
                  <ChevronRightIcon className="sidebar-section-chevron" />
                )}
                <span>Recents</span>
              </span>
              <span>{recentsCount}</span>
            </button>

            {recentsExpanded ? (
              <div
                id="library-recents-body"
                className="library-recents-body"
                style={{ height: recentsHeight }}
              >
                {recentLibraryItems.map((node) => (
                  <div key={`recent-${node.id}`} className="saved-work-row">
                    <div className="saved-work-title-row">
                      <strong>{node.name}</strong>
                      <span>{node.kind}</span>
                    </div>
                    <p>{formatRecentAt(node.lastOpenedAt)}</p>
                    <div className="saved-work-meta-row">
                      <small>{node.language ?? 'text'} / Library</small>
                      <span className="saved-work-actions">
                        <button
                          type="button"
                          className="sidebar-icon-button sidebar-icon-button--inline"
                          aria-label={`Open recent library item ${node.name}`}
                          title={`Open ${node.name}.`}
                          onClick={() => onOpenLibraryItem(node.id)}
                        >
                          <PlayIcon className="sidebar-icon" />
                        </button>
                      </span>
                    </div>
                  </div>
                ))}

                {closedTabs.slice(0, 8).map((tab) => (
                  <div key={`${tab.id}-${tab.closedAt}`} className="saved-work-row">
                    <div className="saved-work-title-row">
                      <strong>{tab.title}</strong>
                      <span>{tab.dirty ? 'edited' : 'closed'}</span>
                    </div>
                    <p>{formatClosedAt(tab.closedAt)}</p>
                    <div className="saved-work-meta-row">
                      <small>{tab.language} / recovery</small>
                      <span className="saved-work-actions">
                        <button
                          type="button"
                          className="sidebar-icon-button sidebar-icon-button--inline"
                          aria-label={`Reopen closed tab ${tab.title}`}
                          title={`Recover recently closed tab ${tab.title}.`}
                          onClick={() => onReopenClosedTab(tab.id)}
                        >
                          <PlayIcon className="sidebar-icon" />
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {contextMenu ? (
        <div
          className="connection-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextMenu.node.kind !== 'folder' ? (
            <button
              type="button"
              className="connection-context-menu-item"
              role="menuitem"
              onClick={() => {
                onOpenLibraryItem(contextMenu.node.id)
                setContextMenu(undefined)
              }}
            >
              <PlayIcon className="connection-context-menu-icon" />
              <span>Open</span>
            </button>
          ) : null}
          <button
            type="button"
            className="connection-context-menu-item"
            role="menuitem"
            onClick={() => {
              onCreateFolder(
                contextMenu.node.kind === 'folder'
                  ? contextMenu.node.id
                  : contextMenu.node.parentId,
              )
              setContextMenu(undefined)
            }}
          >
            <PlusIcon className="connection-context-menu-icon" />
            <span>New Folder</span>
          </button>
          <button
            type="button"
            className="connection-context-menu-item"
            role="menuitem"
            onClick={() => {
              renameNode(contextMenu.node)
              setContextMenu(undefined)
            }}
          >
            <RenameIcon className="connection-context-menu-icon" />
            <span>Rename</span>
          </button>
          <button
            type="button"
            className="connection-context-menu-item"
            role="menuitem"
            onClick={() => {
              moveNode(contextMenu.node)
              setContextMenu(undefined)
            }}
          >
            <ExplorerIcon className="connection-context-menu-icon" />
            <span>Move to Folder</span>
          </button>
          <div className="connection-context-menu-separator" role="separator" />
          <div className="connection-context-menu-section-label">Environment</div>
          <button
            type="button"
            className="connection-context-menu-item"
            role="menuitem"
            onClick={() => {
              onSetNodeEnvironment(contextMenu.node.id, undefined)
              setContextMenu(undefined)
            }}
          >
            <EnvironmentsIcon className="connection-context-menu-icon" />
            <span>Inherit from parent</span>
          </button>
          {environments.map((environment) => (
            <button
              key={environment.id}
              type="button"
              className="connection-context-menu-item"
              role="menuitem"
              aria-label={`Assign environment ${environment.label} to ${contextMenu.node.name}`}
              onClick={() => {
                onSetNodeEnvironment(contextMenu.node.id, environment.id)
                setContextMenu(undefined)
              }}
            >
              <span
                className="library-env-swatch"
                style={libraryEnvironmentStyle(environment)}
              />
              <span>{environment.label}</span>
            </button>
          ))}
          <div className="connection-context-menu-separator" role="separator" />
          <button
            type="button"
            className="connection-context-menu-item connection-context-menu-item--danger"
            role="menuitem"
            onClick={() => {
              deleteNode(contextMenu.node)
              setContextMenu(undefined)
            }}
          >
            <TrashIcon className="connection-context-menu-icon" />
            <span>Delete</span>
          </button>
        </div>
      ) : null}
    </>
  )
}

function LibraryTreeItem({
  item,
  environments,
  libraryNodes,
  draggedNodeId,
  folderDropTargetId,
  sectionStates,
  depth,
  onContextMenu,
  onCreateFolder,
  onDeleteNode,
  onBeginPointerDrag,
  onClearDrag,
  onFinishPointerDrag,
  onOpenLibraryItem,
  onPointerDragMove,
  onRenameNode,
  onSidebarSectionExpandedChange,
  shouldSuppressOpenClick,
}: {
  item: TreeNode
  environments: EnvironmentProfile[]
  libraryNodes: LibraryNode[]
  draggedNodeId?: string
  folderDropTargetId?: string
  sectionStates: Record<string, boolean>
  depth: number
  onContextMenu(state: LibraryContextMenuState): void
  onCreateFolder(parentId?: string): void
  onDeleteNode(node: LibraryNode): void
  onBeginPointerDrag(nodeId: string, event: ReactPointerEvent<HTMLElement>): void
  onClearDrag(): void
  onFinishPointerDrag(event: ReactPointerEvent<HTMLElement>): void
  onOpenLibraryItem(nodeId: string): void
  onPointerDragMove(event: ReactPointerEvent<HTMLElement>): void
  onRenameNode(node: LibraryNode): void
  onSidebarSectionExpandedChange(sectionId: string, expanded: boolean): void
  shouldSuppressOpenClick(nodeId: string): boolean
}) {
  const { node, children } = item
  const isFolder = node.kind === 'folder'
  const sectionId = sidebarSectionId('library', 'node', node.id)
  const expanded = sectionStates[sectionId] ?? depth === 0
  const environmentState = effectiveEnvironmentForNode(node, libraryNodes, environments)
  const environment = environmentState?.environment
  const canDropOnFolder =
    isFolder && Boolean(draggedNodeId) && canMoveLibraryNode(libraryNodes, draggedNodeId, node.id)

  return (
    <div
      className={`library-tree-item${draggedNodeId === node.id ? ' is-dragging' : ''}${
        canDropOnFolder && folderDropTargetId === node.id ? ' is-folder-drop-target' : ''
      }`}
      role="treeitem"
      aria-expanded={isFolder ? expanded : undefined}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onContextMenu({ node, x: event.clientX, y: event.clientY })
      }}
    >
      <div
        className={`library-tree-row${
          environmentState ? ` has-library-env is-library-env-${environmentState.source}` : ''
        }`}
        data-library-folder-id={isFolder ? node.id : undefined}
        data-library-row="true"
        style={{
          paddingLeft: 8 + depth * 14,
          ...libraryEnvironmentStyle(environment),
        }}
      >
        {isFolder ? (
          <button
            type="button"
            className="sidebar-icon-button sidebar-icon-button--inline"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
            onClick={() => onSidebarSectionExpandedChange(sectionId, !expanded)}
          >
            {expanded ? (
              <ChevronDownIcon className="sidebar-icon" />
            ) : (
              <ChevronRightIcon className="sidebar-icon" />
            )}
          </button>
        ) : (
          <span className="library-tree-spacer" />
        )}
        <button
          type="button"
          className="library-tree-label"
          onPointerDown={(event) => onBeginPointerDrag(node.id, event)}
          onPointerMove={onPointerDragMove}
          onPointerUp={onFinishPointerDrag}
          onPointerCancel={() => {
            onClearDrag()
          }}
          onDoubleClick={() => onRenameNode(node)}
          onClick={() => {
            if (shouldSuppressOpenClick(node.id)) {
              return
            }
            if (!isFolder) {
              onOpenLibraryItem(node.id)
            }
          }}
        >
          <span className={`library-node-icon library-node-icon--${node.kind}`} />
          <span>{node.name}</span>
        </button>
        {environmentState ? (
          <span
            className={`library-env-badge is-${environmentState.source}`}
            title={environmentBadgeTitle(environmentState)}
          >
            {environmentState.environment.label}
          </span>
        ) : null}
        <span className="saved-work-actions">
          {isFolder ? (
            <button
              type="button"
              className="sidebar-icon-button sidebar-icon-button--inline"
              aria-label={`Create folder in ${node.name}`}
              onClick={() => onCreateFolder(node.id)}
            >
              <PlusIcon className="sidebar-icon" />
            </button>
          ) : null}
          <button
            type="button"
            className="sidebar-icon-button sidebar-icon-button--inline"
            aria-label={`Rename ${node.name}`}
            onClick={() => onRenameNode(node)}
          >
            <RenameIcon className="sidebar-icon" />
          </button>
          <button
            type="button"
            className="sidebar-icon-button sidebar-icon-button--inline"
            aria-label={`Delete ${node.name}`}
            onClick={() => onDeleteNode(node)}
          >
            <CloseIcon className="sidebar-icon" />
          </button>
        </span>
      </div>
      {isFolder && expanded && children.length > 0 ? (
        <div role="group">
          {children.map((child) => (
            <LibraryTreeItem
              key={child.node.id}
              item={child}
              environments={environments}
              libraryNodes={libraryNodes}
              draggedNodeId={draggedNodeId}
              folderDropTargetId={folderDropTargetId}
              sectionStates={sectionStates}
              depth={depth + 1}
              onContextMenu={onContextMenu}
              onCreateFolder={onCreateFolder}
              onDeleteNode={onDeleteNode}
              onBeginPointerDrag={onBeginPointerDrag}
              onClearDrag={onClearDrag}
              onFinishPointerDrag={onFinishPointerDrag}
              onOpenLibraryItem={onOpenLibraryItem}
              onPointerDragMove={onPointerDragMove}
              onRenameNode={onRenameNode}
              onSidebarSectionExpandedChange={onSidebarSectionExpandedChange}
              shouldSuppressOpenClick={shouldSuppressOpenClick}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function filterLibraryNodes(nodes: LibraryNode[], filter: string) {
  const normalizedFilter = filter.trim().toLowerCase()
  if (!normalizedFilter) {
    return nodes
  }

  const matchingIds = new Set<string>()
  nodes.forEach((node) => {
    const haystack = `${node.name} ${node.kind} ${node.summary ?? ''} ${(node.tags ?? []).join(
      ' ',
    )}`.toLowerCase()
    if (haystack.includes(normalizedFilter)) {
      matchingIds.add(node.id)
      let parentId = node.parentId
      while (parentId) {
        matchingIds.add(parentId)
        parentId = nodes.find((candidate) => candidate.id === parentId)?.parentId
      }
    }
  })

  return nodes.filter((node) => matchingIds.has(node.id))
}

function buildLibraryTree(nodes: LibraryNode[]) {
  const byParent = new Map<string, LibraryNode[]>()
  nodes.forEach((node) => {
    byParent.set(node.parentId ?? 'root', [...(byParent.get(node.parentId ?? 'root') ?? []), node])
  })

  const build = (parentId: string): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort(sortLibraryNodes)
      .map((node) => ({
        node,
        children: build(node.id),
      }))

  return build('root')
}

function sortLibraryNodes(left: LibraryNode, right: LibraryNode) {
  if (left.kind === 'folder' && right.kind !== 'folder') {
    return -1
  }
  if (left.kind !== 'folder' && right.kind === 'folder') {
    return 1
  }
  return left.name.localeCompare(right.name)
}

function recentLibraryNodes(nodes: LibraryNode[]) {
  return nodes
    .filter((node) => node.kind !== 'folder' && Boolean(node.lastOpenedAt))
    .slice()
    .sort((left, right) => timestampValue(right.lastOpenedAt) - timestampValue(left.lastOpenedAt))
    .slice(0, 8)
}

function libraryNodePath(nodes: LibraryNode[], node: LibraryNode | undefined) {
  if (!node) {
    return ''
  }

  const names = [node.name]
  let parentId = node.parentId
  const visited = new Set<string>()

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = nodes.find((candidate) => candidate.id === parentId)
    if (!parent) {
      break
    }
    names.unshift(parent.name)
    parentId = parent.parentId
  }

  return names.join(' / ')
}

function findFolderIdByPath(nodes: LibraryNode[], path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/\s*\/\s*/g, ' / ').trim()
  return nodes.find(
    (node) =>
      node.kind === 'folder' &&
      libraryNodePath(nodes, node).toLowerCase() === normalized.toLowerCase(),
  )?.id
}

function dropTargetFromPoint(
  clientX: number,
  clientY: number,
  nodeId: string,
  nodes: LibraryNode[],
): LibraryDropTarget | undefined {
  const element = document.elementFromPoint(clientX, clientY)

  if (!(element instanceof Element)) {
    return undefined
  }

  const folderRow = element.closest<HTMLElement>('[data-library-folder-id]')
  const folderId = folderRow?.dataset.libraryFolderId

  if (folderId && canMoveLibraryNode(nodes, nodeId, folderId)) {
    return { kind: 'folder', parentId: folderId }
  }

  const insideLibraryRoot = element.closest('[data-library-drop-root="true"]')
  const insideLibraryRow = element.closest('[data-library-row="true"]')

  if (insideLibraryRoot && !insideLibraryRow && canMoveLibraryNode(nodes, nodeId)) {
    return { kind: 'root' }
  }

  return undefined
}

function canMoveLibraryNode(
  nodes: LibraryNode[],
  nodeId: string | undefined,
  parentId?: string,
) {
  if (!nodeId) {
    return false
  }

  const node = nodes.find((candidate) => candidate.id === nodeId)

  if (!node || node.parentId === parentId) {
    return false
  }

  if (!parentId) {
    return true
  }

  const parent = nodes.find((candidate) => candidate.id === parentId)

  if (!parent || parent.kind !== 'folder' || parent.id === nodeId) {
    return false
  }

  let current: LibraryNode | undefined = parent
  const visited = new Set<string>()

  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.parentId === nodeId) {
      return false
    }
    current = nodes.find((candidate) => candidate.id === current?.parentId)
  }

  return true
}

function effectiveEnvironmentForNode(
  node: LibraryNode,
  nodes: LibraryNode[],
  environments: EnvironmentProfile[],
): LibraryEnvironmentState | undefined {
  let current: LibraryNode | undefined = node
  const visited = new Set<string>()

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.environmentId) {
      const environment = environments.find((item) => item.id === current?.environmentId)

      return environment
        ? {
            environment,
            source: current.id === node.id ? 'direct' : 'inherited',
            sourceNode: current,
          }
        : undefined
    }
    current = current.parentId
      ? nodes.find((candidate) => candidate.id === current?.parentId)
      : undefined
  }

  return undefined
}

function environmentBadgeTitle(state: LibraryEnvironmentState) {
  return state.source === 'direct'
    ? `${state.environment.label} is assigned here.`
    : `${state.environment.label} is inherited from ${state.sourceNode.name}.`
}

function libraryEnvironmentStyle(environment?: EnvironmentProfile): CSSProperties | undefined {
  const color = normalizeHexColor(environment?.color)

  if (!color) {
    return undefined
  }

  return {
    '--library-env-color': color,
    '--library-env-tint': hexToRgba(color, 0.08),
    '--library-env-border': hexToRgba(color, 0.36),
  } as CSSProperties
}

function normalizeHexColor(color?: string) {
  if (!color) {
    return undefined
  }

  const trimmed = color.trim()

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, red, green, blue] = trimmed
    return `#${red}${red}${green}${green}${blue}${blue}`
  }

  return undefined
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function readInitialRecentsHeight() {
  const raw = window.localStorage.getItem('datapadplusplus.library.recentsHeight')
  const parsed = raw ? Number(raw) : DEFAULT_RECENTS_HEIGHT
  return clamp(parsed, MIN_RECENTS_HEIGHT, MAX_RECENTS_HEIGHT)
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, Math.min(max, value))
}

function formatClosedAt(closedAt: string) {
  const date = new Date(closedAt)

  if (Number.isNaN(date.getTime())) {
    return 'Closed recently'
  }

  return `Closed ${date.toLocaleString()}`
}

function formatRecentAt(openedAt: string | undefined) {
  if (!openedAt) {
    return 'Opened recently'
  }

  const date = new Date(openedAt)

  if (Number.isNaN(date.getTime())) {
    return 'Opened recently'
  }

  return `Opened ${date.toLocaleString()}`
}

function timestampValue(value: string | undefined) {
  if (!value) {
    return 0
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}
