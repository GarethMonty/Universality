interface DataGridToolbarProps {
  canCopyRow: boolean
  canCopySelection: boolean
  filter: string
  onCopyAll(): void
  onCopyRow(): void
  onCopySelection(): void
  onFilterChange(value: string): void
}

export function DataGridToolbar({
  canCopyRow,
  canCopySelection,
  filter,
  onCopyAll,
  onCopyRow,
  onCopySelection,
  onFilterChange,
}: DataGridToolbarProps) {
  return (
    <div className="data-grid-toolbar">
      <label className="data-grid-filter">
        <span>Filter buffered rows</span>
        <input
          type="search"
          value={filter}
          placeholder="Find in results"
          onChange={(event) => onFilterChange(event.target.value)}
        />
      </label>
      <div className="data-grid-actions">
        <button
          type="button"
          className="drawer-button"
          disabled={!canCopySelection}
          onClick={onCopySelection}
        >
          Copy Selection
        </button>
        <button
          type="button"
          className="drawer-button"
          disabled={!canCopyRow}
          onClick={onCopyRow}
        >
          Copy Row
        </button>
        <button type="button" className="drawer-button" onClick={onCopyAll}>
          Copy All
        </button>
      </div>
    </div>
  )
}
