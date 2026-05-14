import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ConnectionProfile,
  DataEditChange,
  DataEditExecutionRequest,
  DataEditExecutionResponse,
  DataEditKind,
} from '@datanaut/shared-types'
import { ClockIcon } from '../icons'
import { DocumentContextMenu } from './document-context-menu'
import type { DocumentEditContext } from './document-edit-context'
import {
  buildDocumentEditRequest,
  pathSegments,
  valueTypeName,
} from './document-edit-requests'
import { DocumentGridRowView } from './DocumentGridRowView'
import { documentResultBehaviorForConnection } from './datastore-result-behaviors'
import { editablePermissions } from './document-edit-permissions'
import {
  buildRows,
  collectExpandableRowIds,
  deleteValueAtPath,
  renameFieldAtPath,
  setValueAtPath,
  type DocumentGridRow,
} from './document-grid-model'
import { copyText } from './payload-export'
import { formatDurationClock } from './result-runtime'

interface DocumentResultsViewProps {
  connection?: ConnectionProfile
  editContext?: DocumentEditContext
  documents: Array<Record<string, unknown>>
  footerControls?: ReactNode
  resultDurationMs?: number
  resultSummary?: string
  totalDocumentCount?: number
  onExecuteDataEdit?(
    request: DataEditExecutionRequest,
  ): Promise<DataEditExecutionResponse | undefined>
}

interface ContextMenuState {
  x: number
  y: number
  row: DocumentGridRow
}

type DocumentEditCell = 'field' | 'type' | 'value'

interface ActiveEditorState {
  rowId: string
  cell: DocumentEditCell
}

export function DocumentResultsView({
  connection,
  editContext,
  documents,
  footerControls,
  resultDurationMs,
  resultSummary,
  totalDocumentCount,
  onExecuteDataEdit,
}: DocumentResultsViewProps) {
  const behavior = documentResultBehaviorForConnection(connection)
  const [draftState, setDraftState] = useState(() => ({
    source: documents,
    documents,
  }))
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set())
  const [copyMessage, setCopyMessage] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState>()
  const [activeEditor, setActiveEditor] = useState<ActiveEditorState>()
  const draftDocuments = draftState.source === documents ? draftState.documents : documents
  const effectiveActiveEditor = draftState.source === documents ? activeEditor : undefined
  const copyTimer = useRef<number | undefined>(undefined)
  const rows = useMemo(
    () => buildRows(draftDocuments, expandedRows),
    [draftDocuments, expandedRows],
  )
  const documentCountLabel = documentCountText(
    resultSummary,
    totalDocumentCount ?? draftDocuments.length,
  )

  useEffect(() => {
    return () => {
      if (copyTimer.current !== undefined) {
        window.clearTimeout(copyTimer.current)
      }
    }
  }, [])

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

  const updateDraftDocuments = (
    updater: (current: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
  ) => {
    setDraftState((current) => {
      const currentDocuments = current.source === documents ? current.documents : documents

      return {
        source: documents,
        documents: updater(currentDocuments),
      }
    })
  }

  const applyDocumentEdit = (
    row: DocumentGridRow,
    editKind: DataEditKind,
    changes: DataEditChange[],
    updater: (current: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
    successMessage: string,
  ) => {
    void (async () => {
      if (onExecuteDataEdit && editContext && connection) {
        const request = buildDocumentEditRequest(
          connection,
          editContext,
          draftDocuments,
          row,
          editKind,
          changes,
        )

        if (!request) {
          setCopyMessage('Edit kept locally; collection scope or document id is unavailable.')
          updateDraftDocuments(updater)
          return
        }

        const response = await onExecuteDataEdit(request)
        const failureMessage =
          response?.warnings.at(-1) ??
          response?.messages.at(-1) ??
          'Datastore did not confirm the edit.'

        if (!response?.executed) {
          setCopyMessage(failureMessage)
          return
        }
      }

      updateDraftDocuments(updater)
      setCopyMessage(successMessage)
    })()
  }

  const beginEditing = (row: DocumentGridRow, cell: DocumentEditCell) => {
    const permissions = editablePermissions(row, behavior)

    if (
      (cell === 'field' && !permissions.canEditField) ||
      (cell === 'value' && !permissions.canEditLeaf) ||
      (cell === 'type' && !permissions.canChangeType)
    ) {
      return
    }

    setDraftState((current) =>
      current.source === documents ? current : { source: documents, documents },
    )
    setActiveEditor({ rowId: row.id, cell })
  }

  const stopEditing = () => setActiveEditor(undefined)

  const toggleRow = (rowId: string) => {
    setExpandedRows((current) => {
      const next = new Set(current)

      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }

      return next
    })
  }

  const expandAll = () => {
    setExpandedRows(new Set(collectExpandableRowIds(draftDocuments)))
  }

  const collapseAll = () => {
    setExpandedRows(new Set())
  }

  const copyValue = async (value: unknown) => {
    await copyText(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    setCopyMessage('Copied value.')
  }

  const scheduleCopyValue = (value: unknown) => {
    if (copyTimer.current !== undefined) {
      window.clearTimeout(copyTimer.current)
    }

    copyTimer.current = window.setTimeout(() => {
      copyTimer.current = undefined
      void copyValue(value)
    }, 180)
  }

  const cancelScheduledCopy = () => {
    if (copyTimer.current !== undefined) {
      window.clearTimeout(copyTimer.current)
      copyTimer.current = undefined
    }
  }

  const copyDocument = async (row: DocumentGridRow) => {
    await copyText(JSON.stringify(draftDocuments[row.documentIndex], null, 2))
    setCopyMessage('Copied document JSON.')
  }

  const updateRowValue = (
    row: DocumentGridRow,
    nextValue: unknown,
    editKind: 'set-field' | 'change-field-type' = 'set-field',
  ) => {
    if (!behavior.canEditDocuments || row.path.length === 0) {
      return
    }

    applyDocumentEdit(
      row,
      editKind,
      [
        {
          path: pathSegments(row.path),
          value: nextValue,
          valueType: valueTypeName(nextValue),
        },
      ],
      (current) =>
        current.map((document, index) =>
          index === row.documentIndex ? setValueAtPath(document, row.path, nextValue) : document,
        ),
      editKind === 'change-field-type' ? 'Changed field type.' : 'Updated field value.',
    )
  }

  const renameRowField = (row: DocumentGridRow, nextFieldName: string) => {
    if (!behavior.canRenameFields || row.path.length === 0 || !nextFieldName.trim()) {
      return
    }

    const nextName = nextFieldName.trim()

    applyDocumentEdit(
      row,
      'rename-field',
      [
        {
          path: pathSegments(row.path),
          newName: pathSegments([...row.parentPath, nextName]).join('.'),
        },
      ],
      (current) =>
        current.map((document, index) =>
          index === row.documentIndex
            ? renameFieldAtPath(document, row.parentPath, row.path.at(-1), nextName)
            : document,
        ),
      'Renamed field.',
    )
  }

  const deleteRowField = (row: DocumentGridRow) => {
    if (!behavior.canEditDocuments || row.path.length === 0) {
      return
    }

    stopEditing()
    applyDocumentEdit(
      row,
      'unset-field',
      [
        {
          path: pathSegments(row.path),
        },
      ],
      (current) =>
        current.map((document, index) =>
          index === row.documentIndex ? deleteValueAtPath(document, row.path) : document,
        ),
      'Deleted field.',
    )
  }

  if (documents.length === 0) {
    return <p className="panel-footnote">No documents returned.</p>
  }

  return (
    <div className="document-data-grid-shell" aria-label="Document results">
      <div className="document-data-grid" role="treegrid" aria-label="Document result table">
        <div className="document-data-grid-row document-data-grid-row--header" role="row">
          <div className="document-data-grid-cell document-data-grid-cell--id" role="columnheader">
            key / _id
          </div>
          <div className="document-data-grid-cell document-data-grid-cell--type" role="columnheader">
            type
          </div>
          <div className="document-data-grid-cell document-data-grid-cell--value" role="columnheader">
            value
          </div>
        </div>
        {rows.map((row) => (
          <DocumentGridRowView
            key={row.id}
            row={row}
            expanded={expandedRows.has(row.id)}
            editingCell={
              effectiveActiveEditor?.rowId === row.id ? effectiveActiveEditor.cell : undefined
            }
            onBeginEditing={beginEditing}
            onCancelScheduledCopy={cancelScheduledCopy}
            onContextMenu={(selectedRow, x, y) => setContextMenu({ x, y, row: selectedRow })}
            onRenameField={renameRowField}
            onScheduleCopyValue={scheduleCopyValue}
            onStopEditing={stopEditing}
            onToggleRow={toggleRow}
            onUpdateValue={updateRowValue}
          />
        ))}
      </div>
      <div className="document-data-grid-footer">
        <div className="document-data-grid-footer-left">
          <button type="button" className="drawer-button" onClick={expandAll}>
            Expand All
          </button>
          <button type="button" className="drawer-button" onClick={collapseAll}>
            Collapse All
          </button>
          {footerControls}
          {copyMessage ? <span>{copyMessage}</span> : null}
        </div>
        <div className="document-data-grid-footer-right">
          <strong>{documentCountLabel}</strong>
          {resultDurationMs !== undefined ? (
            <span className="result-runtime-label" title="Query runtime">
              <ClockIcon className="panel-inline-icon" />
              {formatDurationClock(resultDurationMs)}
            </span>
          ) : null}
        </div>
      </div>
      {contextMenu ? (
        <DocumentContextMenu
          behavior={behavior}
          row={contextMenu.row}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(undefined)}
          onCopyDocument={() => void copyDocument(contextMenu.row)}
          onCopyPath={() => void copyText(contextMenu.row.fieldPath || '$')}
          onCopyValue={() => void copyValue(contextMenu.row.value)}
          onDelete={() => deleteRowField(contextMenu.row)}
          onEditValue={() => {
            beginEditing(contextMenu.row, 'value')
          }}
          onRename={() => {
            beginEditing(contextMenu.row, 'field')
          }}
        />
      ) : null}
    </div>
  )
}

function documentCountText(summary: string | undefined, fallbackCount: number) {
  const count = summary?.match(/^\s*(\d+)/)?.[1] ?? String(fallbackCount)
  return `${count} documents(s)`
}
