import type { QueryTabState } from '@universality/shared-types'
import { HistoryIcon } from '../icons'

interface HistoryViewProps {
  activeTab: QueryTabState
  onRestoreHistory(queryText: string): void
}

export function HistoryView({ activeTab, onRestoreHistory }: HistoryViewProps) {
  return (
    <div className="panel-body-frame">
      <div className="panel-title-row">
        <div>
          <strong>Query History</strong>
          <p>Restore previous query text for the active tab.</p>
        </div>
      </div>

      {activeTab.history.length === 0 ? (
        <p className="panel-footnote">No query history for this tab.</p>
      ) : (
        <ul className="history-list">
          {activeTab.history.slice(0, 24).map((entry) => (
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
  )
}
