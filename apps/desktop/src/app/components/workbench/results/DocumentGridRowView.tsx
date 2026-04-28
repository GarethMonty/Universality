import type { KeyboardEvent } from 'react'
import {
  coerceValue,
  editableValue,
  parseEditedValue,
  type DocumentGridRow,
  type DocumentValueType,
} from './document-grid-model'
import { writeFieldDragData } from './field-drag'

const TYPE_OPTIONS: DocumentValueType[] = ['string', 'number', 'boolean', 'null', 'object', 'array']

interface DocumentGridRowViewProps {
  editingCell?: 'field' | 'type' | 'value'
  expanded: boolean
  row: DocumentGridRow
  onBeginEditing(row: DocumentGridRow, cell: 'field' | 'type' | 'value'): void
  onCancelScheduledCopy(): void
  onContextMenu(row: DocumentGridRow, x: number, y: number): void
  onRenameField(row: DocumentGridRow, nextName: string): void
  onScheduleCopyValue(value: unknown): void
  onStopEditing(): void
  onToggleRow(rowId: string): void
  onUpdateValue(row: DocumentGridRow, nextValue: unknown): void
}

export function DocumentGridRowView({
  editingCell,
  expanded,
  row,
  onBeginEditing,
  onCancelScheduledCopy,
  onContextMenu,
  onRenameField,
  onScheduleCopyValue,
  onStopEditing,
  onToggleRow,
  onUpdateValue,
}: DocumentGridRowViewProps) {
  const editingField = editingCell === 'field'
  const editingType = editingCell === 'type'
  const editingValue = editingCell === 'value'

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      onStopEditing()
    }
  }

  return (
    <div
      className="document-data-grid-row"
      role="row"
      aria-level={row.depth + 1}
      aria-expanded={row.expandable ? expanded : undefined}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu(row, event.clientX, event.clientY)
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
            onClick={() => onToggleRow(row.id)}
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
            onChange={(event) => onRenameField(row, event.target.value)}
            onBlur={onStopEditing}
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
            onDoubleClick={() => onBeginEditing(row, 'field')}
          >
            {row.label}
          </span>
        )}
      </div>
      <div className="document-data-grid-cell document-data-grid-cell--type" role="gridcell">
        {editingType ? (
          <select
            className={`document-type-badge is-${row.type}`}
            aria-label={`Change type ${row.fieldPath}`}
            value={row.type}
            autoFocus
            onBlur={onStopEditing}
            onChange={(event) => {
              onUpdateValue(row, coerceValue(row.value, event.target.value as DocumentValueType))
              onStopEditing()
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
            onDoubleClick={() => onBeginEditing(row, 'type')}
          >
            {row.type}
          </span>
        )}
      </div>
      <div className="document-data-grid-cell document-data-grid-cell--value" role="gridcell">
        {editingValue ? (
          <input
            className="document-data-grid-value-input"
            aria-label={`Edit value ${row.fieldPath}`}
            value={editableValue(row.value)}
            autoFocus
            onChange={(event) => onUpdateValue(row, parseEditedValue(event.target.value, row.type))}
            onBlur={onStopEditing}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={handleEditorKeyDown}
          />
        ) : (
          <button
            type="button"
            className="document-data-grid-value"
            title="Copy value"
            onClick={() => onScheduleCopyValue(row.value)}
            onDoubleClick={() => {
              onCancelScheduledCopy()
              onBeginEditing(row, 'value')
            }}
          >
            {row.valueLabel}
          </button>
        )}
      </div>
    </div>
  )
}
