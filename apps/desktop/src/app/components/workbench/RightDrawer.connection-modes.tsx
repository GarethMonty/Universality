import type {
  CloudProvider,
  ConnectionMode,
  ConnectionProfile,
  LocalDatabaseCreateRequest,
  LocalDatabaseManifest,
} from '@datapadplusplus/shared-types'
import { FormField } from './RightDrawer.primitives'

export type UpdateConnectionDraft = (
  patch: Partial<ConnectionProfile>,
  options?: { preserveName?: boolean },
) => void

const CONNECTION_MODE_LABELS: Record<ConnectionMode, string> = {
  native: 'Fields',
  'connection-string': 'Connection String',
  'local-file': 'Local File',
  'cloud-iam': 'Cloud IAM',
  'cloud-sdk': 'Cloud SDK',
}

const CONNECTION_MODE_DESCRIPTIONS: Record<ConnectionMode, string> = {
  native: 'Use host, port, database, user, password, and SSL fields.',
  'connection-string': 'Use one native driver URI or connection string.',
  'local-file': 'Open or create a local embedded database file.',
  'cloud-iam': 'Use cloud identity, roles, and IAM-aware SDK/proxy settings.',
  'cloud-sdk': 'Use a cloud SDK profile, project/account context, or local contract endpoint.',
}

function connectionModeLabel(mode: ConnectionMode) {
  return CONNECTION_MODE_LABELS[mode]
}

export function ConnectionModeTabs({
  activeMode,
  modes,
  onChange,
}: {
  activeMode: ConnectionMode
  modes: readonly ConnectionMode[]
  onChange(mode: ConnectionMode): void
}) {
  if (modes.length <= 1) {
    return (
      <div className="connection-mode-summary">
        <strong>{connectionModeLabel(activeMode)}</strong>
        <span>{CONNECTION_MODE_DESCRIPTIONS[activeMode]}</span>
      </div>
    )
  }

  return (
    <div className="connection-mode-tabs" role="tablist" aria-label="Connection methods">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={mode === activeMode}
          className={`connection-mode-tab${mode === activeMode ? ' is-active' : ''}`}
          title={CONNECTION_MODE_DESCRIPTIONS[mode]}
          onClick={() => onChange(mode)}
        >
          <strong>{connectionModeLabel(mode)}</strong>
          <span>{modeShortHint(mode)}</span>
        </button>
      ))}
    </div>
  )
}

export function ConnectionModeFields({
  activeMode,
  connectionDraft,
  databaseLabel,
  localDatabaseManifest,
  localDatabaseName,
  localDatabaseStatus,
  pendingCreateFolder,
  secretDraft,
  createLocalDatabase,
  onChooseNewLocalDatabasePath,
  onLocalDatabaseNameChange,
  onOpenExistingLocalDatabase,
  onSecretDraftChange,
  onUpdateConnectionDraft,
}: {
  activeMode: ConnectionMode
  connectionDraft: ConnectionProfile
  databaseLabel: string
  localDatabaseManifest?: LocalDatabaseManifest
  localDatabaseName: string
  localDatabaseStatus: string
  pendingCreateFolder: string
  secretDraft: string
  createLocalDatabase(mode: LocalDatabaseCreateRequest['mode']): Promise<void>
  onChooseNewLocalDatabasePath(): Promise<void>
  onLocalDatabaseNameChange(value: string): void
  onOpenExistingLocalDatabase(): Promise<void>
  onSecretDraftChange(value: string): void
  onUpdateConnectionDraft: UpdateConnectionDraft
}) {
  if (activeMode === 'connection-string') {
    return (
      <ConnectionStringFields
        connectionDraft={connectionDraft}
        onUpdateConnectionDraft={onUpdateConnectionDraft}
      />
    )
  }

  if (activeMode === 'local-file') {
    return (
      <>
        <LocalDatabaseActions
          databaseLabel={databaseLabel}
          localDatabaseManifest={localDatabaseManifest}
          localDatabaseName={localDatabaseName}
          localDatabaseStatus={localDatabaseStatus}
          pendingCreateFolder={pendingCreateFolder}
          createLocalDatabase={createLocalDatabase}
          onChooseNewLocalDatabasePath={onChooseNewLocalDatabasePath}
          onLocalDatabaseNameChange={onLocalDatabaseNameChange}
          onOpenExistingLocalDatabase={onOpenExistingLocalDatabase}
        />
        <FormField label="Database file">
          <input
            aria-label="Database file"
            value={connectionDraft.database ?? ''}
            onChange={(event) =>
              onUpdateConnectionDraft({
                database: event.target.value,
                host: event.target.value,
              })
            }
          />
        </FormField>
      </>
    )
  }

  if (activeMode === 'cloud-iam' || activeMode === 'cloud-sdk') {
    return (
      <CloudConnectionFields
        connectionDraft={connectionDraft}
        mode={activeMode}
        secretDraft={secretDraft}
        onSecretDraftChange={onSecretDraftChange}
        onUpdateConnectionDraft={onUpdateConnectionDraft}
      />
    )
  }

  return (
    <NativeConnectionFields
      connectionDraft={connectionDraft}
      secretDraft={secretDraft}
      onSecretDraftChange={onSecretDraftChange}
      onUpdateConnectionDraft={onUpdateConnectionDraft}
    />
  )
}

function LocalDatabaseActions({
  databaseLabel,
  localDatabaseManifest,
  localDatabaseName,
  localDatabaseStatus,
  pendingCreateFolder,
  createLocalDatabase,
  onChooseNewLocalDatabasePath,
  onLocalDatabaseNameChange,
  onOpenExistingLocalDatabase,
}: {
  databaseLabel: string
  localDatabaseManifest?: LocalDatabaseManifest
  localDatabaseName: string
  localDatabaseStatus: string
  pendingCreateFolder: string
  createLocalDatabase(mode: LocalDatabaseCreateRequest['mode']): Promise<void>
  onChooseNewLocalDatabasePath(): Promise<void>
  onLocalDatabaseNameChange(value: string): void
  onOpenExistingLocalDatabase(): Promise<void>
}) {
  const canCreateEmpty = localDatabaseManifest?.canCreateEmpty ?? true
  const canCreateStarter = localDatabaseManifest?.canCreateStarter ?? false
  const createDisabled = !localDatabaseName.trim()

  return (
    <>
      <div className="connection-quick-actions" aria-label="Connection quick actions">
        <div className="drawer-button-row drawer-button-row--compact">
          <button
            type="button"
            className="drawer-button"
            title="Choose an existing local database file and place its path in this connection."
            onClick={() => void onOpenExistingLocalDatabase()}
          >
            Open Existing
          </button>
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            title={`Choose a folder for a new ${databaseLabel} database, then enter a database name.`}
            onClick={() => void onChooseNewLocalDatabasePath()}
          >
            Create New
          </button>
        </div>
      </div>

      {pendingCreateFolder ? (
        <div className="drawer-callout" role="dialog" aria-label={`Create ${databaseLabel} database`}>
          <strong>Create {databaseLabel} database</strong>
          <div className="local-database-create-grid">
            <label className="drawer-field">
              <span>Folder</span>
              <input value={pendingCreateFolder} readOnly />
            </label>
            <label className="drawer-field">
              <span>Database name</span>
              <input
                value={localDatabaseName}
                placeholder={`database.${localDatabaseManifest?.defaultExtension ?? 'db'}`}
                onChange={(event) => onLocalDatabaseNameChange(event.target.value)}
              />
            </label>
          </div>
          <div className="drawer-button-row drawer-button-row--compact">
            {canCreateEmpty ? (
              <button
                type="button"
                className="drawer-button"
                disabled={createDisabled}
                title={`Create a blank ${databaseLabel} database file in the selected folder.`}
                onClick={() => void createLocalDatabase('empty')}
              >
                Empty database
              </button>
            ) : null}
            {canCreateStarter ? (
              <button
                type="button"
                className="drawer-button drawer-button--primary"
                disabled={createDisabled}
                title={`Create a ${databaseLabel} database with small starter accounts and transactions tables for local prototyping.`}
                onClick={() => void createLocalDatabase('starter')}
              >
                Starter schema
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {localDatabaseStatus ? (
        <div className="drawer-callout is-success">
          <strong>Local database</strong>
          <span>{localDatabaseStatus}</span>
        </div>
      ) : null}
    </>
  )
}

function NativeConnectionFields({
  connectionDraft,
  secretDraft,
  onSecretDraftChange,
  onUpdateConnectionDraft,
}: {
  connectionDraft: ConnectionProfile
  secretDraft: string
  onSecretDraftChange(value: string): void
  onUpdateConnectionDraft: UpdateConnectionDraft
}) {
  return (
    <>
      <FormField label="Server">
        <input
          value={connectionDraft.host}
          onChange={(event) => onUpdateConnectionDraft({ host: event.target.value })}
        />
      </FormField>

      <FormField label="Port">
        <input
          value={connectionDraft.port ?? ''}
          onChange={(event) =>
            onUpdateConnectionDraft({
              port: Number(event.target.value) || undefined,
            })
          }
        />
      </FormField>

      <FormField label="Database">
        <input
          aria-label="Database"
          value={connectionDraft.database ?? ''}
          onChange={(event) => onUpdateConnectionDraft({ database: event.target.value })}
        />
      </FormField>

      <FormField label="User name">
        <input
          value={connectionDraft.auth.username ?? ''}
          onChange={(event) =>
            onUpdateConnectionDraft({
              auth: {
                ...connectionDraft.auth,
                username: event.target.value,
              },
            })
          }
        />
      </FormField>

      <FormField label="Password / Secret">
        <input
          type="password"
          autoComplete="new-password"
          value={secretDraft}
          placeholder={
            connectionDraft.auth.secretRef ? 'Stored in OS keyring' : 'Optional password'
          }
          onChange={(event) => onSecretDraftChange(event.target.value)}
        />
      </FormField>

      <FormField label="SSL mode">
        <input
          value={connectionDraft.auth.sslMode ?? ''}
          onChange={(event) =>
            onUpdateConnectionDraft({
              auth: {
                ...connectionDraft.auth,
                sslMode: (event.target.value || undefined) as ConnectionProfile['auth']['sslMode'],
              },
            })
          }
        />
      </FormField>
    </>
  )
}

function ConnectionStringFields({
  connectionDraft,
  onUpdateConnectionDraft,
}: {
  connectionDraft: ConnectionProfile
  onUpdateConnectionDraft: UpdateConnectionDraft
}) {
  return (
    <>
      <FormField label="Connection string">
        <textarea
          aria-label="Connection string"
          value={connectionDraft.connectionString ?? ''}
          placeholder={connectionStringPlaceholder(connectionDraft.engine)}
          onChange={(event) =>
            onUpdateConnectionDraft({ connectionString: event.target.value })
          }
        />
      </FormField>
      <p className="connection-mode-help">
        Use environment variables such as ${'${DB_PASSWORD}'} for sensitive values. Native
        host, port, user, and database fields are ignored while this method is active.
      </p>
    </>
  )
}

function CloudConnectionFields({
  connectionDraft,
  mode,
  secretDraft,
  onSecretDraftChange,
  onUpdateConnectionDraft,
}: {
  connectionDraft: ConnectionProfile
  mode: 'cloud-iam' | 'cloud-sdk'
  secretDraft: string
  onSecretDraftChange(value: string): void
  onUpdateConnectionDraft: UpdateConnectionDraft
}) {
  return (
    <>
      <FormField label={mode === 'cloud-iam' ? 'Endpoint / host' : 'SDK endpoint / host'}>
        <input
          value={connectionDraft.host}
          placeholder={cloudHostPlaceholder(connectionDraft.engine)}
          onChange={(event) => onUpdateConnectionDraft({ host: event.target.value })}
        />
      </FormField>

      <FormField label={cloudScopeLabel(connectionDraft.engine)}>
        <input
          value={connectionDraft.database ?? ''}
          placeholder={cloudScopePlaceholder(connectionDraft.engine)}
          onChange={(event) => onUpdateConnectionDraft({ database: event.target.value })}
        />
      </FormField>

      <FormField label="Cloud provider">
        <select
          value={connectionDraft.auth.cloudProvider ?? ''}
          onChange={(event) =>
            onUpdateConnectionDraft({
              auth: {
                ...connectionDraft.auth,
                cloudProvider: (event.target.value || undefined) as CloudProvider | undefined,
              },
            })
          }
        >
          <option value="">Auto / datastore default</option>
          <option value="aws">AWS</option>
          <option value="azure">Azure</option>
          <option value="gcp">Google Cloud</option>
          <option value="snowflake">Snowflake</option>
        </select>
      </FormField>

      <FormField label={mode === 'cloud-iam' ? 'Principal / role' : 'SDK profile / principal'}>
        <input
          value={connectionDraft.auth.principal ?? ''}
          placeholder={mode === 'cloud-iam' ? 'role, service account, or user principal' : 'default'}
          onChange={(event) =>
            onUpdateConnectionDraft({
              auth: {
                ...connectionDraft.auth,
                principal: event.target.value,
              },
            })
          }
        />
      </FormField>

      <FormField label="Token / API secret">
        <input
          type="password"
          autoComplete="new-password"
          value={secretDraft}
          placeholder={
            connectionDraft.auth.secretRef
              ? 'Stored in OS keyring'
              : 'Optional token, API key, or local mock secret'
          }
          onChange={(event) => onSecretDraftChange(event.target.value)}
        />
      </FormField>
    </>
  )
}

function modeShortHint(mode: ConnectionMode) {
  if (mode === 'connection-string') {
    return 'URI'
  }

  if (mode === 'local-file') {
    return 'File'
  }

  if (mode === 'cloud-iam') {
    return 'IAM'
  }

  if (mode === 'cloud-sdk') {
    return 'SDK'
  }

  return 'Host'
}

function connectionStringPlaceholder(engine: ConnectionProfile['engine']) {
  if (engine === 'postgresql' || engine === 'cockroachdb' || engine === 'timescaledb') {
    return 'postgresql://user:${DB_PASSWORD}@localhost:5432/database?sslmode=prefer'
  }

  if (engine === 'sqlserver') {
    return 'Server=localhost,1433;Database=master;User Id=sa;Password=${DB_PASSWORD};TrustServerCertificate=true;'
  }

  if (engine === 'mysql' || engine === 'mariadb') {
    return 'mysql://user:${DB_PASSWORD}@localhost:3306/database'
  }

  if (engine === 'mongodb') {
    return 'mongodb://user:${DB_PASSWORD}@localhost:27017/admin?authSource=admin'
  }

  if (engine === 'redis' || engine === 'valkey') {
    return 'redis://:${DB_PASSWORD}@localhost:6379/0'
  }

  if (engine === 'sqlite' || engine === 'duckdb' || engine === 'litedb') {
    return `${engine}://C:/data/database.db`
  }

  if (engine === 'elasticsearch' || engine === 'opensearch') {
    return 'http://localhost:9200'
  }

  return `${engine}://user:${'${PASSWORD}'}@host:port/database`
}

function cloudHostPlaceholder(engine: ConnectionProfile['engine']) {
  if (engine === 'bigquery') {
    return 'bigquery.googleapis.com or localhost contract endpoint'
  }

  if (engine === 'dynamodb') {
    return 'dynamodb.us-east-1.amazonaws.com or localhost'
  }

  if (engine === 'snowflake') {
    return 'account.snowflakecomputing.com'
  }

  return 'cloud endpoint, account host, or local contract endpoint'
}

function cloudScopeLabel(engine: ConnectionProfile['engine']) {
  if (engine === 'bigquery') {
    return 'Project / dataset'
  }

  if (engine === 'snowflake') {
    return 'Database / warehouse'
  }

  if (engine === 'dynamodb') {
    return 'Region / endpoint prefix'
  }

  return 'Database / scope'
}

function cloudScopePlaceholder(engine: ConnectionProfile['engine']) {
  if (engine === 'bigquery') {
    return 'project-id or project.dataset'
  }

  if (engine === 'snowflake') {
    return 'database or database.schema'
  }

  if (engine === 'dynamodb') {
    return 'us-east-1 or /local-prefix'
  }

  return 'database, region, project, or service scope'
}
