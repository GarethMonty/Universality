import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { copyText } from './payload-export'

const DEFAULT_COLUMN_WIDTH = 160
const ROW_NUMBER_WIDTH = 48

interface DataGridViewProps {
  columns: string[]
  rows: string[][]
}

interface GridSelection {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

export function DataGridView({ columns, rows }: DataGridViewProps) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<{ column: number; direction: 'asc' | 'desc' }>()
  const [focusedCell, setFocusedCell] = useState<{ row: number; column: number }>()
  const [selection, setSelection] = useState<GridSelection>()
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({})
  const [copyMessage, setCopyMessage] = useState('')
  const [viewportWidth, setViewportWidth] = useState(0)
  const parentRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ row: number; column: number } | null>(null)
  const resizeStartRef = useRef<{ column: number; x: number; width: number } | null>(null)

  const visibleRows = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase()
    const withSourceIndex = rows.map((row, index) => ({ row, sourceIndex: index }))
    const filtered = normalizedFilter
      ? withSourceIndex.filter(({ row }) =>
          row.some((cell) => cell.toLowerCase().includes(normalizedFilter)),
        )
      : withSourceIndex

    if (!sort) {
      return filtered
    }

    return [...filtered].sort((left, right) => {
      const leftValue = left.row[sort.column] ?? ''
      const rightValue = right.row[sort.column] ?? ''
      const result = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: 'base',
      })

      return sort.direction === 'asc' ? result : -result
    })
  }, [filter, rows, sort])

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    initialRect: { width: 800, height: 360 },
    estimateSize: () => 30,
    overscan: 16,
  })
  const gridWidth =
    ROW_NUMBER_WIDTH +
    columns.reduce(
      (total, _column, index) => total + (columnWidths[index] ?? DEFAULT_COLUMN_WIDTH),
      0,
    )
  const renderedGridWidth = Math.max(gridWidth, viewportWidth)
  const virtualItems = virtualizer.getVirtualItems()
  const renderedRows =
    virtualItems.length > 0
      ? virtualItems.map((item) => ({
          key: item.key,
          index: item.index,
          start: item.start,
        }))
      : visibleRows.map((_row, index) => ({
          key: index,
          index,
          start: index * 30,
        }))

  const toggleSort = (column: number) => {
    setSort((current) => {
      if (!current || current.column !== column) {
        return { column, direction: 'asc' }
      }

      if (current.direction === 'asc') {
        return { column, direction: 'desc' }
      }

      return undefined
    })
  }

  const autoFitColumn = (column: number) => {
    const headerWidth = columns[column]?.length ?? 0
    const sampleWidth = visibleRows.reduce(
      (max, item) => Math.max(max, (item.row[column] ?? '').length),
      headerWidth,
    )
    setColumnWidths((current) => ({
      ...current,
      [column]: Math.min(Math.max(sampleWidth * 8 + 36, 90), 420),
    }))
  }

  const beginResize = (column: number, x: number) => {
    resizeStartRef.current = {
      column,
      x,
      width: columnWidths[column] ?? DEFAULT_COLUMN_WIDTH,
    }
  }

  const updateResize = (x: number) => {
    const resize = resizeStartRef.current

    if (!resize) {
      return
    }

    setColumnWidths((current) => ({
      ...current,
      [resize.column]: Math.max(72, resize.width + x - resize.x),
    }))
  }

  const finishResize = () => {
    resizeStartRef.current = null
  }

  useEffect(() => {
    const parent = parentRef.current

    if (!parent) {
      return
    }

    const updateViewportWidth = () => setViewportWidth(parent.clientWidth)
    updateViewportWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportWidth)
      return () => window.removeEventListener('resize', updateViewportWidth)
    }

    const observer = new ResizeObserver(updateViewportWidth)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  const beginSelection = (row: number, column: number) => {
    dragStartRef.current = { row, column }
    setFocusedCell({ row, column })
    setSelection({ startRow: row, startColumn: column, endRow: row, endColumn: column })
  }

  const updateSelection = (row: number, column: number) => {
    const start = dragStartRef.current

    if (!start) {
      return
    }

    setSelection({
      startRow: start.row,
      startColumn: start.column,
      endRow: row,
      endColumn: column,
    })
  }

  const finishSelection = () => {
    dragStartRef.current = null
  }

  const copySelection = async (mode: 'selection' | 'row' | 'all') => {
    const text = gridTextForMode(mode, columns, visibleRows.map((item) => item.row), selection)

    if (!text) {
      return
    }

    await copyText(text)
    setCopyMessage(`Copied ${mode === 'all' ? 'all buffered rows' : mode}.`)
  }

  return (
    <div className="data-grid-shell">
      <div className="data-grid-toolbar">
        <label className="data-grid-filter">
          <span>Filter buffered rows</span>
          <input
            type="search"
            value={filter}
            placeholder="Find in results"
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <div className="data-grid-actions">
          <button
            type="button"
            className="drawer-button"
            disabled={!selection}
            onClick={() => void copySelection('selection')}
          >
            Copy Selection
          </button>
          <button
            type="button"
            className="drawer-button"
            disabled={!focusedCell}
            onClick={() => void copySelection('row')}
          >
            Copy Row
          </button>
          <button
            type="button"
            className="drawer-button"
            onClick={() => void copySelection('all')}
          >
            Copy All
          </button>
        </div>
      </div>
      <div className="data-grid-status">
        {visibleRows.length} of {rows.length} buffered row(s)
        {copyMessage ? ` / ${copyMessage}` : ''}
      </div>
      <div
        className="data-grid"
        ref={parentRef}
        onPointerMove={(event) => updateResize(event.clientX)}
        onPointerUp={() => {
          finishResize()
          finishSelection()
        }}
        onPointerLeave={finishSelection}
      >
        <div
          className="data-grid-inner"
          style={{ height: virtualizer.getTotalSize() + 32, width: renderedGridWidth }}
        >
          <div className="data-grid-row data-grid-row--header">
            <div className="data-grid-cell data-grid-cell--row-number">#</div>
            {columns.map((column, columnIndex) => (
              <div
                key={column}
                className="data-grid-cell data-grid-cell--header"
                style={{ width: columnWidths[columnIndex] ?? DEFAULT_COLUMN_WIDTH }}
              >
                <button
                  type="button"
                  className="data-grid-header-button"
                  title={`Sort by ${column}`}
                  onClick={() => toggleSort(columnIndex)}
                  onDoubleClick={() => autoFitColumn(columnIndex)}
                >
                  <span>{column}</span>
                  {sort?.column === columnIndex ? (
                    <span className="data-grid-sort">{sort.direction === 'asc' ? 'ASC' : 'DESC'}</span>
                  ) : null}
                </button>
                <span
                  className="data-grid-resizer"
                  role="separator"
                  aria-label={`Resize ${column}`}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    beginResize(columnIndex, event.clientX)
                  }}
                  onDoubleClick={() => autoFitColumn(columnIndex)}
                />
              </div>
            ))}
          </div>
          {renderedRows.map((virtualRow) => {
            const rowItem = visibleRows[virtualRow.index]
            const row = rowItem?.row ?? []

            return (
              <div
                key={virtualRow.key}
                className="data-grid-row"
                style={{ transform: `translateY(${virtualRow.start + 32}px)` }}
              >
                <div className="data-grid-cell data-grid-cell--row-number">
                  {rowItem ? rowItem.sourceIndex + 1 : ''}
                </div>
                {columns.map((column, columnIndex) => {
                  const cell = row[columnIndex] ?? ''
                  const selected = isSelected(virtualRow.index, columnIndex, selection)
                  const focused =
                    focusedCell?.row === virtualRow.index && focusedCell.column === columnIndex

                  return (
                    <button
                      key={`${virtualRow.key}-${column}`}
                      type="button"
                      className={`data-grid-cell data-grid-cell--value${selected ? ' is-selected' : ''}${focused ? ' is-focused' : ''}${cell === '' ? ' is-empty' : ''}`}
                      style={{ width: columnWidths[columnIndex] ?? DEFAULT_COLUMN_WIDTH }}
                      title={cell || 'NULL / empty'}
                      onPointerDown={() => beginSelection(virtualRow.index, columnIndex)}
                      onPointerEnter={() => updateSelection(virtualRow.index, columnIndex)}
                    >
                      {cell || <span className="data-grid-null">NULL</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function isSelected(row: number, column: number, selection: GridSelection | undefined) {
  if (!selection) {
    return false
  }

  const minRow = Math.min(selection.startRow, selection.endRow)
  const maxRow = Math.max(selection.startRow, selection.endRow)
  const minColumn = Math.min(selection.startColumn, selection.endColumn)
  const maxColumn = Math.max(selection.startColumn, selection.endColumn)

  return row >= minRow && row <= maxRow && column >= minColumn && column <= maxColumn
}

function gridTextForMode(
  mode: 'selection' | 'row' | 'all',
  columns: string[],
  rows: string[][],
  selection: GridSelection | undefined,
) {
  if (mode === 'all') {
    return [columns, ...rows].map((row) => row.join('\t')).join('\n')
  }

  if (mode === 'row') {
    if (!selection) {
      return ''
    }

    const rowIndex = selection.endRow
    return rows[rowIndex]?.join('\t') ?? ''
  }

  if (!selection) {
    return ''
  }

  const minRow = Math.min(selection.startRow, selection.endRow)
  const maxRow = Math.max(selection.startRow, selection.endRow)
  const minColumn = Math.min(selection.startColumn, selection.endColumn)
  const maxColumn = Math.max(selection.startColumn, selection.endColumn)

  return rows
    .slice(minRow, maxRow + 1)
    .map((row) => row.slice(minColumn, maxColumn + 1).join('\t'))
    .join('\n')
}
