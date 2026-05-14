import type { CSSProperties } from 'react'
import type { ConnectionProfile, ExplorerNode, ScopedQueryTarget } from '@datapadplusplus/shared-types'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExplorerIcon,
  RefreshIcon,
} from './icons'
import { ExplorerNodeIcon } from './SideBar.node-icons'
import {
  explorerNodeTarget,
  isExplorerNodeQueryable,
} from './SideBar.helpers'

export function ExplorerPane({
  activeConnection,
  explorerFilter,
  explorerItems,
  explorerStatus,
  explorerSummary,
  onExplorerFilterChange,
  onOpenScopedQuery,
  onRefreshExplorer,
  onSelectExplorerNode,
}: {
  activeConnection?: ConnectionProfile
  explorerFilter: string
  explorerItems: ExplorerNode[]
  explorerStatus: 'idle' | 'loading' | 'ready'
  explorerSummary?: string
  onExplorerFilterChange(value: string): void
  onOpenScopedQuery(target: ScopedQueryTarget): void
  onRefreshExplorer(): void
  onSelectExplorerNode(node: ExplorerNode): void
}) {
  const openNodeQuery = (item: ExplorerNode) => {
    if (!isExplorerNodeQueryable(item)) {
      return
    }

    onOpenScopedQuery(explorerNodeTarget(item, activeConnection))
  }

  return (
    <>
      <div className="sidebar-header">
        <h1>Explorer</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="Refresh explorer"
            title="Refresh metadata for the active connection. Loaded child nodes are kept open."
            onClick={onRefreshExplorer}
          >
            <RefreshIcon className="sidebar-icon" />
          </button>
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Filter explorer</span>
        <input
          type="search"
          placeholder="Filter explorer"
          value={explorerFilter}
          onChange={(event) => onExplorerFilterChange(event.target.value)}
        />
      </label>

      <div className="sidebar-meta-row">
        <span>{explorerSummary ?? 'Root objects'}</span>
        <span>{explorerStatus === 'loading' ? 'Loading' : `${explorerItems.length}`}</span>
      </div>

      <div className="sidebar-scroll">
        {explorerItems.length === 0 ? (
          <div className="sidebar-empty">
            <ExplorerIcon className="empty-icon" />
            <p>No explorer metadata loaded.</p>
          </div>
        ) : null}

        {explorerItems.map((item) => {
          const depth = Math.max(0, (item.path?.length ?? 1) - 1)

          return (
            <button
              key={item.id}
              type="button"
              className="tree-item"
              style={{ '--tree-depth': depth } as CSSProperties}
              title={
                item.expandable || item.scope
                  ? `${item.label}: inspect this ${item.kind} and load its child metadata.`
                  : `${item.label}: inspect this ${item.kind}.`
              }
              onClick={() => onSelectExplorerNode(item)}
              onDoubleClick={() => openNodeQuery(item)}
            >
              <span className="tree-item-chevron">
                {item.expandable ? (
                  <ChevronRightIcon className="tree-icon" />
                ) : (
                  <ChevronDownIcon className="tree-icon tree-icon--muted" />
                )}
              </span>
              <span className="tree-item-badge tree-item-badge--ghost">
                <ExplorerNodeIcon kind={item.kind} />
              </span>
              <span className="tree-item-content">
                <strong>{item.label}</strong>
                <span>
                  {item.kind}
                  {item.detail ? ` / ${item.detail}` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
