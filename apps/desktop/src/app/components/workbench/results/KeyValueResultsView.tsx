import { useEffect, useMemo, useState } from 'react'
import type {
  ConnectionProfile,
  DataEditExecutionRequest,
  DataEditExecutionResponse,
} from '@datanaut/shared-types'
import type { DocumentEditContext } from './document-edit-context'
import {
  KeyValueAddPanel,
  KeyValueDeletePanel,
  KeyValueTtlPanel,
} from './KeyValueEditPanels'
import { KeyValueEntryRows } from './KeyValueEntryRows'
import { KeyValueContextMenu } from './KeyValueContextMenu'
import {
  buildKeyValueEditRequest,
  keyValueCanEdit,
  keyValueConfirmationText,
  parseKeyValueInput,
} from './keyvalue-edit-requests'

interface KeyValueResultsViewProps {
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  entries: Record<string, string>
  onExecuteDataEdit?(
    request: DataEditExecutionRequest,
  ): Promise<DataEditExecutionResponse | undefined>
}

interface ContextMenuState {
  keyName: string
  x: number
  y: number
}

interface PendingDeleteState {
  confirmation: string
  expectedText: string
  keyName: string
}

interface PendingTtlState {
  keyName: string
  seconds: string
}

interface PendingAddState {
  keyName: string
  value: string
}

export function KeyValueResultsView({
  connection,
  editContext,
  entries,
  onExecuteDataEdit,
}: KeyValueResultsViewProps) {
  const [draftEntries, setDraftEntries] = useState(entries)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [editingKey, setEditingKey] = useState<string>()
  const [editingValue, setEditingValue] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState>()
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteState>()
  const [pendingTtl, setPendingTtl] = useState<PendingTtlState>()
  const [pendingAdd, setPendingAdd] = useState<PendingAddState>()
  const [statusMessage, setStatusMessage] = useState('')
  const canEdit = keyValueCanEdit(connection, editContext) && Boolean(onExecuteDataEdit)
  const rows = useMemo(
    () =>
      Object.entries(draftEntries).map(([keyName, rawValue]) => ({
        keyName,
        rawValue,
        parsedValue: parseKeyValueInput(rawValue),
      })),
    [draftEntries],
  )

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const close = () => setContextMenu(undefined)
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  const beginValueEdit = (keyName: string, rawValue: string) => {
    if (!canEdit) {
      return
    }

    setEditingKey(keyName)
    setEditingValue(rawValue)
  }

  const commitValueEdit = async () => {
    if (!editingKey) {
      return
    }

    const nextValue = parseKeyValueInput(editingValue)
    const request = buildKeyValueEditRequest({
      connection,
      editContext,
      editKind: 'set-key-value',
      key: editingKey,
      value: nextValue,
    })
    const keyName = editingKey
    setEditingKey(undefined)

    if (!request || !onExecuteDataEdit) {
      return
    }

    const response = await onExecuteDataEdit(request)
    if (response?.executed) {
      setDraftEntries((current) => ({
        ...current,
        [keyName]: serializedKeyValue(nextValue),
      }))
      setStatusMessage(`Updated ${keyName}.`)
    } else {
      setStatusMessage(response?.warnings.join(' ') || `Unable to update ${keyName}.`)
    }
  }

  const addKey = async () => {
    if (!pendingAdd || !onExecuteDataEdit) {
      return
    }

    const keyName = pendingAdd.keyName.trim()
    if (!keyName || draftEntries[keyName] !== undefined) {
      return
    }

    const nextValue = parseKeyValueInput(pendingAdd.value)
    const request = buildKeyValueEditRequest({
      connection,
      editContext,
      editKind: 'set-key-value',
      key: keyName,
      value: nextValue,
    })
    setPendingAdd(undefined)

    if (!request) {
      return
    }

    const response = await onExecuteDataEdit(request)
    if (response?.executed) {
      setDraftEntries((current) => ({
        ...current,
        [keyName]: serializedKeyValue(nextValue),
      }))
      setStatusMessage(`Added ${keyName}.`)
    } else {
      setStatusMessage(response?.warnings.join(' ') || `Unable to add ${keyName}.`)
    }
  }

  const setTtl = async () => {
    if (!pendingTtl || !onExecuteDataEdit) {
      return
    }

    const seconds = Number(pendingTtl.seconds)
    const request = buildKeyValueEditRequest({
      connection,
      editContext,
      editKind: 'set-ttl',
      key: pendingTtl.keyName,
      value: Number.isFinite(seconds) ? Math.floor(seconds) : pendingTtl.seconds,
    })
    const keyName = pendingTtl.keyName
    setPendingTtl(undefined)

    if (!request) {
      return
    }

    const response = await onExecuteDataEdit(request)
    setStatusMessage(
      response?.executed
        ? `Set TTL for ${keyName}.`
        : response?.warnings.join(' ') || `Unable to set TTL for ${keyName}.`,
    )
  }

  const deleteKey = async () => {
    if (!pendingDelete || !onExecuteDataEdit) {
      return
    }

    const request = buildKeyValueEditRequest({
      connection,
      editContext,
      editKind: 'delete-key',
      key: pendingDelete.keyName,
    })
    const keyName = pendingDelete.keyName
    setPendingDelete(undefined)

    if (!request) {
      return
    }

    const response = await onExecuteDataEdit({
      ...request,
      confirmationText: pendingDelete.confirmation,
    })
    if (response?.executed) {
      setDraftEntries((current) => {
        const next = { ...current }
        delete next[keyName]
        return next
      })
      setStatusMessage(`Deleted ${keyName}.`)
    } else {
      setStatusMessage(response?.warnings.join(' ') || `Unable to delete ${keyName}.`)
    }
  }

  return (
    <div className="keyvalue-results" aria-label="Key-value results">
      <div className="keyvalue-results-header" role="row">
        <span>Key</span>
        <span>Type</span>
        <span>Value</span>
      </div>
      {canEdit ? (
        <div className="keyvalue-actions">
          <button
            type="button"
            className="drawer-button"
            onClick={() => setPendingAdd({ keyName: '', value: '' })}
          >
            Add Key
          </button>
        </div>
      ) : null}
      {pendingAdd ? (
        <KeyValueAddPanel
          duplicate={draftEntries[pendingAdd.keyName.trim()] !== undefined}
          keyName={pendingAdd.keyName}
          value={pendingAdd.value}
          onCancel={() => setPendingAdd(undefined)}
          onInsert={() => void addKey()}
          onKeyNameChange={(keyName) =>
            setPendingAdd((current) => (current ? { ...current, keyName } : current))
          }
          onValueChange={(value) =>
            setPendingAdd((current) => (current ? { ...current, value } : current))
          }
        />
      ) : null}
      <div className="keyvalue-results-body">
        <KeyValueEntryRows
          canEdit={canEdit}
          editingKey={editingKey}
          editingValue={editingValue}
          expandedKeys={expandedKeys}
          rows={rows}
          onBeginValueEdit={beginValueEdit}
          onCancelEdit={() => setEditingKey(undefined)}
          onCommitValueEdit={() => void commitValueEdit()}
          onOpenContextMenu={(keyName, x, y) => setContextMenu({ keyName, x, y })}
          onToggleExpanded={(keyName) =>
            setExpandedKeys((current) => {
              const next = new Set(current)
              if (next.has(keyName)) {
                next.delete(keyName)
              } else {
                next.add(keyName)
              }
              return next
            })
          }
          onUpdateEditingValue={setEditingValue}
        />
      </div>
      {pendingTtl ? (
        <KeyValueTtlPanel
          keyName={pendingTtl.keyName}
          seconds={pendingTtl.seconds}
          onCancel={() => setPendingTtl(undefined)}
          onSecondsChange={(seconds) =>
            setPendingTtl((current) => (current ? { ...current, seconds } : current))
          }
          onSetTtl={() => void setTtl()}
        />
      ) : null}
      {pendingDelete ? (
        <KeyValueDeletePanel
          confirmation={pendingDelete.confirmation}
          expectedText={pendingDelete.expectedText}
          keyName={pendingDelete.keyName}
          onCancel={() => setPendingDelete(undefined)}
          onConfirm={() => void deleteKey()}
          onConfirmationChange={(confirmation) =>
            setPendingDelete((current) =>
              current ? { ...current, confirmation } : current,
            )
          }
        />
      ) : null}
      {statusMessage ? <div className="data-grid-status">{statusMessage}</div> : null}
      {contextMenu ? (
        <KeyValueContextMenu
          canEdit={canEdit}
          keyName={contextMenu.keyName}
          rawValue={draftEntries[contextMenu.keyName] ?? ''}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(undefined)}
          onEdit={() => beginValueEdit(contextMenu.keyName, draftEntries[contextMenu.keyName] ?? '')}
          onSetTtl={() => setPendingTtl({ keyName: contextMenu.keyName, seconds: '3600' })}
          onDelete={() => {
            if (!connection) {
              return
            }
            setPendingDelete({
              confirmation: '',
              expectedText: keyValueConfirmationText(connection, 'delete-key'),
              keyName: contextMenu.keyName,
            })
          }}
        />
      ) : null}
    </div>
  )
}

function serializedKeyValue(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
