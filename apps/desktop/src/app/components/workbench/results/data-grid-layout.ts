const DEFAULT_COLUMN_WIDTH = 160
const ROW_NUMBER_WIDTH = 48

export function computeRenderedColumnWidths(
  columns: string[],
  columnWidths: Record<number, number>,
  viewportWidth: number,
) {
  const baseWidths = columns.map((_column, index) => columnWidths[index] ?? DEFAULT_COLUMN_WIDTH)
  const baseColumnWidth = baseWidths.reduce((total, width) => total + width, 0)
  const availableColumnWidth = viewportWidth - ROW_NUMBER_WIDTH

  if (columns.length === 0 || viewportWidth <= 0 || availableColumnWidth <= baseColumnWidth) {
    return baseWidths
  }

  const extraWidth = availableColumnWidth - baseColumnWidth
  const extraPerColumn = Math.floor(extraWidth / columns.length)
  const remainder = extraWidth - extraPerColumn * columns.length

  return baseWidths.map((width, index) =>
    width + extraPerColumn + (index === columns.length - 1 ? remainder : 0),
  )
}
