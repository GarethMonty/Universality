import type {
  ConnectionProfile,
  EnvironmentProfile,
  ExecutionCapabilities,
} from '@universality/shared-types'
import {
  DatabaseIcon,
  ExplainIcon,
  PanelIcon,
  PlayIcon,
  SettingsIcon,
  StopIcon,
} from './icons'

interface EditorToolbarProps {
  connections: ConnectionProfile[]
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  executionStatus: 'idle' | 'loading' | 'ready'
  capabilities: ExecutionCapabilities
  canCancelExecution: boolean
  bottomPanelVisible: boolean
  onExecute(): void
  onExplain(): void
  onCancel(): void
  onSelectConnection(connectionId: string): void
  onOpenConnectionDrawer(): void
  onToggleBottomPanel(): void
}

export function EditorToolbar({
  connections,
  activeConnection,
  activeEnvironment,
  executionStatus,
  capabilities,
  canCancelExecution,
  bottomPanelVisible,
  onExecute,
  onExplain,
  onCancel,
  onSelectConnection,
  onOpenConnectionDrawer,
  onToggleBottomPanel,
}: EditorToolbarProps) {
  return (
    <div className="editor-toolbar" aria-label="Editor toolbar">
      <div className="toolbar-group" aria-label="Execution controls">
        <button
          type="button"
          className="toolbar-action toolbar-action--run"
          aria-label="Run query"
          title="Run query (Ctrl+Enter)"
          disabled={executionStatus === 'loading'}
          onClick={onExecute}
        >
          <PlayIcon className="toolbar-icon" />
          <span>{executionStatus === 'loading' ? 'Running' : 'Run'}</span>
        </button>

        <button
          type="button"
          className="toolbar-icon-action"
          aria-label="Cancel query"
          title="Cancel query"
          disabled={!canCancelExecution}
          onClick={onCancel}
        >
          <StopIcon className="toolbar-icon" />
        </button>

        <button
          type="button"
          className="toolbar-icon-action"
          aria-label="Explain query"
          title="Explain query (Ctrl+Shift+E)"
          disabled={!capabilities.canExplain}
          onClick={onExplain}
        >
          <ExplainIcon className="toolbar-icon" />
        </button>
      </div>

      <div className="toolbar-group toolbar-group--context" aria-label="Execution context">
        <button
          type="button"
          className="toolbar-icon-action"
          aria-label="Change connection"
          title="Change connection"
          onClick={onOpenConnectionDrawer}
        >
          <SettingsIcon className="toolbar-icon" />
        </button>

        <label className="toolbar-select">
          <span className="sr-only">Active connection</span>
          <select
            value={activeConnection.id}
            onChange={(event) => onSelectConnection(event.target.value)}
          >
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
        </label>

        <span
          className={`toolbar-environment toolbar-environment--${activeEnvironment.risk}`}
          title={`${activeEnvironment.label} environment`}
        >
          {activeEnvironment.label}
        </span>

        <span
          className="toolbar-database"
          title={activeConnection.database ?? activeConnection.host}
        >
          <DatabaseIcon className="toolbar-icon" />
          {activeConnection.database ?? activeConnection.host}
        </span>
      </div>

      <div className="toolbar-spacer" />

      <button
        type="button"
        className={`toolbar-icon-action${bottomPanelVisible ? ' is-active' : ''}`}
        aria-label="Toggle results panel"
        title="Toggle results panel (Ctrl+J)"
        onClick={onToggleBottomPanel}
      >
        <PanelIcon className="toolbar-icon" />
      </button>
    </div>
  )
}
