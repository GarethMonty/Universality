export function BootSurface({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="boot-surface">
      <div className="boot-dialog">
        <p className="sidebar-eyebrow">Desktop Workbench</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
    </div>
  )
}

export function WelcomeSurface({
  onCreateConnection,
  onImportWorkspace,
  onOpenDiagnostics,
}: {
  onCreateConnection(): void
  onImportWorkspace(): void
  onOpenDiagnostics(): void
}) {
  return (
    <section className="welcome-surface" aria-label="First run onboarding">
      <div className="welcome-panel">
        <p className="sidebar-eyebrow">Datanaut Desktop</p>
        <h1>Connect to your first datastore.</h1>
        <p>
          Start with a real connection. Datanaut will keep credentials in the
          desktop secret store and keep this workspace local to your machine.
        </p>
        <div className="welcome-actions">
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            onClick={onCreateConnection}
          >
            New Connection
          </button>
          <button type="button" className="drawer-button" onClick={onImportWorkspace}>
            Import Workspace
          </button>
          <button type="button" className="drawer-button" onClick={onOpenDiagnostics}>
            Open Diagnostics
          </button>
        </div>
      </div>
    </section>
  )
}
