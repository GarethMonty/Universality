import { useState } from 'react'
import type {
  ConnectionProfile,
  ConnectionTestResult,
  EnvironmentProfile,
  LocalDatabaseCreateRequest,
  LocalDatabaseCreateResult,
  LocalDatabasePickRequest,
  LocalDatabasePickResult,
} from '@datanaut/shared-types'
import { ConnectionsIcon } from './icons'
import { ConnectionFooter } from './RightDrawer.connection-footer'
import { ConnectionForm } from './RightDrawer.connection-form'
import {
  engineOption,
  environmentAccentVariables,
  inferConnectionName,
  isCustomConnectionName,
  redactEnvironmentSecrets,
} from './RightDrawer.helpers'
import { DrawerHeader } from './RightDrawer.primitives'

interface ConnectionBladeProps {
  activeConnection: ConnectionProfile
  environments: EnvironmentProfile[]
  connectionTest?: ConnectionTestResult
  onClose(): void
  onSaveConnection(profile: ConnectionProfile, secret?: string): void
  onTestConnection(profile: ConnectionProfile, environmentId: string): void
  onPickLocalDatabaseFile(request: LocalDatabasePickRequest): Promise<LocalDatabasePickResult>
  onCreateLocalDatabase(
    request: LocalDatabaseCreateRequest,
  ): Promise<LocalDatabaseCreateResult | undefined>
}

export function ConnectionBlade({
  activeConnection,
  environments,
  connectionTest,
  onClose,
  onSaveConnection,
  onTestConnection,
  onPickLocalDatabaseFile,
  onCreateLocalDatabase,
}: ConnectionBladeProps) {
  const [nameOverridden, setNameOverridden] = useState(() =>
    isCustomConnectionName(activeConnection),
  )
  const [connectionDraft, setConnectionDraft] = useState(() =>
    isCustomConnectionName(activeConnection)
      ? activeConnection
      : {
          ...activeConnection,
          name: inferConnectionName(activeConnection),
        },
  )
  const [secretDraft, setSecretDraft] = useState('')
  const [pendingCreatePath, setPendingCreatePath] = useState('')
  const [localDatabaseStatus, setLocalDatabaseStatus] = useState('')

  const selectedEngineOption = engineOption(connectionDraft.engine)
  const isLocalDatabaseEngine = Boolean(
    selectedEngineOption?.localDatabase && selectedEngineOption.maturity === 'mvp',
  )
  const databaseLabel = connectionDraft.engine === 'sqlite' ? 'Database file' : 'Database'
  const selectedEnvironmentId = connectionDraft.environmentIds[0] ?? ''
  const selectedEnvironment = environments.find(
    (environment) => environment.id === selectedEnvironmentId,
  )
  const environmentAccentStyle = environmentAccentVariables(selectedEnvironment)
  const displayedResolvedHost = connectionTest
    ? redactEnvironmentSecrets(connectionTest.resolvedHost, selectedEnvironmentId, environments)
    : ''
  const displayedResolvedDatabase = connectionTest?.resolvedDatabase
    ? redactEnvironmentSecrets(
        connectionTest.resolvedDatabase,
        selectedEnvironmentId,
        environments,
      )
    : undefined

  const updateConnectionDraft = (
    patch: Partial<ConnectionProfile>,
    options: { preserveName?: boolean } = {},
  ) => {
    setConnectionDraft((current) => {
      const next = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      }

      return options.preserveName || nameOverridden
        ? next
        : {
            ...next,
            name: inferConnectionName(next),
          }
    })
  }

  const setLocalDatabasePath = (path: string) => {
    updateConnectionDraft({
      host: path,
      database: path,
      port: undefined,
    })
  }

  const connectionForAction = () => ({
    ...connectionDraft,
    name: connectionDraft.name.trim() || inferConnectionName(connectionDraft),
  })

  const openExistingLocalDatabase = async () => {
    const result = await onPickLocalDatabaseFile({
      engine: connectionDraft.engine,
      purpose: 'open',
      currentPath: connectionDraft.database,
    })

    if (result.canceled || !result.path) {
      return
    }

    setLocalDatabasePath(result.path)
    setLocalDatabaseStatus('SQLite database path selected.')
  }

  const chooseNewLocalDatabasePath = async () => {
    const result = await onPickLocalDatabaseFile({
      engine: connectionDraft.engine,
      purpose: 'create',
      currentPath: connectionDraft.database,
    })

    if (result.canceled || !result.path) {
      return
    }

    setPendingCreatePath(result.path)
    setLocalDatabaseStatus('')
  }

  const createLocalDatabase = async (mode: LocalDatabaseCreateRequest['mode']) => {
    if (!pendingCreatePath) {
      return
    }

    const result = await onCreateLocalDatabase({
      engine: connectionDraft.engine,
      path: pendingCreatePath,
      mode,
      connectionId: connectionDraft.id,
      environmentId: selectedEnvironmentId || undefined,
    })

    if (!result) {
      return
    }

    const nextConnection = {
      ...connectionDraft,
      host: result.path,
      database: result.path,
    }
    const updatedConnection = {
      ...connectionDraft,
      host: result.path,
      database: result.path,
      name: nameOverridden ? connectionDraft.name : inferConnectionName(nextConnection),
      port: undefined,
      updatedAt: new Date().toISOString(),
    }

    setConnectionDraft(updatedConnection)
    setPendingCreatePath('')
    setLocalDatabaseStatus(
      result.warnings.length > 0
        ? `${result.message} ${result.warnings.join(' ')}`
        : result.message,
    )
    onSaveConnection(updatedConnection, secretDraft)
    onTestConnection(updatedConnection, selectedEnvironmentId)
  }

  return (
    <>
      <DrawerHeader
        title="Connection"
        subtitle="Profile"
        icon={ConnectionsIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div
          className={`drawer-section connection-profile-section${selectedEnvironment ? ' has-environment-accent' : ''}`}
          style={environmentAccentStyle}
        >
          <div className="drawer-section-header">
            <strong>Connection</strong>
            <span>{connectionDraft.engine}</span>
          </div>

          <ConnectionForm
            connectionDraft={connectionDraft}
            databaseLabel={databaseLabel}
            environments={environments}
            isLocalDatabaseEngine={isLocalDatabaseEngine}
            localDatabaseStatus={localDatabaseStatus}
            namePlaceholder={inferConnectionName(connectionDraft)}
            pendingCreatePath={pendingCreatePath}
            secretDraft={secretDraft}
            selectedEnvironmentId={selectedEnvironmentId}
            createLocalDatabase={createLocalDatabase}
            onChooseNewLocalDatabasePath={chooseNewLocalDatabasePath}
            onOpenExistingLocalDatabase={openExistingLocalDatabase}
            onSecretDraftChange={setSecretDraft}
            onSetNameOverridden={setNameOverridden}
            onUpdateConnectionDraft={updateConnectionDraft}
          />
        </div>
      </div>

      <ConnectionFooter
        connectionTest={connectionTest}
        environmentAccentStyle={environmentAccentStyle}
        getConnectionForAction={connectionForAction}
        hasEnvironment={Boolean(selectedEnvironment)}
        resolvedDatabase={displayedResolvedDatabase}
        resolvedHost={displayedResolvedHost}
        secretDraft={secretDraft}
        selectedEnvironmentId={selectedEnvironmentId}
        onSaveConnection={onSaveConnection}
        onTestConnection={onTestConnection}
      />
    </>
  )
}
