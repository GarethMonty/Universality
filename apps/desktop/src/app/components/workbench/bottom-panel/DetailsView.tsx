import type {
  ConnectionProfile,
  DiagnosticsReport,
  EnvironmentProfile,
  ExplorerInspectResponse,
  QueryTabState,
} from '@datapadplusplus/shared-types'

interface DetailsViewProps {
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  activeTab: QueryTabState
  diagnostics?: DiagnosticsReport
  explorerInspection?: ExplorerInspectResponse
}

export function DetailsView({
  activeConnection,
  activeEnvironment,
  activeTab,
  diagnostics,
  explorerInspection,
}: DetailsViewProps) {
  return (
    <div className="panel-body-frame">
      <div className="panel-title-row">
        <div>
          <strong>Details</strong>
        </div>
      </div>

      <div className="details-grid">
        <DetailRow label="Connection" value={activeConnection.name} />
        <DetailRow label="Environment" value={activeEnvironment.label} />
        <DetailRow label="Database" value={activeConnection.database ?? 'n/a'} />
        <DetailRow label="Editor" value={activeTab.editorLabel} />
        <DetailRow label="Last Run" value={activeTab.lastRunAt ?? 'Never'} />
        <DetailRow label="Runtime" value={diagnostics?.runtime ?? 'desktop'} />
      </div>

      <div className="details-section">
        <strong>Guardrails</strong>
        <ul className="messages-list">
          {(activeTab.result?.notices.map((notice) => notice.message) ?? [
            'Guardrail decisions will appear after query execution.',
          ]).map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>

      <div className="details-section">
        <strong>Inspection</strong>
        <p>{explorerInspection?.summary ?? 'No object selected.'}</p>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
