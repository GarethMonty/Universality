interface KeyValueAddPanelProps {
  duplicate: boolean
  keyName: string
  value: string
  onCancel(): void
  onInsert(): void
  onKeyNameChange(value: string): void
  onValueChange(value: string): void
}

export function KeyValueAddPanel({
  duplicate,
  keyName,
  value,
  onCancel,
  onInsert,
  onKeyNameChange,
  onValueChange,
}: KeyValueAddPanelProps) {
  const disabled = keyName.trim().length === 0 || duplicate

  return (
    <div className="keyvalue-edit-panel">
      <div>
        <strong>Add key</strong>
        <span>{duplicate ? 'Key already exists.' : 'Create a string or JSON value.'}</span>
      </div>
      <input
        aria-label="New key name"
        value={keyName}
        onChange={(event) => onKeyNameChange(event.target.value)}
      />
      <input
        aria-label="New key value"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <button type="button" className="drawer-button" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="drawer-button drawer-button--primary"
        disabled={disabled}
        onClick={onInsert}
      >
        Add Key
      </button>
    </div>
  )
}

interface KeyValueTtlPanelProps {
  keyName: string
  seconds: string
  onCancel(): void
  onSecondsChange(value: string): void
  onSetTtl(): void
}

export function KeyValueTtlPanel({
  keyName,
  seconds,
  onCancel,
  onSecondsChange,
  onSetTtl,
}: KeyValueTtlPanelProps) {
  return (
    <div className="data-grid-confirmation">
      <div>
        <strong>Set TTL for {keyName}</strong>
        <span>Use positive seconds. Existing value is preserved.</span>
      </div>
      <input
        aria-label="TTL seconds"
        type="number"
        min={1}
        value={seconds}
        onChange={(event) => onSecondsChange(event.target.value)}
      />
      <button type="button" className="drawer-button" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="drawer-button drawer-button--primary"
        disabled={Number(seconds) <= 0}
        onClick={onSetTtl}
      >
        Set TTL
      </button>
    </div>
  )
}

interface KeyValueDeletePanelProps {
  confirmation: string
  expectedText: string
  keyName: string
  onCancel(): void
  onConfirm(): void
  onConfirmationChange(value: string): void
}

export function KeyValueDeletePanel({
  confirmation,
  expectedText,
  keyName,
  onCancel,
  onConfirm,
  onConfirmationChange,
}: KeyValueDeletePanelProps) {
  return (
    <div className="data-grid-confirmation">
      <div>
        <strong>Delete key {keyName}</strong>
        <span>Type {expectedText} to confirm.</span>
      </div>
      <input
        aria-label="Delete key confirmation text"
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
