import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import type {
  ConnectionProfile,
  EnvironmentProfile,
  QueryTabState,
} from '@universality/shared-types'
import {
  CloseIcon,
  DatabaseIcon,
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
}: EditorTabsProps) {
  const [editingTabId, setEditingTabId] = useState<string>()
  const [draftTitle, setDraftTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<TabContextMenuState>()

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

  const contextTab = contextMenu
    ? tabs.find((tab) => tab.id === contextMenu.tabId)
    : undefined

  return (
    <div className="editor-tabs" role="tablist" aria-label="Editor tabs">
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

        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            className={`editor-tab${active ? ' is-active' : ''}${environment ? ' has-environment-color' : ''}`}
            style={tabStyle}
            title={`${tab.title}: ${environment?.label ?? 'No environment'} query tab.`}
            onClick={() => onSelectTab(tab.id)}
            onContextMenu={(event) => openContextMenu(event, tab)}
            onDoubleClick={() => beginRename(tab)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectTab(tab.id)
              }

              if (event.key === 'F2') {
                event.preventDefault()
                beginRename(tab)
              }
            }}
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
              <span className="editor-tab-label">{tab.title}</span>
            )}
            {environment ? (
              <span className="editor-tab-environment" title={`Environment: ${environment.label}`}>
                {environment.label}
              </span>
            ) : null}
            {tab.dirty ? <span className="editor-tab-dirty" aria-hidden="true" /> : null}
            {tab.pinned ? <span className="editor-tab-pin">Pinned</span> : null}
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
        </div>
      ) : null}

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
    </div>
  )
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
