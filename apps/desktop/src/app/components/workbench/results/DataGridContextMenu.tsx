interface DataGridContextMenuProps {
  canDelete: boolean
  onClose(): void
  onCopyRow(): void
  onDeleteRow(): void
  x: number
  y: number
}

export function DataGridContextMenu({
  canDelete,
  onClose,
  onCopyRow,
  onDeleteRow,
  x,
  y,
}: DataGridContextMenuProps) {
  return (
    <div
      className="document-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={() => { onCopyRow(); onClose() }}>
        Copy Row
      </button>
      {canDelete ? (
        <button
          type="button"
          role="menuitem"
          className="document-context-menu-danger"
          onClick={() => { onDeleteRow(); onClose() }}
        >
          Delete Row
        </button>
      ) : null}
    </div>
  )
}
