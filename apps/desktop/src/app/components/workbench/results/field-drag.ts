import type { DragEvent } from 'react'

export const FIELD_DRAG_MIME = 'application/x-datanaut-field'
export const FIELD_DRAG_PAYLOAD_MIME = 'application/x-datanaut-field-payload'
export interface FieldDragPayload {
  fieldPath: string
  value?: unknown
  valueLabel?: string
  valueType?: string
}

let lastDraggedFieldPath = ''
let lastDraggedPayload: FieldDragPayload | undefined

export function writeFieldDragData(
  event: DragEvent<HTMLElement>,
  fieldPath: string,
  payload: Omit<FieldDragPayload, 'fieldPath'> = {},
) {
  const trimmedFieldPath = fieldPath.trim()

  if (!trimmedFieldPath) {
    return
  }

  const nextPayload: FieldDragPayload = {
    fieldPath: trimmedFieldPath,
    ...payload,
  }

  lastDraggedFieldPath = trimmedFieldPath
  lastDraggedPayload = nextPayload
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(FIELD_DRAG_MIME, trimmedFieldPath)
  event.dataTransfer.setData(FIELD_DRAG_PAYLOAD_MIME, JSON.stringify(nextPayload))
  event.dataTransfer.setData('text/plain', trimmedFieldPath)
  event.dataTransfer.setData('text', trimmedFieldPath)
}

export function readFieldDragData(event: DragEvent<HTMLElement>) {
  return readFieldDragPayload(event)?.fieldPath ?? (
    event.dataTransfer.getData(FIELD_DRAG_MIME) ||
    event.dataTransfer.getData('text/plain') ||
    lastDraggedFieldPath
  ).trim()
}

export function readFieldDragPayload(event: DragEvent<HTMLElement>): FieldDragPayload | undefined {
  const rawPayload = event.dataTransfer.getData(FIELD_DRAG_PAYLOAD_MIME)

  if (rawPayload) {
    try {
      const parsed = JSON.parse(rawPayload) as FieldDragPayload
      const fieldPath = typeof parsed.fieldPath === 'string' ? parsed.fieldPath.trim() : ''

      if (fieldPath) {
        return { ...parsed, fieldPath }
      }
    } catch {
      // Fall through to field-only payloads from older drag sources.
    }
  }

  const rawFieldPath =
    event.dataTransfer.getData(FIELD_DRAG_MIME) ||
    event.dataTransfer.getData('text/plain')
  const fieldPath = (rawFieldPath || lastDraggedFieldPath).trim()

  if (!fieldPath) {
    return undefined
  }

  return lastDraggedPayload?.fieldPath === fieldPath ? lastDraggedPayload : { fieldPath }
}
