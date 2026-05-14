import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { readFieldDragPayload, type FieldDragPayload } from '../results/field-drag'

interface BuilderSectionProps {
  actionLabel: string
  children: ReactNode
  dropHint?: string
  onAdd(): void
  onDropField?(field: string, payload: FieldDragPayload): void
  secondaryActionLabel?: string
  onSecondaryAdd?(): void
  title: string
}

export function BuilderSection({
  actionLabel,
  children,
  dropHint,
  onAdd,
  onDropField,
  onSecondaryAdd,
  secondaryActionLabel,
  title,
}: BuilderSectionProps) {
  const [dragActive, setDragActive] = useState(false)

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive((current) => current || true)
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    const nextTarget = event.relatedTarget

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    setDragActive(false)
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const payload = readFieldDragPayload(event)
    const field = payload?.fieldPath

    if (field && payload) {
      onDropField(field, payload)
    }
  }

  return (
    <section
      className={`query-builder-section${dragActive ? ' is-drag-over' : ''}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="query-builder-section-header">
        <h3>{title}</h3>
        {dropHint ? <span className="query-builder-drop-hint">{dropHint}</span> : null}
        {secondaryActionLabel && onSecondaryAdd ? (
          <button type="button" className="drawer-button" onClick={onSecondaryAdd}>
            {secondaryActionLabel}
          </button>
        ) : null}
        <button type="button" className="drawer-button" onClick={onAdd}>
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  )
}
