import type {
  BottomPanelTab,
  ConnectionProfile,
  DiagnosticsReport,
  EnvironmentProfile,
  ExecutionCapabilities,
  ExecutionRequest,
  ExecutionResponse,
  ExecutionResultEnvelope,
  ExplorerInspectResponse,
  QueryTabState,
  ResultPayload,
} from '@universality/shared-types'
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, WarningIcon } from './icons'

interface BottomPanelProps {
  activeTab: QueryTabState
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  activePanelTab: BottomPanelTab
  height: number
  activePayload?: ResultPayload
  activeRenderer?: string
  diagnostics?: DiagnosticsReport
  explorerInspection?: ExplorerInspectResponse
  lastExecution?: ExecutionResponse
  lastExecutionRequest?: ExecutionRequest
  capabilities: ExecutionCapabilities
  onSelectPanelTab(tab: BottomPanelTab): void
  onSelectRenderer(renderer: string): void
  onResize(delta: number): void
  onClose(): void
  onConfirmExecution(guardrailId: string, mode: ExecutionRequest['mode']): void
}

export function BottomPanel({
  activeTab,
  activeConnection,
  activeEnvironment,
  activePanelTab,
  height,
  activePayload,
  activeRenderer,
  diagnostics,
  explorerInspection,
  lastExecution,
  lastExecutionRequest,
  capabilities,
  onSelectPanelTab,
  onSelectRenderer,
  onResize,
  onClose,
  onConfirmExecution,
}: BottomPanelProps) {
  const messages = buildMessages(activeTab.result, activeTab, lastExecution)

  return (
    <section
      className="bottom-panel"
      style={{ height }}
      aria-label="Bottom panel"
    >
      <div className="bottom-panel-header">
        <div className="bottom-panel-tabs" role="tablist" aria-label="Bottom panel tabs">
          {(['results', 'messages', 'details'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={activePanelTab === item}
              className={`bottom-panel-tab${activePanelTab === item ? ' is-active' : ''}`}
              onClick={() => onSelectPanelTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="bottom-panel-actions">
          <button
            type="button"
            className="bottom-panel-icon-button"
            aria-label="Increase panel height"
            onClick={() => onResize(32)}
          >
            <ChevronUpPseudo />
          </button>
          <button
            type="button"
            className="bottom-panel-icon-button"
            aria-label="Decrease panel height"
            onClick={() => onResize(-32)}
          >
            <ChevronDownIcon className="panel-inline-icon" />
          </button>
          <button
            type="button"
            className="bottom-panel-icon-button"
            aria-label="Hide bottom panel"
            onClick={onClose}
          >
            <CloseIcon className="panel-inline-icon" />
          </button>
        </div>
      </div>

      <div className="bottom-panel-body">
        {activePanelTab === 'results' ? (
          <ResultsView
            capabilities={capabilities}
            payload={activePayload}
            renderer={activeRenderer}
            result={activeTab.result}
            onSelectRenderer={onSelectRenderer}
          />
        ) : null}

        {activePanelTab === 'messages' ? (
          <MessagesView
            lastExecution={lastExecution}
            lastExecutionRequest={lastExecutionRequest}
            messages={messages}
            onConfirmExecution={onConfirmExecution}
          />
        ) : null}

        {activePanelTab === 'details' ? (
          <DetailsView
            activeConnection={activeConnection}
            activeEnvironment={activeEnvironment}
            activeTab={activeTab}
            diagnostics={diagnostics}
            explorerInspection={explorerInspection}
          />
        ) : null}
      </div>
    </section>
  )
}

function ResultsView({
  capabilities,
  payload,
  renderer,
  result,
  onSelectRenderer,
}: {
  capabilities: ExecutionCapabilities
  payload?: ResultPayload
  renderer?: string
  result?: ExecutionResultEnvelope
  onSelectRenderer(renderer: string): void
}) {
  return (
    <div className="panel-body-frame">
      <div className="panel-title-row">
        <div>
          <strong>Results</strong>
          <p>{result?.summary ?? 'No results.'}</p>
        </div>
        <div className="renderer-switcher">
          {(result?.rendererModes ?? []).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`renderer-chip${renderer === mode ? ' is-active' : ''}`}
              onClick={() => onSelectRenderer(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <ResultView payload={payload} />

      {result?.truncated ? (
        <p className="panel-footnote">
          Result set truncated at {result.rowLimit ?? capabilities.defaultRowLimit} rows.
        </p>
      ) : null}
    </div>
  )
}

function MessagesView({
  lastExecution,
  lastExecutionRequest,
  messages,
  onConfirmExecution,
}: {
  lastExecution?: ExecutionResponse
  lastExecutionRequest?: ExecutionRequest
  messages: string[]
  onConfirmExecution(guardrailId: string, mode: ExecutionRequest['mode']): void
}) {
  const confirmationGuardrailId =
    lastExecution?.guardrail.status === 'confirm' ? lastExecution.guardrail.id : undefined

  return (
    <div className="panel-body-frame">
      <div className="panel-title-row">
        <div>
          <strong>Messages</strong>
          <p>Logs and adapter notices.</p>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="messages-empty">
          <WarningIcon className="empty-icon" />
          <p>No messages.</p>
        </div>
      ) : (
        <ul className="messages-list">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {confirmationGuardrailId ? (
        <div className="panel-confirmation">
          <div>
            <strong>Confirmation required</strong>
            <p>{lastExecution?.guardrail.reasons.join(' ')}</p>
            {lastExecution?.guardrail.requiredConfirmationText ? (
              <code>{lastExecution.guardrail.requiredConfirmationText}</code>
            ) : null}
          </div>
          <button
            type="button"
            className="drawer-button drawer-button--primary"
            onClick={() =>
              onConfirmExecution(
                confirmationGuardrailId,
                lastExecutionRequest?.mode ?? 'full',
              )
            }
          >
            Confirm and run
          </button>
        </div>
      ) : null}
    </div>
  )
}

function DetailsView({
  activeConnection,
  activeEnvironment,
  activeTab,
  diagnostics,
  explorerInspection,
}: {
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  activeTab: QueryTabState
  diagnostics?: DiagnosticsReport
  explorerInspection?: ExplorerInspectResponse
}) {
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
          {(activeTab.result?.notices.map((notice) => notice.message) ??
            ['Guardrail decisions will appear after query execution.']).map((message) => (
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

function ResultView({ payload }: { payload?: ResultPayload }) {
  if (!payload) {
    return <p className="panel-footnote">No result payload yet.</p>
  }

  if (payload.renderer === 'table') {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {payload.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row[0] ?? 'row'}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (payload.renderer === 'document') {
    return (
      <pre className="panel-code">
        <code>{JSON.stringify(payload.documents, null, 2)}</code>
      </pre>
    )
  }

  if (payload.renderer === 'keyvalue') {
    return (
      <div className="details-grid">
        {Object.entries(payload.entries).map(([key, value]) => (
          <DetailRow key={key} label={key} value={value} />
        ))}
      </div>
    )
  }

  if (payload.renderer === 'schema') {
    return (
      <div className="details-grid">
        {payload.items.map((item) => (
          <DetailRow key={item.label} label={item.label} value={item.detail} />
        ))}
      </div>
    )
  }

  return (
    <pre className="panel-code">
      <code>
        {payload.renderer === 'raw'
          ? payload.text
          : payload.renderer === 'json'
            ? JSON.stringify(payload.value, null, 2)
            : JSON.stringify(payload, null, 2)}
      </code>
    </pre>
  )
}

function buildMessages(
  result: ExecutionResultEnvelope | undefined,
  tab: QueryTabState,
  lastExecution: ExecutionResponse | undefined,
) {
  return [
    ...(tab.error ? [tab.error.message] : []),
    ...(result?.notices.map((notice) => notice.message) ?? []),
    ...(lastExecution?.diagnostics ?? []),
  ]
}

function ChevronUpPseudo() {
  return <ChevronRightIcon className="panel-inline-icon panel-inline-icon--up" />
}
