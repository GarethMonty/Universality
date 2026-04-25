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
  activeConnection?: ConnectionProfile
  activeEnvironment?: EnvironmentProfile
  activeTab?: QueryTabState
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
        <span className="status-item">{activeConnection?.name ?? 'No connection'}</span>
        <span className="status-item">{activeEnvironment?.label ?? 'No environment'}</span>
        <span className="status-item">{activeTab?.language.toUpperCase() ?? 'READY'}</span>
        <span className="status-item">{activeTab?.status ?? 'idle'}</span>
      </div>

      <div className="status-bar-group">
        <button
          type="button"
          className={`status-button${bottomPanelVisible ? ' is-active' : ''}`}
          aria-label={bottomPanelVisible ? 'Hide bottom panel from status bar' : 'Show bottom panel'}
          title={
            bottomPanelVisible
              ? 'Hide the Results, Messages, and Details panel.'
              : 'Show the Results, Messages, and Details panel.'
          }
          onClick={onToggleBottomPanel}
        >
          <PanelIcon className="status-icon" />
        </button>
        <button
          type="button"
          className="status-button"
          aria-label="Open diagnostics drawer"
          title="Open diagnostics, import/export, runtime health, and support information."
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
