import type {
  AppHealth,
  ConnectionProfile,
  EnvironmentProfile,
  QueryTabState,
  WorkspaceSnapshot,
} from '@universality/shared-types'
import { PanelIcon, SettingsIcon } from './icons'

interface StatusBarProps {
  health: AppHealth
  theme: WorkspaceSnapshot['preferences']['theme']
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  activeTab: QueryTabState
  bottomPanelVisible: boolean
  onToggleBottomPanel(): void
  onOpenDiagnostics(): void
}

export function StatusBar({
  health,
  theme,
  activeConnection,
  activeEnvironment,
  activeTab,
  bottomPanelVisible,
  onToggleBottomPanel,
  onOpenDiagnostics,
}: StatusBarProps) {
  return (
    <footer className="status-bar" aria-label="Status bar">
      <div className="status-bar-group">
        <span className="status-item">{activeConnection.name}</span>
        <span className="status-item">{activeEnvironment.label}</span>
        <span className="status-item">{activeTab.language.toUpperCase()}</span>
        <span className="status-item">{activeTab.status}</span>
      </div>

      <div className="status-bar-group">
        <button
          type="button"
          className={`status-button${bottomPanelVisible ? ' is-active' : ''}`}
          aria-label={bottomPanelVisible ? 'Hide bottom panel from status bar' : 'Show bottom panel'}
          title={bottomPanelVisible ? 'Hide bottom panel' : 'Show bottom panel'}
          onClick={onToggleBottomPanel}
        >
          <PanelIcon className="status-icon" />
        </button>
        <button
          type="button"
          className="status-button"
          aria-label="Open diagnostics drawer"
          title="Diagnostics"
          onClick={onOpenDiagnostics}
        >
          <SettingsIcon className="status-icon" />
        </button>
        <span className="status-item">{theme}</span>
        <span className="status-item">{health.runtime}</span>
      </div>
    </footer>
  )
}
