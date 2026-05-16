interface DataGridContextMenuProps {
  canDelete: boolean
  onClose(): void
  onDeleteRow(): void
  x: number
  y: number
}

export function DataGridContextMenu({
  canDelete,
  onClose,
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
