import type {
  AppHealth,
  DiagnosticsReport,
  ExportBundle,
  WorkspaceSnapshot,
} from '@datapadplusplus/shared-types'
import {
  RefreshIcon,
  SettingsIcon,
  ThemeIcon,
} from './icons'
import { SHORTCUTS } from './RightDrawer.helpers'
import { DrawerDetailRow, DrawerHeader, FormField } from './RightDrawer.primitives'

export function DiagnosticsBlade({
  diagnostics,
  exportBundle,
  exportPassphrase,
  health,
  importPayload,
  theme,
  onClose,
  onExportPassphraseChange,
  onExportWorkspace,
  onImportPayloadChange,
  onImportWorkspace,
  onRefreshDiagnostics,
  onToggleTheme,
}: {
  diagnostics?: DiagnosticsReport
  exportBundle?: ExportBundle
  exportPassphrase: string
  health: AppHealth
  importPayload: string
  theme: WorkspaceSnapshot['preferences']['theme']
  onClose(): void
  onExportPassphraseChange(value: string): void
  onExportWorkspace(): void
  onImportPayloadChange(value: string): void
  onImportWorkspace(): void
  onRefreshDiagnostics(): void
  onToggleTheme(): void
}) {
  return (
    <>
      <DrawerHeader
        title="Diagnostics"
        subtitle="Settings"
        icon={SettingsIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Workbench</strong>
            <button type="button" className="drawer-link-button" onClick={onToggleTheme}>
              <ThemeIcon className="drawer-inline-icon" />
              Theme
            </button>
          </div>
          <div className="details-grid details-grid--drawer">
            <DrawerDetailRow label="Theme" value={theme} />
            <DrawerDetailRow label="Runtime" value={health.runtime} />
            <DrawerDetailRow label="Adapters" value={health.adapterHost} />
            <DrawerDetailRow label="Secrets" value={health.secretStorage} />
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Diagnostics</strong>
            <button type="button" className="drawer-link-button" onClick={onRefreshDiagnostics}>
              <RefreshIcon className="drawer-inline-icon" />
              Refresh
            </button>
          </div>
          <div className="details-grid details-grid--drawer">
            <DrawerDetailRow label="Platform" value={diagnostics?.platform ?? health.platform} />
            <DrawerDetailRow label="App Version" value={diagnostics?.appVersion ?? 'Unknown'} />
            <DrawerDetailRow label="Connections" value={String(diagnostics?.counts.connections ?? 0)} />
            <DrawerDetailRow label="Library" value={String(diagnostics?.counts.library ?? 0)} />
          </div>
          <ul className="messages-list">
            {(diagnostics?.warnings.length ? diagnostics.warnings : ['No active warnings.']).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Shortcuts</strong>
            <span>keyboard</span>
          </div>
          <div className="drawer-shortcut-list">
            {SHORTCUTS.map(([label, shortcut]) => (
              <div key={label} className="drawer-shortcut-row">
                <span>{label}</span>
                <kbd>{shortcut}</kbd>
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Bundle</strong>
            <span>{health.telemetry}</span>
          </div>

          <FormField label="Passphrase">
            <input
              value={exportPassphrase}
              onChange={(event) => onExportPassphraseChange(event.target.value)}
            />
          </FormField>

          <div className="drawer-button-row">
            <button type="button" className="drawer-button drawer-button--primary" onClick={onExportWorkspace}>
              Export
            </button>
            <button type="button" className="drawer-button" onClick={onImportWorkspace}>
              Import
            </button>
          </div>

          {exportBundle ? (
            <pre className="drawer-code">
              <code>{exportBundle.encryptedPayload}</code>
            </pre>
          ) : null}

          <FormField label="Encrypted payload">
            <textarea
              rows={8}
              value={importPayload}
              onChange={(event) => onImportPayloadChange(event.target.value)}
              placeholder="Encrypted workspace bundle"
            />
          </FormField>
        </div>
      </div>
    </>
  )
}
