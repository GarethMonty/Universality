interface SearchDocumentEditorPanelProps {
  error?: string
  mode: 'index' | 'update'
  sourceText: string
  onCancel(): void
  onSourceTextChange(value: string): void
  onSubmit(): void
}

export function SearchDocumentEditorPanel({
  error,
  mode,
  sourceText,
  onCancel,
  onSourceTextChange,
  onSubmit,
}: SearchDocumentEditorPanelProps) {
  const actionLabel = mode === 'index' ? 'Index' : 'Update'

  return (
    <div className="search-hit-editor">
      <div>
        <strong>{mode === 'index' ? 'Index search document' : 'Update search document source'}</strong>
        <span>
          {mode === 'index'
            ? 'Provide a JSON object. Datanaut sends it as the full document source.'
            : 'Edit top-level JSON fields. Datanaut sends a partial document update.'}
        </span>
      </div>
      <textarea
        aria-label="Search document source JSON"
        value={sourceText}
        onChange={(event) => onSourceTextChange(event.target.value)}
      />
      {error ? <span className="drawer-error">{error}</span> : null}
      <div className="search-hit-editor-actions">
        <button type="button" className="drawer-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="drawer-button drawer-button--primary" onClick={onSubmit}>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

interface SearchDocumentIndexPanelProps {
  documentId: string
  index: string
  indexMissing: boolean
  onCancel(): void
  onDocumentIdChange(value: string): void
  onOpenEditor(): void
}

export function SearchDocumentIndexPanel({
  documentId,
  index,
  indexMissing,
  onCancel,
  onDocumentIdChange,
  onOpenEditor,
}: SearchDocumentIndexPanelProps) {
  const disabled = indexMissing || documentId.trim().length === 0

  return (
    <div className="search-hit-add-panel">
      <div>
        <strong>Add document</strong>
        <span>{indexMissing ? 'Run an index-scoped query first.' : `Target index: ${index}`}</span>
      </div>
      <input
        aria-label="Search document id"
        value={documentId}
        onChange={(event) => onDocumentIdChange(event.target.value)}
      />
      <button type="button" className="drawer-button" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="drawer-button drawer-button--primary"
        disabled={disabled}
        onClick={onOpenEditor}
      >
        Add Document
      </button>
    </div>
  )
}

interface SearchDocumentDeletePanelProps {
  confirmation: string
  expectedText: string
  onCancel(): void
  onConfirm(): void
  onConfirmationChange(value: string): void
}

export function SearchDocumentDeletePanel({
  confirmation,
  expectedText,
  onCancel,
  onConfirm,
  onConfirmationChange,
}: SearchDocumentDeletePanelProps) {
  return (
    <div className="data-grid-confirmation">
      <div>
        <strong>Delete search document</strong>
        <span>Type {expectedText} to confirm.</span>
      </div>
      <input
        aria-label="Delete search document confirmation text"
        value={confirmation}
        onChange={(event) => onConfirmationChange(event.target.value)}
      />
      <button type="button" className="drawer-button" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="drawer-button drawer-button--primary"
        disabled={confirmation !== expectedText}
        onClick={onConfirm}
      >
        Delete
      </button>
    </div>
  )
}
