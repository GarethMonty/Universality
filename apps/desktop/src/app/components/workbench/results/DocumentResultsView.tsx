import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ConnectionProfile } from '@universality/shared-types'
import { documentResultBehaviorForConnection } from './datastore-result-behaviors'
import { writeFieldDragData } from './field-drag'
import { copyText } from './payload-export'

type DocumentValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

interface DocumentResultsViewProps {
  connection?: ConnectionProfile
  documents: Array<Record<string, unknown>>
  resultSummary?: string
}

interface DocumentGridRow {
  id: string
  depth: number
  label: string
  fieldPath: string
  type: DocumentValueType
  valueLabel: string
  value: unknown
  expandable: boolean
  documentIndex: number
  parentPath: Array<string | number>
  path: Array<string | number>
}

interface ContextMenuState {
  x: number
  y: number
  row: DocumentGridRow
}

interface ActiveEditorState {
  rowId: string
  cell: 'field' | 'type' | 'value'
}

const TYPE_OPTIONS: DocumentValueType[] = ['string', 'number', 'boolean', 'null', 'object', 'array']

export function DocumentResultsView({
  connection,
  documents,
  resultSummary,
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

  const beginEditing = (row: DocumentGridRow, cell: ActiveEditorState['cell']) => {
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

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      stopEditing()
    }
  }

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

  const updateRowValue = (row: DocumentGridRow, nextValue: unknown) => {
    if (!behavior.canEditDocuments || row.path.length === 0) {
      return
    }

    updateDraftDocuments((current) =>
      current.map((document, index) =>
        index === row.documentIndex ? setValueAtPath(document, row.path, nextValue) : document,
      ),
    )
  }

  const renameRowField = (row: DocumentGridRow, nextName: string) => {
    if (!behavior.canRenameFields || row.path.length === 0 || !nextName.trim()) {
      return
    }

    updateDraftDocuments((current) =>
      current.map((document, index) =>
        index === row.documentIndex
          ? renameFieldAtPath(document, row.parentPath, row.path.at(-1), nextName.trim())
          : document,
      ),
    )
  }

  const deleteRowField = (row: DocumentGridRow) => {
    if (!behavior.canEditDocuments || row.path.length === 0) {
      return
    }

    stopEditing()
    updateDraftDocuments((current) =>
      current.map((document, index) =>
        index === row.documentIndex ? deleteValueAtPath(document, row.path) : document,
      ),
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
        {rows.map((row) => {
          const expanded = expandedRows.has(row.id)
          const editingField =
            effectiveActiveEditor?.rowId === row.id && effectiveActiveEditor.cell === 'field'
          const editingType =
            effectiveActiveEditor?.rowId === row.id && effectiveActiveEditor.cell === 'type'
          const editingValue =
            effectiveActiveEditor?.rowId === row.id && effectiveActiveEditor.cell === 'value'

          return (
            <div
              key={row.id}
              className="document-data-grid-row"
              role="row"
              aria-level={row.depth + 1}
              aria-expanded={row.expandable ? expanded : undefined}
              onContextMenu={(event) => {
                event.preventDefault()
                setContextMenu({ x: event.clientX, y: event.clientY, row })
              }}
            >
              <div
                className="document-data-grid-cell document-data-grid-cell--id"
                role="gridcell"
                style={{ paddingLeft: 8 + row.depth * 18 }}
                title={row.fieldPath ? `Drag ${row.fieldPath} to the query builder` : row.label}
              >
                {row.expandable ? (
                  <button
                    type="button"
                    className="document-data-grid-expander"
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.label}`}
                    onClick={() => toggleRow(row.id)}
                  >
                    {expanded ? 'v' : '>'}
                  </button>
                ) : (
                  <span className="document-data-grid-spacer" />
                )}
                {editingField ? (
                  <input
                    className="document-data-grid-field-input"
                    aria-label={`Rename field ${row.label}`}
                    value={row.label}
                    autoFocus
                    onChange={(event) => renameRowField(row, event.target.value)}
                    onBlur={stopEditing}
                    onClick={(event) => event.stopPropagation()}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={handleEditorKeyDown}
                  />
                ) : (
                  <span
                    className="document-data-grid-field"
                    draggable={Boolean(row.fieldPath)}
                    title={row.fieldPath ? `Drag ${row.fieldPath} to the query builder` : row.label}
                    onDragStart={(event) => writeFieldDragData(event, row.fieldPath)}
                    onDoubleClick={() => beginEditing(row, 'field')}
                  >
                    {row.label}
                  </span>
                )}
              </div>
              <div
                className="document-data-grid-cell document-data-grid-cell--type"
                role="gridcell"
              >
                {editingType ? (
                  <select
                    className={`document-type-badge is-${row.type}`}
                    aria-label={`Change type ${row.fieldPath}`}
                    value={row.type}
                    autoFocus
                    onBlur={stopEditing}
                    onChange={(event) => {
                      updateRowValue(row, coerceValue(row.value, event.target.value as DocumentValueType))
                      stopEditing()
                    }}
                    onKeyDown={handleEditorKeyDown}
                  >
                    {TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={`document-type-badge is-${row.type}`}
                    onDoubleClick={() => beginEditing(row, 'type')}
                  >
                    {row.type}
                  </span>
                )}
              </div>
              <div
                className="document-data-grid-cell document-data-grid-cell--value"
                role="gridcell"
              >
                {editingValue ? (
                  <input
                    className="document-data-grid-value-input"
                    aria-label={`Edit value ${row.fieldPath}`}
                    value={editableValue(row.value)}
                    autoFocus
                    onChange={(event) => updateRowValue(row, parseEditedValue(event.target.value, row.type))}
                    onBlur={stopEditing}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={handleEditorKeyDown}
                  />
                ) : (
                  <button
                    type="button"
                    className="document-data-grid-value"
                    title="Copy value"
                    onClick={() => scheduleCopyValue(row.value)}
                    onDoubleClick={() => {
                      cancelScheduledCopy()
                      beginEditing(row, 'value')
                    }}
                  >
                    {row.valueLabel}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="document-data-grid-footer">
        <div className="document-data-grid-footer-left">
          <button type="button" className="drawer-button" onClick={expandAll}>
            Expand All
          </button>
          <button type="button" className="drawer-button" onClick={collapseAll}>
            Collapse All
          </button>
          <span>
            {rows.length} visible row(s) / {behavior.editModeLabel}
            {copyMessage ? ` / ${copyMessage}` : ''}
          </span>
        </div>
        <strong>{resultSummary ?? `${draftDocuments.length} document(s)`}</strong>
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

function DocumentContextMenu({
  behavior,
  onClose,
  onCopyDocument,
  onCopyPath,
  onCopyValue,
  onDelete,
  onEditValue,
  onRename,
  row,
  x,
  y,
}: {
  behavior: ReturnType<typeof documentResultBehaviorForConnection>
  onClose(): void
  onCopyDocument(): void
  onCopyPath(): void
  onCopyValue(): void
  onDelete(): void
  onEditValue(): void
  onRename(): void
  row: DocumentGridRow
  x: number
  y: number
}) {
  const permissions = editablePermissions(row, behavior)

  return (
    <div
      className="document-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {behavior.contextActions.copyPath ? (
        <button type="button" role="menuitem" onClick={() => { onCopyPath(); onClose() }}>
          Copy Path
        </button>
      ) : null}
      {behavior.contextActions.copyValue ? (
        <button type="button" role="menuitem" onClick={() => { onCopyValue(); onClose() }}>
          Copy Value
        </button>
      ) : null}
      {behavior.contextActions.copyDocument ? (
        <button type="button" role="menuitem" onClick={() => { onCopyDocument(); onClose() }}>
          Copy Document JSON
        </button>
      ) : null}
      {behavior.contextActions.renameField && permissions.canEditField ? (
        <button type="button" role="menuitem" onClick={() => { onRename(); onClose() }}>
          Rename Field
        </button>
      ) : null}
      {behavior.contextActions.editValue && permissions.canEditLeaf ? (
        <button type="button" role="menuitem" onClick={() => { onEditValue(); onClose() }}>
          Edit Value
        </button>
      ) : null}
      {behavior.contextActions.changeType && permissions.canChangeType ? (
        <span role="menuitem" className="document-context-menu-note">
          Double-click type to change
        </span>
      ) : null}
      {behavior.contextActions.deleteField && permissions.canDeleteField ? (
        <button type="button" role="menuitem" onClick={() => { onDelete(); onClose() }}>
          Delete Field
        </button>
      ) : null}
    </div>
  )
}

function editablePermissions(
  row: DocumentGridRow,
  behavior: ReturnType<typeof documentResultBehaviorForConnection>,
) {
  const isProtectedField = row.fieldPath === '_id'
  const isArrayIndex = typeof row.path.at(-1) === 'number'
  const canEditField =
    behavior.canEditDocuments &&
    behavior.canRenameFields &&
    row.path.length > 0 &&
    !isProtectedField &&
    !isArrayIndex
  const canEditLeaf =
    behavior.canEditDocuments && row.path.length > 0 && !isProtectedField && !row.expandable
  const canChangeType = canEditLeaf && behavior.canChangeTypes
  const canDeleteField =
    behavior.canEditDocuments && row.path.length > 0 && !isProtectedField

  return { canChangeType, canDeleteField, canEditField, canEditLeaf }
}

function buildRows(documents: Array<Record<string, unknown>>, expandedRows: Set<string>) {
  const rows: DocumentGridRow[] = []

  documents.forEach((document, index) => {
    const rootId = `document-${index}`
    const rootLabel = documentRootLabel(document, index)
    rows.push(rowForValue(rootId, index, 0, rootLabel, '_id', document, [], []))

    if (expandedRows.has(rootId)) {
      rows.push(...childRows(document, index, rootId, 1, [], expandedRows))
    }
  })

  return rows
}

function childRows(
  value: unknown,
  documentIndex: number,
  parentId: string,
  depth: number,
  parentPath: Array<string | number>,
  expandedRows: Set<string>,
): DocumentGridRow[] {
  if (!isExpandableValue(value)) {
    return []
  }

  const entries = valueEntries(value)

  return entries.flatMap(([key, childValue]) => {
    const pathKey = key.startsWith('[') ? Number(key.slice(1, -1)) : key
    const path = [...parentPath, pathKey]
    const fieldPath = pathToFieldPath(path)
    const id = `${parentId}.${key}`
    const row = rowForValue(id, documentIndex, depth, key, fieldPath, childValue, parentPath, path)

    if (!expandedRows.has(id)) {
      return [row]
    }

    return [row, ...childRows(childValue, documentIndex, id, depth + 1, path, expandedRows)]
  })
}

function collectExpandableRowIds(documents: Array<Record<string, unknown>>): string[] {
  const ids: string[] = []

  documents.forEach((document, index) => {
    const rootId = `document-${index}`
    ids.push(rootId)
    collectExpandableChildren(document, rootId, ids)
  })

  return ids
}

function collectExpandableChildren(value: unknown, parentId: string, ids: string[]): void {
  if (!isExpandableValue(value)) {
    return
  }

  const entries = valueEntries(value)

  entries.forEach(([key, childValue]) => {
    if (!isExpandableValue(childValue)) {
      return
    }

    const id = `${parentId}.${key}`
    ids.push(id)
    collectExpandableChildren(childValue, id, ids)
  })
}

function rowForValue(
  id: string,
  documentIndex: number,
  depth: number,
  label: string,
  fieldPath: string,
  value: unknown,
  parentPath: Array<string | number>,
  path: Array<string | number>,
): DocumentGridRow {
  const type = valueType(value)

  return {
    id,
    depth,
    documentIndex,
    label,
    fieldPath,
    parentPath,
    path,
    type,
    value,
    valueLabel: compactValue(value),
    expandable: isExpandableValue(value),
  }
}

function documentRootLabel(document: Record<string, unknown>, index: number) {
  if (Object.hasOwn(document, '_id')) {
    return rootIdentityLabel(document._id)
  }

  const id = document.id ?? document.key

  if (typeof id === 'string' || typeof id === 'number') {
    return String(id)
  }

  const firstKey = Object.keys(document)[0]
  return firstKey ? `${firstKey}: ${compactValue(document[firstKey])}` : `document ${index + 1}`
}

function rootIdentityLabel(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || value === undefined) {
    return String(value)
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function pathToFieldPath(path: Array<string | number>) {
  return path
    .map((item) => (typeof item === 'number' ? `[${item}]` : item))
    .reduce((current, item) => {
      if (item.startsWith('[')) {
        return `${current}${item}`
      }

      return current ? `${current}.${item}` : item
    }, '')
}

function isExpandableValue(value: unknown): value is Array<unknown> | Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}

function valueEntries(value: Array<unknown> | Record<string, unknown>): Array<[string, unknown]> {
  return Array.isArray(value)
    ? value.map((item, index) => [`[${index}]`, item])
    : Object.entries(value)
}

function valueType(value: unknown): DocumentValueType {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  if (typeof value === 'object') {
    return 'object'
  }

  return typeof value as DocumentValueType
}

function compactValue(value: unknown) {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return `[${value.length} item(s)]`
  }

  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).length} field(s)}`
  }

  if (typeof value === 'string') {
    return value
  }

  return String(value)
}

function editableValue(value: unknown) {
  if (value === null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

function parseEditedValue(value: string, type: DocumentValueType) {
  if (type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (type === 'boolean') {
    return value.toLowerCase() === 'true'
  }

  if (type === 'null') {
    return null
  }

  if (type === 'object' || type === 'array') {
    try {
      return JSON.parse(value)
    } catch {
      return type === 'array' ? [] : {}
    }
  }

  return value
}

function coerceValue(value: unknown, type: DocumentValueType) {
  if (type === 'string') {
    return value === null ? '' : String(value)
  }

  if (type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (type === 'boolean') {
    return Boolean(value)
  }

  if (type === 'null') {
    return null
  }

  if (type === 'array') {
    return Array.isArray(value) ? value : []
  }

  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function setValueAtPath(
  document: Record<string, unknown>,
  path: Array<string | number>,
  nextValue: unknown,
) {
  const clone = structuredClone(document) as Record<string, unknown>
  const parent = valueAtPath(clone, path.slice(0, -1))
  const key = path.at(-1)

  if (parent && key !== undefined) {
    ;(parent as Record<string, unknown> | Array<unknown>)[key as never] = nextValue as never
  }

  return clone
}

function renameFieldAtPath(
  document: Record<string, unknown>,
  parentPath: Array<string | number>,
  oldKey: string | number | undefined,
  nextName: string,
) {
  const clone = structuredClone(document) as Record<string, unknown>
  const parent = valueAtPath(clone, parentPath)

  if (!parent || oldKey === undefined || Array.isArray(parent)) {
    return clone
  }

  const record = parent as Record<string, unknown>
  record[nextName] = record[String(oldKey)]
  delete record[String(oldKey)]
  return clone
}

function deleteValueAtPath(document: Record<string, unknown>, path: Array<string | number>) {
  const clone = structuredClone(document) as Record<string, unknown>
  const parent = valueAtPath(clone, path.slice(0, -1))
  const key = path.at(-1)

  if (!parent || key === undefined) {
    return clone
  }

  if (Array.isArray(parent) && typeof key === 'number') {
    parent.splice(key, 1)
  } else {
    delete (parent as Record<string, unknown>)[String(key)]
  }

  return clone
}

function valueAtPath(value: unknown, path: Array<string | number>) {
  return path.reduce<unknown>((current, key) => {
    if (current === null || current === undefined) {
      return undefined
    }

    return (current as Record<string, unknown> | Array<unknown>)[key as never]
  }, value)
}
