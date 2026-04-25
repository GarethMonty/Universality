import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
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
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  HistoryIcon,
  WarningIcon,
} from './icons'

const MIN_BOTTOM_PANEL_HEIGHT = 120
const MAX_BOTTOM_PANEL_HEIGHT = 900
const BUTTON_RESIZE_STEP = 96
const KEYBOARD_RESIZE_STEP = 24

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
  onLoadNextPage(): void
  onResize(nextHeight: number): void
  onClose(): void
  onConfirmExecution(guardrailId: string, mode: ExecutionRequest['mode']): void
  onRestoreHistory(queryText: string): void
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
  onLoadNextPage,
  onResize,
  onClose,
  onConfirmExecution,
  onRestoreHistory,
}: BottomPanelProps) {
  const messages = buildMessages(activeTab.result, activeTab, lastExecution)
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
          {(['results', 'messages', 'details'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={activePanelTab === item}
            className={`bottom-panel-tab${activePanelTab === item ? ' is-active' : ''}`}
            title={`Show ${item} for the active query tab.`}
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
        {activePanelTab === 'results' ? (
          <ResultsView
            capabilities={capabilities}
            payload={activePayload}
            renderer={activeRenderer}
            result={activeTab.result}
            onSelectRenderer={onSelectRenderer}
            onLoadNextPage={onLoadNextPage}
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
            onRestoreHistory={onRestoreHistory}
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
  onLoadNextPage,
}: {
  capabilities: ExecutionCapabilities
  payload?: ResultPayload
  renderer?: string
  result?: ExecutionResultEnvelope
  onSelectRenderer(renderer: string): void
  onLoadNextPage(): void
}) {
  const [operationMessage, setOperationMessage] = useState('')

  const copyResult = async () => {
    if (!payload) {
      return
    }

    try {
      await copyText(payloadToText(payload))
      setOperationMessage('Result copied to clipboard.')
    } catch {
      setOperationMessage('Unable to copy result to clipboard.')
    }
  }

  const exportResult = () => {
    if (!payload) {
      return
    }

    exportPayload(payload, result)
    setOperationMessage('Result export prepared.')
  }

  return (
    <div className="panel-body-frame panel-body-frame--results">
      <div className="panel-title-row">
        <div>
          <strong>Results</strong>
          <p>{result?.summary ?? 'No results.'}</p>
        </div>
        <div className="panel-title-actions">
          <div className="renderer-switcher">
            {(result?.rendererModes ?? []).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`renderer-chip${renderer === mode ? ' is-active' : ''}`}
                title={`Render this result as ${mode}.`}
                onClick={() => onSelectRenderer(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bottom-panel-icon-button"
            aria-label="Copy result"
            disabled={!payload}
            title="Copy the currently buffered result payload to the clipboard."
            onClick={() => void copyResult()}
          >
            <CopyIcon className="panel-inline-icon" />
          </button>
          <button
            type="button"
            className="bottom-panel-icon-button"
            aria-label="Export result"
            disabled={!payload}
            title="Export the currently buffered result payload, not the entire remote result set."
            onClick={exportResult}
          >
            <DownloadIcon className="panel-inline-icon" />
          </button>
        </div>
      </div>

      <ResultView payload={payload} />

      {result?.pageInfo?.hasMore ? (
        <div className="panel-page-row">
          <span>
            Showing {result.pageInfo.bufferedRows} buffered item(s). Copy/export uses the buffered result only.
          </span>
          <button
            type="button"
            className="drawer-button"
            title="Fetch the next bounded page of results and append it to the buffered view."
            onClick={onLoadNextPage}
          >
            Load next page
          </button>
        </div>
      ) : null}

      {result?.truncated && !result.pageInfo?.hasMore ? (
        <p className="panel-footnote">
          Result set truncated at {result.rowLimit ?? capabilities.defaultRowLimit} rows.
        </p>
      ) : null}

      {operationMessage ? <p className="panel-footnote">{operationMessage}</p> : null}
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

function ResultView({ payload }: { payload?: ResultPayload }) {
  if (!payload) {
    return <p className="panel-footnote">No result payload yet.</p>
  }

  if (payload.renderer === 'table') {
    return <VirtualizedTable columns={payload.columns} rows={payload.rows} />
  }

  if (payload.renderer === 'document') {
    return <VirtualizedDocumentList documents={payload.documents} />
  }

  if (payload.renderer === 'keyvalue') {
    return <VirtualizedKeyValueList entries={payload.entries} />
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

function VirtualizedTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 12,
  })
  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div className="virtual-table" ref={parentRef}>
      <div className="virtual-table-inner" style={{ height: virtualizer.getTotalSize() + 32 }}>
        <div className="virtual-table-row virtual-table-row--header">
          {columns.map((column) => (
            <div key={column} className="virtual-table-cell">
              {column}
            </div>
          ))}
        </div>
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index] ?? []

          return (
            <div
              key={virtualRow.key}
              className="virtual-table-row"
              style={{ transform: `translateY(${virtualRow.start + 32}px)` }}
            >
              {columns.map((column, cellIndex) => (
                <div key={`${virtualRow.key}-${column}`} className="virtual-table-cell">
                  {row[cellIndex] ?? ''}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VirtualizedDocumentList({
  documents,
}: {
  documents: Array<Record<string, unknown>>
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: documents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 6,
  })

  return (
    <div className="virtual-list" ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <pre
            key={virtualRow.key}
            className="virtual-document"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <code>{JSON.stringify(documents[virtualRow.index], null, 2)}</code>
          </pre>
        ))}
      </div>
    </div>
  )
}

function VirtualizedKeyValueList({ entries }: { entries: Record<string, string> }) {
  const items = Object.entries(entries)
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 10,
  })

  return (
    <div className="virtual-list" ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const [key, value] = items[virtualRow.index] ?? ['', '']

          return (
            <div
              key={virtualRow.key}
              className="virtual-kv-row"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          )
        })}
      </div>
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

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function exportPayload(payload: ResultPayload, result?: ExecutionResultEnvelope) {
  const serialized = payloadToText(payload)
  const { extension, mimeType } = exportDetailsForPayload(payload)
  const filename = sanitizeFilename(
    `${result?.engine ?? 'universality'}-${payload.renderer}-${result?.executedAt ?? 'result'}.${extension}`,
  )
  const blob = new Blob([serialized], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function payloadToText(payload: ResultPayload) {
  if (payload.renderer === 'table') {
    return tableToCsv(payload.columns, payload.rows)
  }

  if (payload.renderer === 'raw') {
    return payload.text
  }

  if (payload.renderer === 'document') {
    return JSON.stringify(payload.documents, null, 2)
  }

  if (payload.renderer === 'json') {
    return JSON.stringify(payload.value, null, 2)
  }

  if (payload.renderer === 'keyvalue') {
    return JSON.stringify(
      {
        entries: payload.entries,
        ttl: payload.ttl,
        memoryUsage: payload.memoryUsage,
      },
      null,
      2,
    )
  }

  if (payload.renderer === 'schema') {
    return JSON.stringify(payload.items, null, 2)
  }

  return JSON.stringify(payload, null, 2)
}

function tableToCsv(columns: string[], rows: string[][]) {
  return [columns, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(','))
    .join('\n')
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

function exportDetailsForPayload(payload: ResultPayload) {
  if (payload.renderer === 'table') {
    return { extension: 'csv', mimeType: 'text/csv;charset=utf-8' }
  }

  if (payload.renderer === 'raw') {
    return { extension: 'txt', mimeType: 'text/plain;charset=utf-8' }
  }

  return { extension: 'json', mimeType: 'application/json;charset=utf-8' }
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-')
}

function ChevronUpPseudo() {
  return <ChevronRightIcon className="panel-inline-icon panel-inline-icon--up" />
}
