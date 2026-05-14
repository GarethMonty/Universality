import type {
  ConnectionProfile,
  EnvironmentProfile,
  LocalDatabaseCreateRequest,
  LocalDatabaseManifest,
} from '@datapadplusplus/shared-types'
import { FavoriteIcon, ReadOnlyIcon } from './icons'
import {
  defaultPortForEngine,
  engineFamily,
  engineLabel,
  engineOption,
} from './RightDrawer.helpers'
import { DatastoreEngineSelect } from './RightDrawer.engine-select'
import { FormField } from './RightDrawer.primitives'

type UpdateConnectionDraft = (
  patch: Partial<ConnectionProfile>,
  options?: { preserveName?: boolean },
) => void

interface ConnectionFormProps {
  connectionDraft: ConnectionProfile
  databaseLabel: string
  environments: EnvironmentProfile[]
  isLocalDatabaseEngine: boolean
  localDatabaseManifest?: LocalDatabaseManifest
  localDatabaseName: string
  localDatabaseStatus: string
  namePlaceholder: string
  pendingCreateFolder: string
  secretDraft: string
  selectedEnvironmentId: string
  createLocalDatabase(mode: LocalDatabaseCreateRequest['mode']): Promise<void>
  onChooseNewLocalDatabasePath(): Promise<void>
  onLocalDatabaseNameChange(value: string): void
  onOpenExistingLocalDatabase(): Promise<void>
  onSecretDraftChange(value: string): void
  onSetNameOverridden(value: boolean): void
  onUpdateConnectionDraft: UpdateConnectionDraft
}

export function ConnectionForm({
  connectionDraft,
  databaseLabel,
  environments,
  isLocalDatabaseEngine,
  localDatabaseManifest,
  localDatabaseName,
  localDatabaseStatus,
  namePlaceholder,
  pendingCreateFolder,
  secretDraft,
  selectedEnvironmentId,
  createLocalDatabase,
  onChooseNewLocalDatabasePath,
  onLocalDatabaseNameChange,
  onOpenExistingLocalDatabase,
  onSecretDraftChange,
  onSetNameOverridden,
  onUpdateConnectionDraft,
}: ConnectionFormProps) {
  const updateEngine = (engine: ConnectionProfile['engine']) => {
    const nextEngineOption = engineOption(engine)
    const nextIsLocalDatabase = Boolean(nextEngineOption?.localDatabase)
    onUpdateConnectionDraft({
      engine,
      family: engineFamily(engine),
      connectionMode:
        connectionDraft.engine === engine
          ? connectionDraft.connectionMode
          : nextEngineOption?.connectionMode,
      host:
        nextIsLocalDatabase
          ? connectionDraft.database ?? connectionDraft.host
          : connectionDraft.host || 'localhost',
      port:
        nextIsLocalDatabase
          ? undefined
          : connectionDraft.engine === engine
            ? connectionDraft.port
            : defaultPortForEngine(engine),
      auth:
        nextIsLocalDatabase
          ? {
              ...connectionDraft.auth,
              username: undefined,
              sslMode: undefined,
            }
          : connectionDraft.auth,
    })
  }

  return (
    <div className="drawer-form">
      <div className="drawer-field">
        <span>Database type</span>
        <DatastoreEngineSelect value={connectionDraft.engine} onChange={updateEngine} />
      </div>

      {isLocalDatabaseEngine ? (
        <LocalDatabaseActions
          databaseLabel={engineLabel(connectionDraft.engine)}
          localDatabaseManifest={localDatabaseManifest}
          localDatabaseName={localDatabaseName}
          localDatabaseStatus={localDatabaseStatus}
          pendingCreateFolder={pendingCreateFolder}
          createLocalDatabase={createLocalDatabase}
          onChooseNewLocalDatabasePath={onChooseNewLocalDatabasePath}
          onLocalDatabaseNameChange={onLocalDatabaseNameChange}
          onOpenExistingLocalDatabase={onOpenExistingLocalDatabase}
        />
      ) : null}

      {!isLocalDatabaseEngine ? (
        <RemoteConnectionFields
          connectionDraft={connectionDraft}
          secretDraft={secretDraft}
          onSecretDraftChange={onSecretDraftChange}
          onUpdateConnectionDraft={onUpdateConnectionDraft}
        />
      ) : null}

      <FormField label={databaseLabel}>
        <input
          aria-label={databaseLabel}
          value={connectionDraft.database ?? ''}
          onChange={(event) =>
            onUpdateConnectionDraft({
              database: event.target.value,
              host: isLocalDatabaseEngine ? event.target.value : connectionDraft.host,
            })
          }
        />
      </FormField>

      <FormField label="Name">
        <input
          value={connectionDraft.name}
          placeholder={namePlaceholder}
          onChange={(event) => {
            onSetNameOverridden(event.target.value.trim().length > 0)
            onUpdateConnectionDraft({ name: event.target.value }, { preserveName: true })
          }}
        />
      </FormField>

      <FormField label="Environment">
        <select
          value={selectedEnvironmentId}
          onChange={(event) =>
            onUpdateConnectionDraft({
              environmentIds: event.target.value ? [event.target.value] : [],
            })
          }
        >
          <option value="">None</option>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.label}
            </option>
          ))}
        </select>
      </FormField>

      <ConnectionFlags
        favorite={connectionDraft.favorite}
        readOnly={connectionDraft.readOnly}
        onUpdateConnectionDraft={onUpdateConnectionDraft}
      />
    </div>
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
                title={`Create a ${databaseLabel} database with a small starter items table for local prototyping.`}
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

function RemoteConnectionFields({
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

function ConnectionFlags({
  favorite,
  readOnly,
  onUpdateConnectionDraft,
}: {
  favorite: boolean
  readOnly: boolean
  onUpdateConnectionDraft: UpdateConnectionDraft
}) {
  return (
    <div className="connection-flags-section">
      <div className="connection-flags-title">
        <span>Connection options</span>
      </div>
      <div className="drawer-toggle-row">
        <button
          type="button"
          className={`drawer-toggle${favorite ? ' is-active' : ''}`}
          onClick={() => onUpdateConnectionDraft({ favorite: !favorite })}
        >
          <FavoriteIcon className="drawer-inline-icon" />
          Favorite
        </button>
        <button
          type="button"
          className={`drawer-toggle${readOnly ? ' is-active' : ''}`}
          onClick={() => onUpdateConnectionDraft({ readOnly: !readOnly })}
        >
          <ReadOnlyIcon className="drawer-inline-icon" />
          Read-only
        </button>
      </div>
    </div>
  )
}
