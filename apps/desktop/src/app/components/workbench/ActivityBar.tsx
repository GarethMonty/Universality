import type { ComponentType, SVGProps } from 'react'
import type { UiActivity, WorkspaceSnapshot } from '@universality/shared-types'
import {
  ConnectionsIcon,
  EnvironmentsIcon,
  LightThemeIcon,
  LockIcon,
  SavedWorkIcon,
  SearchIcon,
  SettingsIcon,
  ThemeIcon,
} from './icons'

interface ActivityBarProps {
  activeActivity: UiActivity
  sidebarCollapsed: boolean
  commandPaletteEnabled: boolean
  isLocked: boolean
  theme: WorkspaceSnapshot['preferences']['theme']
  onToggleSidebar(): void
  onSelectActivity(activity: UiActivity): void
  onToggleTheme(): void
  onToggleLock(): void
}

const activityItems = [
  {
    id: 'connections',
    label: 'Connections',
    tooltip: 'Connections: create, edit, test, and organize datastore profiles.',
    icon: ConnectionsIcon,
  },
  {
    id: 'saved-work',
    label: 'Saved Work',
    tooltip: 'Saved Work: reopen saved queries, snippets, snapshots, and recovered tabs.',
    icon: SavedWorkIcon,
  },
  {
    id: 'search',
    label: 'Search',
    tooltip: 'Search: open the command palette and quickly jump to workbench actions.',
    icon: SearchIcon,
  },
  {
    id: 'environments',
    label: 'Environments',
    tooltip: 'Environments: manage variables, secrets, colors, and risk levels.',
    icon: EnvironmentsIcon,
  },
] satisfies Array<{
  id: UiActivity
  label: string
  tooltip: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}>

export function ActivityBar({
  activeActivity,
  sidebarCollapsed,
  commandPaletteEnabled,
  isLocked,
  theme,
  onToggleSidebar,
  onSelectActivity,
  onToggleTheme,
  onToggleLock,
}: ActivityBarProps) {
  const ThemeGlyph = theme === 'dark' ? LightThemeIcon : ThemeIcon

  const selectActivity = (activity: UiActivity) => {
    if (activeActivity === activity && !sidebarCollapsed) {
      onToggleSidebar()
      return
    }

    onSelectActivity(activity)
  }

  return (
    <aside className="activity-bar" aria-label="Activity bar">
      <div className="activity-stack">
        {activityItems
          .filter((item) => commandPaletteEnabled || item.id !== 'search')
          .map((item) => {
            const Icon = item.icon
            const active = activeActivity === item.id

            return (
              <button
                key={item.id}
                type="button"
                className={`activity-button${active ? ' is-active' : ''}`}
                aria-label={`${item.label} view`}
                title={item.tooltip}
                onClick={() => selectActivity(item.id)}
              >
                <Icon className="activity-icon" />
              </button>
            )
          })}
      </div>

      <div className="activity-spacer" />

      <div className="activity-stack">
        <button
          type="button"
          className={`activity-button${activeActivity === 'settings' ? ' is-active' : ''}`}
          aria-label="Settings view"
          title="Settings: diagnostics, import/export, shortcuts, and desktop preferences."
          onClick={() => onSelectActivity('settings')}
        >
          <SettingsIcon className="activity-icon" />
        </button>
        <button
          type="button"
          className="activity-button"
          aria-label="Toggle theme"
          title={
            theme === 'dark'
              ? 'Switch to light theme for the entire desktop workbench.'
              : 'Switch to dark theme for the entire desktop workbench.'
          }
          onClick={onToggleTheme}
        >
          <ThemeGlyph className="activity-icon" />
        </button>
        <button
          type="button"
          className={`activity-button${isLocked ? ' is-alert' : ''}`}
          aria-label={isLocked ? 'Unlock workspace' : 'Lock workspace'}
          title={
            isLocked
              ? 'Unlock workspace to test connections, run queries, and export data.'
              : 'Lock workspace and pause privileged actions that may touch secrets or data.'
          }
          onClick={onToggleLock}
        >
          <LockIcon className="activity-icon" />
        </button>
      </div>
    </aside>
  )
}
