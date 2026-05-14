import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { computeRenderedColumnWidths } from './data-grid-layout'
import {
  autoFitColumnWidth,
  buildVisibleGridRows,
  DEFAULT_COLUMN_WIDTH,
  gridTextForMode,
  type GridSelection,
  type GridSort,
  isSelected,
  ROW_NUMBER_WIDTH,
} from './data-grid-model'
import { writeFieldDragData } from './field-drag'
import { copyText } from './payload-export'

interface DataGridViewProps {
  columns: string[]
  rows: string[][]
}

export function DataGridView({ columns, rows }: DataGridViewProps) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<GridSort>()
  const [focusedCell, setFocusedCell] = useState<{ row: number; column: number }>()
  const [selection, setSelection] = useState<GridSelection>()
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({})
  const [copyMessage, setCopyMessage] = useState('')
  const [viewportWidth, setViewportWidth] = useState(0)
  const parentRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ row: number; column: number } | null>(null)
  const resizeStartRef = useRef<{ column: number; x: number; width: number } | null>(null)

  const visibleRows = useMemo(() => buildVisibleGridRows(rows, filter, sort), [filter, rows, sort])

  // TanStack Virtual intentionally returns imperative helpers; keep this component un-memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    initialRect: { width: 800, height: 360 },
    estimateSize: () => 30,
    overscan: 16,
  })
  const renderedColumnWidths = useMemo(
    () => computeRenderedColumnWidths(columns, columnWidths, viewportWidth),
    [columns, columnWidths, viewportWidth],
  )
  const renderedGridWidth =
    ROW_NUMBER_WIDTH + renderedColumnWidths.reduce((total, width) => total + width, 0)
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
    setColumnWidths((current) => ({
      ...current,
      [column]: autoFitColumnWidth(column, columns, visibleRows),
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
                style={{ width: renderedColumnWidths[columnIndex] ?? DEFAULT_COLUMN_WIDTH }}
              >
                <button
                  type="button"
                  className="data-grid-header-button"
                  title={`Sort by ${column}`}
                  draggable
                  onClick={() => toggleSort(columnIndex)}
                  onDragStart={(event) => writeFieldDragData(event, column)}
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
                      style={{ width: renderedColumnWidths[columnIndex] ?? DEFAULT_COLUMN_WIDTH }}
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
