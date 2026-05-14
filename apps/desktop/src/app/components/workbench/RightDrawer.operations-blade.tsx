import { startTransition, useEffect, useState } from 'react'
import type {
  ConnectionProfile,
  DatastoreOperationManifest,
  EnvironmentProfile,
  OperationExecutionRequest,
  OperationExecutionResponse,
  OperationManifestRequest,
  OperationManifestResponse,
  OperationPlanRequest,
  OperationPlanResponse,
} from '@datapadplusplus/shared-types'
import { SettingsIcon } from './icons'
import { DrawerHeader } from './RightDrawer.primitives'

export function OperationsBlade({
  activeConnection,
  activeEnvironment,
  onApplyTemplate,
  onClose,
  onExecuteOperation,
  onListOperations,
  onPlanOperation,
}: {
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  onApplyTemplate(queryTemplate?: string): void
  onClose(): void
  onListOperations(
    request: OperationManifestRequest,
  ): Promise<OperationManifestResponse | undefined>
  onPlanOperation(
    request: OperationPlanRequest,
  ): Promise<OperationPlanResponse | undefined>
  onExecuteOperation(
    request: OperationExecutionRequest,
  ): Promise<OperationExecutionResponse | undefined>
}) {
  const [filter, setFilter] = useState('')
  const [operations, setOperations] = useState<DatastoreOperationManifest[]>([])
  const [selectedOperation, setSelectedOperation] =
    useState<DatastoreOperationManifest>()
  const [objectName, setObjectName] = useState('')
  const [confirmationText, setConfirmationText] = useState('')
  const [planResponse, setPlanResponse] = useState<OperationPlanResponse>()
  const [executionResponse, setExecutionResponse] =
    useState<OperationExecutionResponse>()
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    let mounted = true
    void Promise.resolve()
      .then(async () => {
        if (!mounted) {
          return
        }

        startTransition(() => {
          setStatus('loading')
          setLocalError('')
        })
        const response = await onListOperations({
          connectionId: activeConnection.id,
          environmentId: activeEnvironment.id,
        })

        if (!mounted) {
          return
        }

        const nextOperations = response?.operations ?? []
        startTransition(() => {
          setOperations(nextOperations)
          setSelectedOperation(nextOperations[0])
          setStatus('ready')
        })
      })
      .catch(() => {
        if (mounted) {
          startTransition(() => {
            setLocalError('Unable to load datastore operations.')
            setStatus('ready')
          })
        }
      })

    return () => {
      mounted = false
    }
  }, [activeConnection.id, activeEnvironment.id, onListOperations])

  const selectedOperationId = selectedOperation?.id

  useEffect(() => {
    let mounted = true
    void Promise.resolve()
      .then(async () => {
        if (!mounted) {
          return
        }

        if (!selectedOperationId) {
          startTransition(() => setPlanResponse(undefined))
          return
        }

        startTransition(() => {
          setLocalError('')
          setConfirmationText('')
          setExecutionResponse(undefined)
        })
        const response = await onPlanOperation({
          connectionId: activeConnection.id,
          environmentId: activeEnvironment.id,
          operationId: selectedOperationId,
          objectName: objectName || undefined,
        })

        if (mounted) {
          startTransition(() => setPlanResponse(response))
        }
      })
      .catch(() => {
        if (mounted) {
          startTransition(() =>
            setLocalError('Unable to plan datastore operation.'),
          )
        }
      })

    return () => {
      mounted = false
    }
  }, [
    activeConnection.id,
    activeEnvironment.id,
    objectName,
    onPlanOperation,
    selectedOperationId,
  ])

  const filteredOperations = operations.filter((operation) =>
    `${operation.label} ${operation.scope} ${operation.risk} ${operation.description}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  )
  const confirmationExpected = planResponse?.plan.confirmationText
  const needsConfirmation = Boolean(
    selectedOperation?.requiresConfirmation || confirmationExpected,
  )
  const confirmationMatches =
    !confirmationExpected || confirmationText === confirmationExpected
  const executionDisabled =
    !selectedOperation ||
    selectedOperation.executionSupport !== 'live' ||
    (needsConfirmation && !confirmationMatches)

  const executeSelectedOperation = async () => {
    if (!selectedOperation) {
      return
    }

    setLocalError('')
    const response = await onExecuteOperation({
      connectionId: activeConnection.id,
      environmentId: activeEnvironment.id,
      operationId: selectedOperation.id,
      objectName: objectName || undefined,
      confirmationText: confirmationText || undefined,
      rowLimit: 500,
    })

    if (!response) {
      setLocalError('Operation did not return a response.')
      return
    }

    setExecutionResponse(response)
  }

  return (
    <>
      <DrawerHeader
        title="Operations"
        subtitle={activeConnection.name}
        icon={SettingsIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Catalog</strong>
            <span>{status === 'loading' ? 'loading' : `${operations.length}`}</span>
          </div>
          <input
            className="drawer-input"
            value={filter}
            placeholder="Filter operations"
            aria-label="Filter datastore operations"
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="operation-list" role="listbox" aria-label="Datastore operations">
            {filteredOperations.map((operation) => (
              <button
                key={operation.id}
                type="button"
                className={`operation-list-item ${
                  selectedOperation?.id === operation.id
                    ? 'operation-list-item--active'
                    : ''
                }`}
                onClick={() => setSelectedOperation(operation)}
              >
                <span>
                  <strong>{operation.label}</strong>
                  <small>{operation.scope}</small>
                </span>
                <span className={`operation-risk operation-risk--${operation.risk}`}>
                  {operation.risk}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Plan</strong>
            <span>{selectedOperation?.executionSupport ?? 'unsupported'}</span>
          </div>
          {selectedOperation ? (
            <>
              <p className="drawer-copy">{selectedOperation.description}</p>
              {selectedOperation.disabledReason ? (
                <p className="drawer-copy">{selectedOperation.disabledReason}</p>
              ) : null}
              <label className="drawer-field">
                <span>Object or scope</span>
                <input
                  value={objectName}
                  placeholder="Optional target object"
                  onChange={(event) => setObjectName(event.target.value)}
                />
              </label>
              {planResponse?.plan.generatedRequest ? (
                <pre className="drawer-code">
                  <code>{planResponse.plan.generatedRequest}</code>
                </pre>
              ) : null}
              {planResponse?.plan.warnings.length ? (
                <ul className="messages-list">
                  {planResponse.plan.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="drawer-copy">No operation selected.</p>
          )}
        </div>

        {needsConfirmation ? (
          <div className="drawer-section">
            <div className="drawer-section-header">
              <strong>Confirmation</strong>
              <span>required</span>
            </div>
            <label className="drawer-field">
              <span>Type {confirmationExpected ?? 'the confirmation text'}</span>
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {executionResponse || localError ? (
          <div className="drawer-section">
            <div className="drawer-section-header">
              <strong>Result</strong>
              <span>{executionResponse?.executed ? 'executed' : 'planned'}</span>
            </div>
            {localError ? <p className="drawer-copy">{localError}</p> : null}
            {executionResponse?.messages.length ? (
              <ul className="messages-list">
                {executionResponse.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            {executionResponse?.warnings.length ? (
              <ul className="messages-list">
                {executionResponse.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {executionResponse?.result ? (
              <pre className="drawer-code">
                <code>{executionResponse.result.summary}</code>
              </pre>
            ) : null}
            {executionResponse?.metadata ? (
              <pre className="drawer-code">
                <code>{JSON.stringify(executionResponse.metadata, null, 2)}</code>
              </pre>
            ) : null}
            {executionResponse?.permissionInspection ? (
              <pre className="drawer-code">
                <code>
                  {JSON.stringify(executionResponse.permissionInspection, null, 2)}
                </code>
              </pre>
            ) : null}
            {executionResponse?.diagnostics ? (
              <pre className="drawer-code">
                <code>{JSON.stringify(executionResponse.diagnostics, null, 2)}</code>
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="drawer-footer">
        <button
          type="button"
          className="drawer-button"
          disabled={!planResponse?.plan.generatedRequest}
          onClick={() => onApplyTemplate(planResponse?.plan.generatedRequest)}
        >
          Open in Editor
        </button>
        <button
          type="button"
          className="drawer-button drawer-button--primary"
          disabled={executionDisabled}
          title={
            selectedOperation?.executionSupport === 'live'
              ? 'Execute this live operation.'
              : 'This operation is plan-only for this adapter.'
          }
          onClick={() => void executeSelectedOperation()}
        >
          Execute
        </button>
      </div>
    </>
  )
}
