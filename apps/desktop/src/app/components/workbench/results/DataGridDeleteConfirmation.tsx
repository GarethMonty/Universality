interface DataGridDeleteConfirmationProps {
  expectedText: string
  rowNumber: number
  value: string
  onCancel(): void
  onConfirm(): void
  onValueChange(value: string): void
}

export function DataGridDeleteConfirmation({
  expectedText,
  rowNumber,
  value,
  onCancel,
  onConfirm,
  onValueChange,
}: DataGridDeleteConfirmationProps) {
  const matches = value === expectedText

  return (
    <div className="data-grid-confirmation" role="dialog" aria-label="Confirm row delete">
      <div>
        <strong>Delete row {rowNumber}?</strong>
        <span>
          Type <code>{expectedText}</code> to execute a guarded delete.
        </span>
      </div>
      <input
        aria-label="Delete confirmation text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <button type="button" className="drawer-button" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="drawer-button drawer-button--danger"
        disabled={!matches}
        onClick={onConfirm}
      >
        Delete
      </button>
    </div>
  )
}
