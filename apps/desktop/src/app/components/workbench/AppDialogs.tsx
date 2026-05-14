import type { ConnectionProfile, QueryTabState } from '@datanaut/shared-types'

export function CloseSavedTabDialog({
  tab,
  onCancel,
  onDiscard,
  onSaveAndClose,
}: {
  tab: QueryTabState
  onCancel(): void
  onDiscard(): void
  onSaveAndClose(): void
}) {
  return (
    <div className="workbench-modal-overlay" role="presentation">
      <section
        className="workbench-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-tab-dialog-title"
      >
        <p className="sidebar-eyebrow">Unsaved Saved Query</p>
        <h2 id="close-tab-dialog-title">Save changes before closing?</h2>
        <p>
          {tab.title} has edits that are not saved to its saved query. Ephemeral
          tabs close immediately, but saved work needs an explicit choice.
        </p>
        <div className="workbench-dialog-actions">
          <button type="button" className="drawer-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="drawer-button" onClick={onDiscard}>
            Discard Changes
          </button>
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            onClick={onSaveAndClose}
          >
            Save and Close
          </button>
        </div>
      </section>
    </div>
  )
}

export function DeleteConnectionDialog({
  connection,
  onCancel,
  onConfirm,
}: {
  connection: ConnectionProfile
  onCancel(): void
  onConfirm(): void
}) {
  return (
    <div className="workbench-modal-overlay" role="presentation">
      <section
        className="workbench-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-connection-dialog-title"
      >
        <p className="sidebar-eyebrow">Delete Connection</p>
        <h2 id="delete-connection-dialog-title">Remove {connection.name}?</h2>
        <p>
          This removes the local connection profile from this workspace. Secrets
          referenced by the profile are not shown or exported by this action.
        </p>
        <div className="workbench-dialog-actions">
          <button type="button" className="drawer-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="drawer-button drawer-button--danger"
            onClick={onConfirm}
          >
            Delete Connection
          </button>
        </div>
      </section>
    </div>
  )
}
