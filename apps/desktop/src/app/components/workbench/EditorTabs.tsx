import type { ConnectionProfile, QueryTabState } from '@universality/shared-types'
import { CloseIcon, DatabaseIcon, PlusIcon } from './icons'

interface EditorTabsProps {
  tabs: QueryTabState[]
  activeTabId: string
  connections: ConnectionProfile[]
  onSelectTab(tabId: string): void
  onCreateTab(): void
}

export function EditorTabs({
  tabs,
  activeTabId,
  connections,
  onSelectTab,
  onCreateTab,
}: EditorTabsProps) {
  return (
    <div className="editor-tabs" role="tablist" aria-label="Editor tabs">
      {tabs.map((tab) => {
        const connection = connections.find((item) => item.id === tab.connectionId)
        const active = tab.id === activeTabId

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`editor-tab${active ? ' is-active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="editor-tab-icon" aria-hidden="true">
              {connection?.icon ?? <DatabaseIcon className="tab-inline-icon" />}
            </span>
            <span className="editor-tab-label">{tab.title}</span>
            {tab.dirty ? <span className="editor-tab-dirty" aria-hidden="true" /> : null}
            {tab.pinned ? <span className="editor-tab-pin">Pinned</span> : null}
            <CloseIcon className="editor-tab-close" />
          </button>
        )
      })}

      <button
        type="button"
        className="editor-tab editor-tab--create"
        aria-label="Create query tab"
        onClick={onCreateTab}
      >
        <PlusIcon className="tab-inline-icon" />
      </button>
    </div>
  )
}
