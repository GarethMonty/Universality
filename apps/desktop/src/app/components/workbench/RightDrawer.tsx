import { useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import type {
  AppHealth,
  ConnectionProfile,
  ConnectionTestResult,
  DiagnosticsReport,
  EnvironmentProfile,
  ExecutionCapabilities,
  ExplorerInspectResponse,
  ExportBundle,
  ResolvedEnvironment,
  RightDrawerView,
  WorkspaceSnapshot,
} from '@universality/shared-types'
import {
  CloseIcon,
  ConnectionsIcon,
  ExplorerIcon,
  FavoriteIcon,
  RefreshIcon,
  ReadOnlyIcon,
  SettingsIcon,
  ThemeIcon,
} from './icons'

interface RightDrawerProps {
  view: RightDrawerView
  health: AppHealth
  theme: WorkspaceSnapshot['preferences']['theme']
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  resolvedEnvironment: ResolvedEnvironment
  connectionTest?: ConnectionTestResult
  diagnostics?: DiagnosticsReport
  explorerInspection?: ExplorerInspectResponse
  exportBundle?: ExportBundle
  capabilities: ExecutionCapabilities
  exportPassphrase: string
  importPayload: string
  onExportPassphraseChange(value: string): void
  onImportPayloadChange(value: string): void
  onClose(): void
  onSaveConnection(profile: ConnectionProfile): void
  onSaveEnvironment(profile: EnvironmentProfile): void
  onTestConnection(profile: ConnectionProfile): void
  onRefreshDiagnostics(): void
  onExportWorkspace(): void
  onImportWorkspace(): void
  onApplyTemplate(queryTemplate?: string): void
  onToggleTheme(): void
}

const ENGINE_OPTIONS = [
  { value: 'postgresql', family: 'sql' },
  { value: 'sqlserver', family: 'sql' },
  { value: 'mysql', family: 'sql' },
  { value: 'mariadb', family: 'sql' },
  { value: 'sqlite', family: 'sql' },
  { value: 'mongodb', family: 'document' },
  { value: 'redis', family: 'keyvalue' },
] as const

const SHORTCUTS = [
  ['Run query', 'Ctrl Enter'],
  ['Explain query', 'Ctrl Shift E'],
  ['Command palette', 'Ctrl K'],
  ['Toggle panel', 'Ctrl J'],
  ['Toggle sidebar', 'Ctrl B'],
] as const

export function RightDrawer({
  view,
  health,
  theme,
  activeConnection,
  activeEnvironment,
  resolvedEnvironment,
  connectionTest,
  diagnostics,
  explorerInspection,
  exportBundle,
  capabilities,
  exportPassphrase,
  importPayload,
  onExportPassphraseChange,
  onImportPayloadChange,
  onClose,
  onSaveConnection,
  onSaveEnvironment,
  onTestConnection,
  onRefreshDiagnostics,
  onExportWorkspace,
  onImportWorkspace,
  onApplyTemplate,
  onToggleTheme,
}: RightDrawerProps) {
  return (
    <aside className="workbench-drawer" aria-label={`${view} drawer`}>
      {view === 'connection' ? (
        <ConnectionBlade
          activeConnection={activeConnection}
          activeEnvironment={activeEnvironment}
          capabilities={capabilities}
          connectionTest={connectionTest}
          resolvedEnvironment={resolvedEnvironment}
          onClose={onClose}
          onSaveConnection={onSaveConnection}
          onSaveEnvironment={onSaveEnvironment}
          onTestConnection={onTestConnection}
        />
      ) : null}

      {view === 'inspection' ? (
        <InspectionBlade
          capabilities={capabilities}
          inspection={explorerInspection}
          onApplyTemplate={onApplyTemplate}
          onClose={onClose}
        />
      ) : null}

      {view === 'diagnostics' ? (
        <DiagnosticsBlade
          diagnostics={diagnostics}
          exportBundle={exportBundle}
          exportPassphrase={exportPassphrase}
          health={health}
          importPayload={importPayload}
          theme={theme}
          onClose={onClose}
          onExportPassphraseChange={onExportPassphraseChange}
          onExportWorkspace={onExportWorkspace}
          onImportPayloadChange={onImportPayloadChange}
          onImportWorkspace={onImportWorkspace}
          onRefreshDiagnostics={onRefreshDiagnostics}
          onToggleTheme={onToggleTheme}
        />
      ) : null}
    </aside>
  )
}

function ConnectionBlade({
  activeConnection,
  activeEnvironment,
  capabilities,
  connectionTest,
  resolvedEnvironment,
  onClose,
  onSaveConnection,
  onSaveEnvironment,
  onTestConnection,
}: {
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  capabilities: ExecutionCapabilities
  connectionTest?: ConnectionTestResult
  resolvedEnvironment: ResolvedEnvironment
  onClose(): void
  onSaveConnection(profile: ConnectionProfile): void
  onSaveEnvironment(profile: EnvironmentProfile): void
  onTestConnection(profile: ConnectionProfile): void
}) {
  const [connectionDraft, setConnectionDraft] = useState(activeConnection)
  const [environmentDraft, setEnvironmentDraft] = useState(activeEnvironment)

  const databaseLabel = connectionDraft.engine === 'sqlite' ? 'Database file' : 'Database'

  return (
    <>
      <DrawerHeader
        title="Connection"
        subtitle="Profile"
        icon={ConnectionsIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Connection</strong>
            <span>{connectionDraft.engine}</span>
          </div>

          <div className="drawer-form">
            <FormField label="Connection type">
              <select
                value={connectionDraft.engine}
                onChange={(event) => {
                  const engine = event.target.value as ConnectionProfile['engine']
                  setConnectionDraft((current) => ({
                    ...current,
                    engine,
                    family: engineFamily(engine),
                    updatedAt: new Date().toISOString(),
                  }))
                }}
              >
                {ENGINE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Name">
              <input
                value={connectionDraft.name}
                onChange={(event) =>
                  setConnectionDraft((current) => ({
                    ...current,
                    name: event.target.value,
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
            </FormField>

            <FormField label="Server">
              <input
                value={connectionDraft.host}
                onChange={(event) =>
                  setConnectionDraft((current) => ({
                    ...current,
                    host: event.target.value,
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
            </FormField>

            {connectionDraft.engine !== 'sqlite' ? (
              <FormField label="Port">
                <input
                  value={connectionDraft.port ?? ''}
                  onChange={(event) =>
                    setConnectionDraft((current) => ({
                      ...current,
                      port: Number(event.target.value) || undefined,
                      updatedAt: new Date().toISOString(),
                    }))
                  }
                />
              </FormField>
            ) : null}

            <FormField label={databaseLabel}>
              <input
                value={connectionDraft.database ?? ''}
                onChange={(event) =>
                  setConnectionDraft((current) => ({
                    ...current,
                    database: event.target.value,
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
            </FormField>

            <FormField label="User name">
              <input
                value={connectionDraft.auth.username ?? ''}
                onChange={(event) =>
                  setConnectionDraft((current) => ({
                    ...current,
                    auth: {
                      ...current.auth,
                      username: event.target.value,
                    },
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
            </FormField>

            <FormField label="SSL mode">
              <input
                value={connectionDraft.auth.sslMode ?? ''}
                onChange={(event) =>
                  setConnectionDraft((current) => ({
                    ...current,
                    auth: {
                      ...current.auth,
                      sslMode:
                        (event.target.value || undefined) as ConnectionProfile['auth']['sslMode'],
                    },
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
            </FormField>
          </div>

          <div className="drawer-toggle-row">
            <button
              type="button"
              className={`drawer-toggle${connectionDraft.favorite ? ' is-active' : ''}`}
              onClick={() =>
                setConnectionDraft((current) => ({
                  ...current,
                  favorite: !current.favorite,
                  updatedAt: new Date().toISOString(),
                }))
              }
            >
              <FavoriteIcon className="drawer-inline-icon" />
              Favorite
            </button>
            <button
              type="button"
              className={`drawer-toggle${connectionDraft.readOnly ? ' is-active' : ''}`}
              onClick={() =>
                setConnectionDraft((current) => ({
                  ...current,
                  readOnly: !current.readOnly,
                  updatedAt: new Date().toISOString(),
                }))
              }
            >
              <ReadOnlyIcon className="drawer-inline-icon" />
              Read-only
            </button>
            <span className="drawer-pill">{capabilities.editorLanguage}</span>
          </div>

          {connectionTest ? (
            <div className={`drawer-callout${connectionTest.ok ? ' is-success' : ' is-error'}`}>
              <strong>{connectionTest.ok ? 'Connection ready' : 'Connection issue'}</strong>
              <span>{connectionTest.message}</span>
              <span>
                {connectionTest.resolvedHost}
                {connectionTest.resolvedDatabase ? ` / ${connectionTest.resolvedDatabase}` : ''}
              </span>
            </div>
          ) : null}
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Environment</strong>
            <span>{environmentDraft.label}</span>
          </div>

          <div className="drawer-form">
            <FormField label="Label">
              <input
                value={environmentDraft.label}
                onChange={(event) =>
                  setEnvironmentDraft((current) => ({
                    ...current,
                    label: event.target.value,
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
            </FormField>

            <FormField label="Color">
              <input
                value={environmentDraft.color}
                onChange={(event) =>
                  setEnvironmentDraft((current) => ({
                    ...current,
                    color: event.target.value,
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
            </FormField>

            <FormField label="Risk">
              <select
                value={environmentDraft.risk}
                onChange={(event) =>
                  setEnvironmentDraft((current) => ({
                    ...current,
                    risk: event.target.value as EnvironmentProfile['risk'],
                    updatedAt: new Date().toISOString(),
                  }))
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </FormField>
          </div>

          <div className="drawer-toggle-row">
            <button
              type="button"
              className={`drawer-toggle${environmentDraft.requiresConfirmation ? ' is-active' : ''}`}
              onClick={() =>
                setEnvironmentDraft((current) => ({
                  ...current,
                  requiresConfirmation: !current.requiresConfirmation,
                  updatedAt: new Date().toISOString(),
                }))
              }
            >
              Confirm
            </button>
            <button
              type="button"
              className={`drawer-toggle${environmentDraft.safeMode ? ' is-active' : ''}`}
              onClick={() =>
                setEnvironmentDraft((current) => ({
                  ...current,
                  safeMode: !current.safeMode,
                  updatedAt: new Date().toISOString(),
                }))
              }
            >
              Safe
            </button>
          </div>

          <div className="drawer-variables">
            {Object.entries(resolvedEnvironment.variables).map(([key, value]) => {
              const hidden = resolvedEnvironment.sensitiveKeys.includes(key)
              return (
                <div key={key} className="drawer-variable-row">
                  <span>{key}</span>
                  <code>{hidden ? '********' : value}</code>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="drawer-footer">
        <button type="button" className="drawer-button" onClick={() => onTestConnection(connectionDraft)}>
          Test Connection
        </button>
        <button type="button" className="drawer-button" onClick={() => onSaveEnvironment(environmentDraft)}>
          Save Environment
        </button>
        <button
          type="button"
          className="drawer-button drawer-button--primary"
          onClick={() => onSaveConnection(connectionDraft)}
        >
          Save Connection
        </button>
      </div>
    </>
  )
}

function InspectionBlade({
  capabilities,
  inspection,
  onApplyTemplate,
  onClose,
}: {
  capabilities: ExecutionCapabilities
  inspection?: ExplorerInspectResponse
  onApplyTemplate(queryTemplate?: string): void
  onClose(): void
}) {
  return (
    <>
      <DrawerHeader
        title="Inspection"
        subtitle="Object"
        icon={ExplorerIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Inspection</strong>
            <button
              type="button"
              className="drawer-link-button"
              disabled={!inspection?.queryTemplate}
              onClick={() => onApplyTemplate(inspection?.queryTemplate)}
            >
              Apply template
            </button>
          </div>

          <p className="drawer-copy">
            {inspection?.summary ?? 'No object selected.'}
          </p>

          {inspection?.queryTemplate ? (
            <pre className="drawer-code">
              <code>{inspection.queryTemplate}</code>
            </pre>
          ) : null}

          {inspection?.payload ? (
            <pre className="drawer-code">
              <code>{JSON.stringify(inspection.payload, null, 2)}</code>
            </pre>
          ) : null}
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Capabilities</strong>
            <span>adapter</span>
          </div>
          <div className="drawer-pill-row">
            <span className="drawer-pill">Metadata {capabilities.supportsLiveMetadata ? 'yes' : 'no'}</span>
            <span className="drawer-pill">Cancel {capabilities.canCancel ? 'yes' : 'no'}</span>
            <span className="drawer-pill">Explain {capabilities.canExplain ? 'yes' : 'no'}</span>
          </div>
        </div>
      </div>
    </>
  )
}

function DiagnosticsBlade({
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
            <DrawerDetailRow label="App Version" value={diagnostics?.appVersion ?? '0.2.0'} />
            <DrawerDetailRow label="Connections" value={String(diagnostics?.counts.connections ?? 0)} />
            <DrawerDetailRow label="Saved Work" value={String(diagnostics?.counts.savedWork ?? 0)} />
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

function DrawerHeader({
  title,
  subtitle,
  icon: Icon,
  onClose,
}: {
  title: string
  subtitle: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  onClose(): void
}) {
  return (
    <div className="drawer-header">
      <div className="drawer-title-row">
        <span className="drawer-title-icon">
          <Icon className="drawer-inline-icon" />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <button type="button" className="drawer-close" aria-label="Close drawer" onClick={onClose}>
        <CloseIcon className="drawer-inline-icon" />
      </button>
    </div>
  )
}

function FormField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <label className="drawer-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function DrawerDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function engineFamily(engine: ConnectionProfile['engine']): ConnectionProfile['family'] {
  return ENGINE_OPTIONS.find((option) => option.value === engine)?.family ?? 'sql'
}
