import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type WheelEvent,
} from 'react'
import type {
  ConnectionProfile,
  EnvironmentProfile,
  QueryTabState,
} from '@universality/shared-types'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  DatabaseIcon,
  MoveFirstIcon,
  MoveLastIcon,
  PlusIcon,
  RenameIcon,
  SaveIcon,
} from './icons'

interface TabContextMenuState {
  tabId: string
  x: number
  y: number
}

interface EditorTabsProps {
  tabs: QueryTabState[]
  activeTabId: string
  connections: ConnectionProfile[]
  environments: EnvironmentProfile[]
  canCreateTab: boolean
  onSelectTab(tabId: string): void
  onCloseTab(tabId: string): void
  onCreateTab(): void
  onRenameTab(tabId: string, title: string): void
  onSaveTab(tabId: string): void
  onReorderTabs(orderedTabIds: string[]): void
  onCloseTabs(tabIds: string[]): void
}

const QUERY_TITLE_SUFFIXES = [
  'sql',
  'json',
  'text',
  'mongodb',
  'cql',
  'cypher',
  'flux',
  'redis',
  'aql',
  'gremlin',
  'sparql',
  'promql',
  'influxql',
  'opentsdb',
  'query-dsl',
  'esql',
  'google-sql',
  'snowflake-sql',
  'clickhouse-sql',
]

const QUERY_TITLE_SUFFIX_PATTERN = new RegExp(
  `(?:\\.(${QUERY_TITLE_SUFFIXES.join('|')}))$`,
  'i',
)

function normalizeTabDisplayTitle(title: string) {
  return title.replace(QUERY_TITLE_SUFFIX_PATTERN, '')
}

export function EditorTabs({
  tabs,
  activeTabId,
  connections,
  environments,
  canCreateTab,
  onSelectTab,
  onCloseTab,
  onCreateTab,
  onRenameTab,
  onSaveTab,
  onReorderTabs,
  onCloseTabs,
}: EditorTabsProps) {
  const [editingTabId, setEditingTabId] = useState<string>()
  const [draftTitle, setDraftTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<TabContextMenuState>()
  const [draggingTabId, setDraggingTabId] = useState<string>()
  const [dropTarget, setDropTarget] = useState<{
    tabId: string
    placement: 'before' | 'after'
  }>()
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  })
  const stripRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const closeContextMenu = () => setContextMenu(undefined)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('pointerdown', closeContextMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', closeContextMenu)
    return () => {
      window.removeEventListener('pointerdown', closeContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', closeContextMenu)
    }
  }, [contextMenu])

  useEffect(() => {
    const strip = stripRef.current

    if (!strip) {
      return
    }

    const updateScrollState = () => {
      const maxScrollLeft = strip.scrollWidth - strip.clientWidth
      setScrollState({
        canScrollLeft: strip.scrollLeft > 1,
        canScrollRight: strip.scrollLeft < maxScrollLeft - 1,
      })
    }

    updateScrollState()
    strip.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(updateScrollState)
    resizeObserver?.observe(strip)

    return () => {
      strip.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
      resizeObserver?.disconnect()
    }
  }, [tabs.length])

  useEffect(() => {
    const activeTab = tabRefs.current.get(activeTabId)

    activeTab?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeTabId, tabs])

  const beginRename = (tab: QueryTabState) => {
    setEditingTabId(tab.id)
    setDraftTitle(tab.title)
    onSelectTab(tab.id)
  }

  const commitRename = (tab: QueryTabState) => {
    const nextTitle = draftTitle.trim()
    setEditingTabId(undefined)

    if (nextTitle && nextTitle !== tab.title) {
      onRenameTab(tab.id, nextTitle)
    }
  }

  const openContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    tab: QueryTabState,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    onSelectTab(tab.id)
    setContextMenu({
      tabId: tab.id,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const scrollTabs = (direction: 'left' | 'right') => {
    const strip = stripRef.current

    if (!strip) {
      return
    }

    const delta = Math.max(160, Math.floor(strip.clientWidth * 0.55))
    if (strip.scrollBy) {
      strip.scrollBy({
        left: direction === 'left' ? -delta : delta,
        behavior: 'smooth',
      })
    } else {
      strip.scrollLeft += direction === 'left' ? -delta : delta
    }
  }

  const scrollTabsOnWheel = (event: WheelEvent<HTMLDivElement>) => {
    const strip = stripRef.current

    if (!strip || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    event.preventDefault()
    strip.scrollLeft += event.deltaY
  }

  const orderedTabIds = tabs.map((tab) => tab.id)

  const moveTab = (tabId: string, targetIndex: number) => {
    const sourceIndex = orderedTabIds.indexOf(tabId)

    if (sourceIndex < 0) {
      return
    }

    const nextOrder = [...orderedTabIds]
    const [movedTabId] = nextOrder.splice(sourceIndex, 1)

    if (!movedTabId) {
      return
    }

    const clampedTargetIndex = Math.min(
      Math.max(targetIndex, 0),
      nextOrder.length,
    )
    nextOrder.splice(clampedTargetIndex, 0, movedTabId)

    if (nextOrder.some((id, index) => id !== orderedTabIds[index])) {
      onReorderTabs(nextOrder)
    }
  }

  const moveTabRelative = (tabId: string, direction: 'left' | 'right') => {
    const index = orderedTabIds.indexOf(tabId)

    if (index < 0) {
      return
    }

    moveTab(tabId, direction === 'left' ? index - 1 : index + 1)
  }

  const moveTabToEdge = (tabId: string, edge: 'first' | 'last') => {
    moveTab(tabId, edge === 'first' ? 0 : orderedTabIds.length - 1)
  }

  const dropTab = (
    event: DragEvent<HTMLDivElement>,
    targetTab: QueryTabState,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const sourceTabId =
      draggingTabId || event.dataTransfer.getData('application/x-universality-tab-id')

    setDraggingTabId(undefined)
    setDropTarget(undefined)

    if (!sourceTabId || sourceTabId === targetTab.id) {
      return
    }

    const sourceIndex = orderedTabIds.indexOf(sourceTabId)
    const targetIndex = orderedTabIds.indexOf(targetTab.id)

    if (sourceIndex < 0 || targetIndex < 0) {
      return
    }

    const placement = dropPlacement(event)
    const adjustedTargetIndex =
      placement === 'after' && sourceIndex > targetIndex
        ? targetIndex + 1
        : placement === 'after'
          ? targetIndex
          : sourceIndex < targetIndex
            ? targetIndex - 1
            : targetIndex

    moveTab(sourceTabId, adjustedTargetIndex)
  }

  const closeOtherTabs = (tabId: string) => {
    onCloseTabs(tabs.filter((tab) => tab.id !== tabId).map((tab) => tab.id))
  }

  const closeTabsToRight = (tabId: string) => {
    const index = orderedTabIds.indexOf(tabId)

    if (index < 0) {
      return
    }

    onCloseTabs(orderedTabIds.slice(index + 1))
  }

  const tabKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    tab: QueryTabState,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelectTab(tab.id)
    }

    if (event.key === 'F2') {
      event.preventDefault()
      beginRename(tab)
    }

    if (event.altKey && event.shiftKey && event.key === 'ArrowLeft') {
      event.preventDefault()
      moveTabRelative(tab.id, 'left')
    }

    if (event.altKey && event.shiftKey && event.key === 'ArrowRight') {
      event.preventDefault()
      moveTabRelative(tab.id, 'right')
    }
  }

  const contextTab = contextMenu
    ? tabs.find((tab) => tab.id === contextMenu.tabId)
    : undefined
  const contextTabIndex = contextTab ? orderedTabIds.indexOf(contextTab.id) : -1

  return (
    <div className="editor-tabs-shell">
      <button
        type="button"
        className="editor-tab-scroll-button"
        aria-label="Scroll tabs left"
        title="Scroll tabs left"
        disabled={!scrollState.canScrollLeft}
        onClick={() => scrollTabs('left')}
      >
        <ArrowLeftIcon className="editor-tab-scroll-icon" />
      </button>

      <div
        ref={stripRef}
        className="editor-tabs"
        role="tablist"
        aria-label="Editor tabs"
        onWheel={scrollTabsOnWheel}
      >
        {tabs.map((tab) => {
          const connection = connections.find((item) => item.id === tab.connectionId)
          const environment = environments.find((item) => item.id === tab.environmentId)
          const active = tab.id === activeTabId
          const editing = editingTabId === tab.id
          const environmentColor = environment?.color ?? '#3794ff'
          const tabStyle = {
            '--tab-env-color': environmentColor,
            '--tab-env-tint': colorWithAlpha(environmentColor, 0.16),
          } as CSSProperties
          const connectionName = connection?.name ?? 'Unknown connection'
          const environmentName = environment?.label ?? 'No environment'
          const tooltip = `${tab.title}\nConnection: ${connectionName}\nEnvironment: ${environmentName}${
            tab.dirty ? '\nUnsaved changes' : ''
          }`
          const dropBefore =
            dropTarget?.tabId === tab.id && dropTarget.placement === 'before'
          const dropAfter =
            dropTarget?.tabId === tab.id && dropTarget.placement === 'after'

          return (
            <div
              key={tab.id}
              ref={(element) => {
                if (element) {
                  tabRefs.current.set(tab.id, element)
                } else {
                  tabRefs.current.delete(tab.id)
                }
              }}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              draggable={!editing}
              className={`editor-tab${active ? ' is-active' : ''}${active && environment ? ' has-environment-color' : ''}${draggingTabId === tab.id ? ' is-dragging' : ''}${dropBefore ? ' is-drop-before' : ''}${dropAfter ? ' is-drop-after' : ''}`}
              style={tabStyle}
              title={tooltip}
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(event) => openContextMenu(event, tab)}
              onDoubleClick={() => beginRename(tab)}
              onDragStart={(event) => {
                setDraggingTabId(tab.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('application/x-universality-tab-id', tab.id)
              }}
              onDragOver={(event) => {
                if (!draggingTabId || draggingTabId === tab.id) {
                  return
                }

                event.preventDefault()
                setDropTarget({
                  tabId: tab.id,
                  placement: dropPlacement(event),
                })
              }}
              onDragLeave={() => {
                if (dropTarget?.tabId === tab.id) {
                  setDropTarget(undefined)
                }
              }}
              onDrop={(event) => dropTab(event, tab)}
              onDragEnd={() => {
                setDraggingTabId(undefined)
                setDropTarget(undefined)
              }}
              onKeyDown={(event) => tabKeyDown(event, tab)}
            >
              <span className="editor-tab-icon" aria-hidden="true">
                {connection?.icon ?? <DatabaseIcon className="tab-inline-icon" />}
              </span>
              {editing ? (
                <input
                  aria-label={`Rename tab ${tab.title}`}
                  autoFocus
                  className="editor-tab-title-input"
                  value={draftTitle}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => commitRename(tab)}
                  onKeyDown={(event) => {
                    event.stopPropagation()

                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitRename(tab)
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setEditingTabId(undefined)
                    }
                  }}
                />
              ) : (
                <span className="editor-tab-label">
                  {normalizeTabDisplayTitle(tab.title)}
                </span>
              )}
              {tab.dirty ? (
                <span className="editor-tab-dirty" title="Unsaved changes" aria-hidden="true" />
              ) : null}
              {tab.pinned ? (
                <span className="editor-tab-pin" title="Pinned tab" aria-label="Pinned tab">
                  Pinned
                </span>
              ) : null}
              <button
                type="button"
                className="editor-tab-close-button"
                aria-label={`Close tab ${tab.title}`}
                title={
                  tab.savedQueryId && tab.dirty
                    ? 'Close this saved query tab. You will be asked whether to save changes first.'
                    : 'Close this tab and keep a recovery copy in closed tab history.'
                }
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseTab(tab.id)
                }}
              >
                <CloseIcon className="editor-tab-close" />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="editor-tab-scroll-button"
        aria-label="Scroll tabs right"
        title="Scroll tabs right"
        disabled={!scrollState.canScrollRight}
        onClick={() => scrollTabs('right')}
      >
        <ArrowRightIcon className="editor-tab-scroll-icon" />
      </button>

      <button
        type="button"
        className="editor-tab editor-tab--create"
        aria-label="Create query tab"
        disabled={!canCreateTab}
        title={
          canCreateTab
            ? 'Create a new scratch query tab for the selected connection.'
            : 'Create a connection first before opening a query tab.'
        }
        onClick={onCreateTab}
      >
        <PlusIcon className="tab-inline-icon" />
      </button>

      {contextMenu && contextTab ? (
        <div
          className="editor-tab-context-menu"
          role="menu"
          aria-label={`Tab options for ${contextTab.title}`}
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Close tab ${contextTab.title}`}
            onClick={() => {
              setContextMenu(undefined)
              onCloseTab(contextTab.id)
            }}
          >
            <CloseIcon className="editor-tab-context-menu-icon" />
            <span>Close</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Close other tabs except ${contextTab.title}`}
            disabled={tabs.length <= 1}
            onClick={() => {
              setContextMenu(undefined)
              closeOtherTabs(contextTab.id)
            }}
          >
            <CloseIcon className="editor-tab-context-menu-icon" />
            <span>Close Others</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Close tabs to the right of ${contextTab.title}`}
            disabled={contextTabIndex < 0 || contextTabIndex >= tabs.length - 1}
            onClick={() => {
              setContextMenu(undefined)
              closeTabsToRight(contextTab.id)
            }}
          >
            <ArrowRightIcon className="editor-tab-context-menu-icon" />
            <span>Close Tabs to the Right</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label="Close all tabs"
            disabled={tabs.length === 0}
            onClick={() => {
              setContextMenu(undefined)
              onCloseTabs(orderedTabIds)
            }}
          >
            <CloseIcon className="editor-tab-context-menu-icon" />
            <span>Close All</span>
          </button>
          <div className="editor-tab-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Rename tab ${contextTab.title}`}
            onClick={() => {
              setContextMenu(undefined)
              beginRename(contextTab)
            }}
          >
            <RenameIcon className="editor-tab-context-menu-icon" />
            <span>Rename</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Save tab ${contextTab.title}`}
            onClick={() => {
              setContextMenu(undefined)
              onSaveTab(contextTab.id)
            }}
          >
            <SaveIcon className="editor-tab-context-menu-icon" />
            <span>Save</span>
          </button>
          <div className="editor-tab-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Move tab ${contextTab.title} left`}
            disabled={contextTabIndex <= 0}
            onClick={() => {
              setContextMenu(undefined)
              moveTabRelative(contextTab.id, 'left')
            }}
          >
            <ArrowLeftIcon className="editor-tab-context-menu-icon" />
            <span>Move Left</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Move tab ${contextTab.title} right`}
            disabled={contextTabIndex < 0 || contextTabIndex >= tabs.length - 1}
            onClick={() => {
              setContextMenu(undefined)
              moveTabRelative(contextTab.id, 'right')
            }}
          >
            <ArrowRightIcon className="editor-tab-context-menu-icon" />
            <span>Move Right</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Move tab ${contextTab.title} first`}
            disabled={contextTabIndex <= 0}
            onClick={() => {
              setContextMenu(undefined)
              moveTabToEdge(contextTab.id, 'first')
            }}
          >
            <MoveFirstIcon className="editor-tab-context-menu-icon" />
            <span>Move First</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="editor-tab-context-menu-item"
            aria-label={`Move tab ${contextTab.title} last`}
            disabled={contextTabIndex < 0 || contextTabIndex >= tabs.length - 1}
            onClick={() => {
              setContextMenu(undefined)
              moveTabToEdge(contextTab.id, 'last')
            }}
          >
            <MoveLastIcon className="editor-tab-context-menu-icon" />
            <span>Move Last</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

function dropPlacement(event: DragEvent<HTMLDivElement>): 'before' | 'after' {
  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
}

function colorWithAlpha(color: string, alpha: number) {
  const hex = color.trim()

  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return 'rgba(55, 148, 255, 0.14)'
  }

  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
