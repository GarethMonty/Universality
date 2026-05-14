import type {
  ConnectionProfile,
  EnvironmentProfile,
  LocalDatabaseCreateRequest,
} from '@datanaut/shared-types'
import { FavoriteIcon, ReadOnlyIcon } from './icons'
import {
  defaultPortForEngine,
  engineFamily,
  engineOption,
  ENGINE_GROUPS,
} from './RightDrawer.helpers'
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
  localDatabaseStatus: string
  namePlaceholder: string
  pendingCreatePath: string
  secretDraft: string
  selectedEnvironmentId: string
  createLocalDatabase(mode: LocalDatabaseCreateRequest['mode']): Promise<void>
  onChooseNewLocalDatabasePath(): Promise<void>
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
  localDatabaseStatus,
  namePlaceholder,
  pendingCreatePath,
  secretDraft,
  selectedEnvironmentId,
  createLocalDatabase,
  onChooseNewLocalDatabasePath,
  onOpenExistingLocalDatabase,
  onSecretDraftChange,
  onSetNameOverridden,
  onUpdateConnectionDraft,
}: ConnectionFormProps) {
  return (
    <div className="drawer-form">
      <FormField label="Database type">
        <select
          value={connectionDraft.engine}
          onChange={(event) => {
            const engine = event.target.value as ConnectionProfile['engine']
            const nextEngineOption = engineOption(engine)
            onUpdateConnectionDraft({
              engine,
              family: engineFamily(engine),
              connectionMode:
                connectionDraft.engine === engine
                  ? connectionDraft.connectionMode
                  : nextEngineOption?.connectionMode,
              host:
                engine === 'sqlite'
                  ? connectionDraft.database ?? connectionDraft.host
                  : connectionDraft.host || 'localhost',
              port:
                engine === 'sqlite'
                  ? undefined
                  : connectionDraft.engine === engine
                    ? connectionDraft.port
                    : defaultPortForEngine(engine),
              auth:
                engine === 'sqlite'
                  ? {
                      ...connectionDraft.auth,
                      username: undefined,
                      sslMode: undefined,
                    }
                  : connectionDraft.auth,
            })
          }}
        >
          {ENGINE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.maturity === 'planned'}
                >
                  {option.maturity === 'planned'
                    ? `${option.label} (planned)`
                    : option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </FormField>

      {isLocalDatabaseEngine ? (
        <LocalDatabaseActions
          localDatabaseStatus={localDatabaseStatus}
          pendingCreatePath={pendingCreatePath}
          createLocalDatabase={createLocalDatabase}
          onChooseNewLocalDatabasePath={onChooseNewLocalDatabasePath}
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
  localDatabaseStatus,
  pendingCreatePath,
  createLocalDatabase,
  onChooseNewLocalDatabasePath,
  onOpenExistingLocalDatabase,
}: {
  localDatabaseStatus: string
  pendingCreatePath: string
  createLocalDatabase(mode: LocalDatabaseCreateRequest['mode']): Promise<void>
  onChooseNewLocalDatabasePath(): Promise<void>
  onOpenExistingLocalDatabase(): Promise<void>
}) {
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
            title="Choose a path for a new SQLite database, then select empty or starter schema."
            onClick={() => void onChooseNewLocalDatabasePath()}
          >
            Create New
          </button>
        </div>
      </div>

      {pendingCreatePath ? (
        <div className="drawer-callout" role="dialog" aria-label="Create SQLite database">
          <strong>Create SQLite database</strong>
          <span>{pendingCreatePath}</span>
          <div className="drawer-button-row drawer-button-row--compact">
            <button
              type="button"
              className="drawer-button"
              title="Create a blank SQLite database file at the selected path."
              onClick={() => void createLocalDatabase('empty')}
            >
              Empty database
            </button>
            <button
              type="button"
              className="drawer-button drawer-button--primary"
              title="Create a SQLite database with a small starter items table for local prototyping."
              onClick={() => void createLocalDatabase('starter')}
            >
              Starter schema
            </button>
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
