import { useState } from 'react'

interface DataGridInsertRowProps {
  canInsert: boolean
  columns: string[]
  onInsert(values: string[]): Promise<boolean> | boolean
}

export function DataGridInsertRow({
  canInsert,
  columns,
  onInsert,
}: DataGridInsertRowProps) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<string[]>(() => emptyValues(columns.length))
  const [busy, setBusy] = useState(false)

  if (!canInsert) {
    return null
  }

  const updateValue = (index: number, value: string) => {
    setValues((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))
  }

  const submit = async () => {
    const nextValues = columns.map((_column, index) => values[index] ?? '')
    setBusy(true)
    try {
      const inserted = await onInsert(nextValues)
      if (inserted) {
        setOpen(false)
        setValues(emptyValues(columns.length))
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="data-grid-insert data-grid-insert--closed">
        <button type="button" className="drawer-button" onClick={() => setOpen(true)}>
          Add Row
        </button>
      </div>
    )
  }

  return (
    <section className="data-grid-insert" aria-label="Insert SQL row">
      <div className="data-grid-insert-fields">
        {columns.map((column, index) => (
          <label key={column} className="data-grid-insert-field">
            <span>{column}</span>
            <input
              aria-label={`Insert ${column}`}
              value={values[index] ?? ''}
              placeholder="leave empty for default"
              onChange={(event) => updateValue(index, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="data-grid-insert-actions">
        <button
          type="button"
          className="drawer-button"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setValues(emptyValues(columns.length))
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="drawer-button drawer-button--primary"
          disabled={busy || values.every((value) => value.trim() === '')}
          onClick={() => void submit()}
        >
          Insert
        </button>
      </div>
    </section>
  )
}

function emptyValues(length: number) {
  return Array.from({ length }, () => '')
}
