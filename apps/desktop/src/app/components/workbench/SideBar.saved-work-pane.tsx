import type { ClosedQueryTabSnapshot, SavedWorkItem } from '@datapadplusplus/shared-types'
import {
  CloseIcon,
  DatabaseIcon,
  PlayIcon,
  PlusIcon,
} from './icons'
import { sidebarSectionId } from './SideBar.helpers'
import { SidebarSection } from './SideBar.section'

export function SavedWorkPane({
  closedTabs,
  savedWorkFilter,
  savedWorkGroups,
  sectionStates,
  onDeleteSavedWork,
  onOpenSavedWork,
  onReopenClosedTab,
  onSidebarSectionExpandedChange,
  onSaveCurrentQuery,
  onSavedWorkFilterChange,
}: {
  closedTabs: ClosedQueryTabSnapshot[]
  savedWorkFilter: string
  savedWorkGroups: Record<string, SavedWorkItem[]>
  sectionStates: Record<string, boolean>
  onDeleteSavedWork(savedWorkId: string): void
  onOpenSavedWork(savedWorkId: string): void
  onReopenClosedTab(closedTabId: string): void
  onSidebarSectionExpandedChange(sectionId: string, expanded: boolean): void
  onSaveCurrentQuery(): void
  onSavedWorkFilterChange(value: string): void
}) {
  const hasSavedWork = Object.keys(savedWorkGroups).length > 0

  return (
    <>
      <div className="sidebar-header">
        <h1>Saved Work</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="Save current query"
            title="Save the active query tab into Saved Work."
            onClick={onSaveCurrentQuery}
          >
            <PlusIcon className="sidebar-icon" />
          </button>
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Search saved work</span>
        <input
          type="search"
          placeholder="Search saved work"
          value={savedWorkFilter}
          onChange={(event) => onSavedWorkFilterChange(event.target.value)}
        />
      </label>

      <div className="sidebar-scroll">
        {!hasSavedWork && closedTabs.length === 0 ? (
          <div className="sidebar-empty">
            <DatabaseIcon className="empty-icon" />
            <p>No saved work yet.</p>
          </div>
        ) : null}

        {Object.entries(savedWorkGroups).map(([folder, items], index) => (
          <SidebarSection
            key={folder}
            count={items.length}
            index={index}
            label={folder}
            sectionId={sidebarSectionId('saved-work', 'folder', folder)}
            sectionStates={sectionStates}
            onExpandedChange={onSidebarSectionExpandedChange}
          >
            {items.map((item) => (
              <div key={item.id} className="saved-work-row">
                <div className="saved-work-title-row">
                  <strong>{item.name}</strong>
                  <span>{item.kind}</span>
                </div>
                <p>{item.summary}</p>
                <div className="saved-work-meta-row">
                  <small>{item.tags.join(' / ')}</small>
                  <span className="saved-work-actions">
                    <button
                      type="button"
                      className="sidebar-icon-button sidebar-icon-button--inline"
                      aria-label={`Open saved work ${item.name}`}
                      title={`Open ${item.name} in a new query tab.`}
                      disabled={!item.queryText}
                      onClick={() => onOpenSavedWork(item.id)}
                    >
                      <PlayIcon className="sidebar-icon" />
                    </button>
                    <button
                      type="button"
                      className="sidebar-icon-button sidebar-icon-button--inline"
                      aria-label={`Delete saved work ${item.name}`}
                      title={`Delete saved work item ${item.name}.`}
                      onClick={() => onDeleteSavedWork(item.id)}
                    >
                      <CloseIcon className="sidebar-icon" />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </SidebarSection>
        ))}

        {closedTabs.length > 0 ? (
          <SidebarSection
            count={closedTabs.length}
            index={Object.keys(savedWorkGroups).length}
            label="Closed Tabs"
            sectionId="saved-work:closed-tabs"
            sectionStates={sectionStates}
            onExpandedChange={onSidebarSectionExpandedChange}
          >
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
          </SidebarSection>
        ) : null}
      </div>
    </>
  )
}

function formatClosedAt(closedAt: string) {
  const date = new Date(closedAt)

  if (Number.isNaN(date.getTime())) {
    return 'Closed recently'
  }

  return `Closed ${date.toLocaleString()}`
}
