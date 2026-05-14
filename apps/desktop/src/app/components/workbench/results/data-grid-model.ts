export const DEFAULT_COLUMN_WIDTH = 160
export const DATA_GRID_HEADER_HEIGHT = 30
export const ROW_NUMBER_WIDTH = 48

export interface GridSelection {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

export interface GridSort {
  column: number
  direction: 'asc' | 'desc'
}

export interface VisibleGridRow {
  row: string[]
  sourceIndex: number
}

export function buildVisibleGridRows(
  rows: string[][],
  filter: string,
  sort: GridSort | undefined,
): VisibleGridRow[] {
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
}

export function autoFitColumnWidth(
  column: number,
  columns: string[],
  visibleRows: VisibleGridRow[],
) {
  const headerWidth = columns[column]?.length ?? 0
  const sampleWidth = visibleRows.reduce(
    (max, item) => Math.max(max, (item.row[column] ?? '').length),
    headerWidth,
  )

  return Math.min(Math.max(sampleWidth * 8 + 36, 90), 420)
}

export function isSelected(row: number, column: number, selection: GridSelection | undefined) {
  if (!selection) {
    return false
  }

  const minRow = Math.min(selection.startRow, selection.endRow)
  const maxRow = Math.max(selection.startRow, selection.endRow)
  const minColumn = Math.min(selection.startColumn, selection.endColumn)
  const maxColumn = Math.max(selection.startColumn, selection.endColumn)

  return row >= minRow && row <= maxRow && column >= minColumn && column <= maxColumn
}

export function gridTextForMode(
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
