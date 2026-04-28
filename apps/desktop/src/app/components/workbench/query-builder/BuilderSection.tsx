import type { DragEvent, ReactNode } from 'react'
import { readFieldDragData } from '../results/field-drag'

interface BuilderSectionProps {
  actionLabel: string
  children: ReactNode
  dropHint?: string
  onAdd(): void
  onDropField?(field: string): void
  title: string
}

export function BuilderSection({
  actionLabel,
  children,
  dropHint,
  onAdd,
  onDropField,
  title,
}: BuilderSectionProps) {
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    const field = readFieldDragData(event)

    if (field) {
      onDropField(field)
    }
  }

  return (
    <section
      className="query-builder-section"
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="query-builder-section-header">
        <h3>{title}</h3>
        {dropHint ? <span className="query-builder-drop-hint">{dropHint}</span> : null}
        <button type="button" className="drawer-button" onClick={onAdd}>
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  )
}
