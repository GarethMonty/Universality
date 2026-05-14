import type { ReactNode } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from './icons'

export function SidebarSection({
  children,
  count,
  index,
  label,
  sectionId,
  sectionStates,
  onExpandedChange,
}: {
  children: ReactNode
  count?: number
  index: number
  label: string
  sectionId: string
  sectionStates: Record<string, boolean>
  onExpandedChange(sectionId: string, expanded: boolean): void
}) {
  const expanded = sectionStates[sectionId] ?? index === 0
  const contentId = `sidebar-section-${sectionId.replace(/[^a-z0-9_-]/gi, '-')}`

  return (
    <section className={`sidebar-section${expanded ? ' is-expanded' : ' is-collapsed'}`}>
      <button
        type="button"
        className="sidebar-section-header sidebar-section-header--button"
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label} section${typeof count === 'number' ? ` (${count})` : ''}`}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => onExpandedChange(sectionId, !expanded)}
      >
        <span className="sidebar-section-title">
          {expanded ? (
            <ChevronDownIcon className="sidebar-section-chevron" />
          ) : (
            <ChevronRightIcon className="sidebar-section-chevron" />
          )}
          <span>{label}</span>
        </span>
        {typeof count === 'number' ? <span>{count}</span> : null}
      </button>

      {expanded ? (
        <div id={contentId} className="sidebar-section-body">
          {children}
        </div>
      ) : null}
    </section>
  )
}
