import { useRef, useState } from 'react'
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
import type { WorkbenchMessage } from '../../state/app-state'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  HistoryIcon,
  WarningIcon,
} from './icons'
import { ResultsView } from './results/ResultsView'

const MIN_BOTTOM_PANEL_HEIGHT = 120
const MAX_BOTTOM_PANEL_HEIGHT = 900
const BUTTON_RESIZE_STEP = 96
const KEYBOARD_RESIZE_STEP = 24

interface BottomPanelProps {
  activeTab?: QueryTabState
  activeConnection?: ConnectionProfile
  activeEnvironment?: EnvironmentProfile
  activePanelTab: BottomPanelTab
  height: number
  activePayload?: ResultPayload
  activeRenderer?: string
  diagnostics?: DiagnosticsReport
  explorerInspection?: ExplorerInspectResponse
  lastExecution?: ExecutionResponse
  lastExecutionRequest?: ExecutionRequest
  capabilities: ExecutionCapabilities
  workbenchMessages: WorkbenchMessage[]
  onSelectPanelTab(tab: BottomPanelTab): void
  onSelectRenderer(renderer: string): void
  onLoadNextPage(): void
  onResize(nextHeight: number): void
  onClose(): void
  onConfirmExecution(guardrailId: string, mode: ExecutionRequest['mode']): void
  onRestoreHistory(queryText: string): void
  onDismissWorkbenchMessage(id: string): void
  onClearWorkbenchMessages(): void
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
  workbenchMessages,
  onSelectPanelTab,
  onSelectRenderer,
  onLoadNextPage,
  onResize,
  onClose,
  onConfirmExecution,
  onRestoreHistory,
  onDismissWorkbenchMessage,
  onClearWorkbenchMessages,
}: BottomPanelProps) {
  const hasQueryContext = Boolean(activeTab && activeConnection && activeEnvironment)
  const safePanelTab = hasQueryContext ? activePanelTab : 'messages'
  const messages = activeTab ? buildMessages(activeTab.result, activeTab, lastExecution) : []
  const [isResizing, setIsResizing] = useState(false)
  const isResizingRef = useRef(false)
  const lastPointerY = useRef(0)
  const draftHeight = useRef(height)

  const stopResizing = () => {
    isResizingRef.current = false
    setIsResizing(false)
  }

  return (
    <section
      className="bottom-panel"
      style={{ height }}
      aria-label="Bottom panel"
    >
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize bottom panel"
        aria-orientation="horizontal"
        aria-valuemin={MIN_BOTTOM_PANEL_HEIGHT}
        aria-valuemax={MAX_BOTTOM_PANEL_HEIGHT}
        aria-valuenow={height}
        className={`pane-resize-handle pane-resize-handle--bottom${isResizing ? ' is-active' : ''}`}
        title="Drag to resize the bottom results panel."
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          lastPointerY.current = event.clientY
          draftHeight.current = height
          isResizingRef.current = true
          setIsResizing(true)
        }}
        onPointerMove={(event) => {
          if (!isResizingRef.current) {
            return
          }

          const delta = lastPointerY.current - event.clientY
          lastPointerY.current = event.clientY
          draftHeight.current += delta
          onResize(draftHeight.current)
        }}
        onPointerUp={stopResizing}
        onPointerCancel={stopResizing}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            onResize(height + KEYBOARD_RESIZE_STEP)
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onResize(height - KEYBOARD_RESIZE_STEP)
          }
        }}
      />

      <div className="bottom-panel-header">
        <div className="bottom-panel-tabs" role="tablist" aria-label="Bottom panel tabs">
          {(['results', 'messages', 'details'] as const).map((item) => {
            const disabled = !hasQueryContext && item !== 'messages'

            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={safePanelTab === item}
                className={`bottom-panel-tab${safePanelTab === item ? ' is-active' : ''}`}
                disabled={disabled}
                title={
                  disabled
                    ? 'Open a query tab to use this panel.'
                    : `Show ${item} for the active query tab.`
                }
                onClick={() => onSelectPanelTab(item)}
              >
                {item}
              </button>
            )
          })}
        </div>

        <div className="bottom-panel-actions">
          <button
            type="button"
            className="bottom-panel-icon-button"
            aria-label="Increase panel height"
            title="Increase results panel height."
            onClick={() => onResize(height + BUTTON_RESIZE_STEP)}
          >
            <ChevronUpPseudo />
          </button>
          <button
            type="button"
            className="bottom-panel-icon-button"
            aria-label="Decrease panel height"
            title="Decrease results panel height."
            onClick={() => onResize(height - BUTTON_RESIZE_STEP)}
          >
            <ChevronDownIcon className="panel-inline-icon" />
          </button>
          <button
            type="button"
            className="bottom-panel-icon-button"
            aria-label="Hide bottom panel"
            title="Hide the bottom results panel."
            onClick={onClose}
          >
            <CloseIcon className="panel-inline-icon" />
          </button>
        </div>
      </div>

      <div className="bottom-panel-body">
        {safePanelTab === 'results' ? (
          <ResultsView
            capabilities={capabilities}
            payload={activePayload}
            renderer={activeRenderer}
            result={activeTab?.result}
            onSelectRenderer={onSelectRenderer}
            onLoadNextPage={onLoadNextPage}
          />
        ) : null}

        {safePanelTab === 'messages' ? (
          <MessagesView
            lastExecution={lastExecution}
            lastExecutionRequest={lastExecutionRequest}
            messages={messages}
            workbenchMessages={workbenchMessages}
            onConfirmExecution={onConfirmExecution}
            onDismissWorkbenchMessage={onDismissWorkbenchMessage}
            onClearWorkbenchMessages={onClearWorkbenchMessages}
          />
        ) : null}

        {safePanelTab === 'details' && activeTab && activeConnection && activeEnvironment ? (
          <DetailsView
            activeConnection={activeConnection}
            activeEnvironment={activeEnvironment}
            activeTab={activeTab}
            diagnostics={diagnostics}
            explorerInspection={explorerInspection}
            onRestoreHistory={onRestoreHistory}
          />
        ) : null}
      </div>
    </section>
  )
}

function MessagesView({
  lastExecution,
  lastExecutionRequest,
  messages,
  workbenchMessages,
  onConfirmExecution,
  onDismissWorkbenchMessage,
  onClearWorkbenchMessages,
}: {
  lastExecution?: ExecutionResponse
  lastExecutionRequest?: ExecutionRequest
  messages: string[]
  workbenchMessages: WorkbenchMessage[]
  onConfirmExecution(guardrailId: string, mode: ExecutionRequest['mode']): void
  onDismissWorkbenchMessage(id: string): void
  onClearWorkbenchMessages(): void
}) {
  const confirmationGuardrailId =
    lastExecution?.guardrail.status === 'confirm' ? lastExecution.guardrail.id : undefined
  const hasMessages = workbenchMessages.length > 0 || messages.length > 0

  return (
    <div className="panel-body-frame">
      <div className="panel-title-row">
        <div>
          <strong>Messages</strong>
          <p>Command errors, runtime notices, and query diagnostics.</p>
        </div>
        {workbenchMessages.length > 0 ? (
          <button
            type="button"
            className="drawer-button"
            aria-label="Clear all workbench messages"
            title="Clear all session-level workbench messages."
            onClick={onClearWorkbenchMessages}
          >
            Clear all
          </button>
        ) : null}
      </div>

      {!hasMessages && !confirmationGuardrailId ? (
        <div className="messages-empty">
          <WarningIcon className="empty-icon" />
          <p>No messages.</p>
        </div>
      ) : null}

      {workbenchMessages.length > 0 ? (
        <ul className="workbench-message-list" aria-label="Workbench Messages">
          {workbenchMessages.map((message) => (
            <li
              key={message.id}
              className={`workbench-message-row is-${message.severity}`}
              title={message.details ?? message.message}
            >
              <WarningIcon className="panel-inline-icon" />
              <div className="workbench-message-content">
                <strong>{message.message}</strong>
                <span>
                  {message.source} / {formatMessageTime(message.createdAt)}
                </span>
                {message.details ? <p>{message.details}</p> : null}
              </div>
              <button
                type="button"
                className="bottom-panel-icon-button"
                aria-label={`Clear message ${message.message}`}
                title="Clear this message from the session log."
                onClick={() => onDismissWorkbenchMessage(message.id)}
              >
                <CloseIcon className="panel-inline-icon" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {messages.length > 0 ? (
        <ul className="messages-list">
          {messages.map((message, index) => (
            <li key={`${message}-${index}`}>{message}</li>
          ))}
        </ul>
      ) : null}

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
  onRestoreHistory,
}: {
  activeConnection: ConnectionProfile
  activeEnvironment: EnvironmentProfile
  activeTab: QueryTabState
  diagnostics?: DiagnosticsReport
  explorerInspection?: ExplorerInspectResponse
  onRestoreHistory(queryText: string): void
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

      <div className="details-section">
        <strong>Query History</strong>
        {activeTab.history.length === 0 ? (
          <p>No query history for this tab.</p>
        ) : (
          <ul className="history-list">
            {activeTab.history.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="history-row"
                  aria-label={`Restore history query ${entry.status}`}
                  onClick={() => onRestoreHistory(entry.queryText)}
                >
                  <HistoryIcon className="panel-inline-icon" />
                  <span>{entry.status}</span>
                  <code>{entry.queryText}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
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

function formatMessageTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'now'
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function ChevronUpPseudo() {
  return <ChevronRightIcon className="panel-inline-icon panel-inline-icon--up" />
}
