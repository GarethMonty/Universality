import { copyText } from './payload-export'

interface KeyValueContextMenuProps {
  canEdit: boolean
  keyName: string
  rawValue: string
  x: number
  y: number
  onClose(): void
  onDelete(): void
  onEdit(): void
  onSetTtl(): void
}

export function KeyValueContextMenu({
  canEdit,
  keyName,
  rawValue,
  onClose,
  onDelete,
  onEdit,
  onSetTtl,
  x,
  y,
}: KeyValueContextMenuProps) {
  return (
    <div
      className="document-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={() => { void copyText(keyName); onClose() }}>
        Copy Key
      </button>
      <button type="button" role="menuitem" onClick={() => { void copyText(rawValue); onClose() }}>
        Copy Value
      </button>
      {canEdit ? (
        <button type="button" role="menuitem" onClick={() => { onEdit(); onClose() }}>
          Edit Value
        </button>
      ) : null}
      {canEdit ? (
        <button type="button" role="menuitem" onClick={() => { onSetTtl(); onClose() }}>
          Set TTL
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          role="menuitem"
          className="document-context-menu-danger"
          onClick={() => { onDelete(); onClose() }}
        >
          Delete Key
        </button>
      ) : null}
    </div>
  )
}
