import type { DragEvent } from 'react'

export const FIELD_DRAG_MIME = 'application/x-universality-field'
let lastDraggedFieldPath = ''

export function writeFieldDragData(event: DragEvent<HTMLElement>, fieldPath: string) {
  if (!fieldPath.trim()) {
    return
  }

  lastDraggedFieldPath = fieldPath
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(FIELD_DRAG_MIME, fieldPath)
  event.dataTransfer.setData('text/plain', fieldPath)
  event.dataTransfer.setData('text', fieldPath)
}

export function readFieldDragData(event: DragEvent<HTMLElement>) {
  return (
    event.dataTransfer.getData(FIELD_DRAG_MIME) ||
    event.dataTransfer.getData('text/plain') ||
    lastDraggedFieldPath
  ).trim()
}
