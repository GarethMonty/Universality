import { useState } from 'react'
import type {
  ExecutionCapabilities,
  ExecutionResultEnvelope,
  ResultPayload,
} from '@universality/shared-types'
import { CopyIcon, DownloadIcon } from '../icons'
import { ResultPayloadView } from './ResultPayloadView'
import { copyText, exportPayload, payloadToText } from './payload-export'

interface ResultsViewProps {
  capabilities: ExecutionCapabilities
  payload?: ResultPayload
  renderer?: string
  result?: ExecutionResultEnvelope
  onSelectRenderer(renderer: string): void
  onLoadNextPage(): void
}

export function ResultsView({
  capabilities,
  payload,
  renderer,
  result,
  onSelectRenderer,
  onLoadNextPage,
}: ResultsViewProps) {
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

      <ResultPayloadView payload={payload} />

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
