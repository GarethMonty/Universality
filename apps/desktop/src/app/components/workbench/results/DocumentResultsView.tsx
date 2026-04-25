import { useMemo, useState } from 'react'
import { JsonTreeView } from './JsonTreeView'
import { copyText } from './payload-export'

interface DocumentResultsViewProps {
  documents: Array<Record<string, unknown>>
}

export function DocumentResultsView({ documents }: DocumentResultsViewProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [expandedVersion, setExpandedVersion] = useState(0)
  const [expandAll, setExpandAll] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const activeDocument = documents[activeIndex] ?? documents[0]
  const activeLabel = activeDocument ? documentLabel(activeDocument, activeIndex) : 'No document'

  const documentSummaries = useMemo(
    () =>
      documents.map((document, index) => ({
        key: documentKey(document, index),
        label: documentLabel(document, index),
        detail: documentSummary(document),
      })),
    [documents],
  )

  const copyDocument = async () => {
    if (!activeDocument) {
      return
    }

    await copyText(JSON.stringify(activeDocument, null, 2))
    setCopyMessage('Copied document JSON.')
  }

  const copyPath = async (path: string) => {
    await copyText(path)
    setCopyMessage(`Copied ${path}.`)
  }

  const copyValue = async (value: unknown) => {
    await copyText(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    setCopyMessage('Copied value.')
  }

  if (documents.length === 0) {
    return <p className="panel-footnote">No documents returned.</p>
  }

  return (
    <div className="document-results" aria-label="Document results">
      <aside className="document-results-list" aria-label="Returned documents">
        {documentSummaries.map((document, index) => (
          <button
            key={document.key}
            type="button"
            className={`document-result-item${index === activeIndex ? ' is-active' : ''}`}
            onClick={() => setActiveIndex(index)}
          >
            <span>{index + 1}</span>
            <strong>{document.label}</strong>
            <em>{document.detail}</em>
          </button>
        ))}
      </aside>
      <section className="document-results-detail" aria-label="Document tree">
        <div className="document-results-toolbar">
          <div>
            <strong>{activeLabel}</strong>
            <span>{documentSummary(activeDocument)}</span>
          </div>
          <div className="data-grid-actions">
            <button
              type="button"
              className="drawer-button"
              onClick={() => {
                setExpandAll(true)
                setExpandedVersion((value) => value + 1)
              }}
            >
              Expand All
            </button>
            <button
              type="button"
              className="drawer-button"
              onClick={() => {
                setExpandAll(false)
                setExpandedVersion((value) => value + 1)
              }}
            >
              Collapse All
            </button>
            <button type="button" className="drawer-button" onClick={() => void copyDocument()}>
              Copy Document
            </button>
          </div>
        </div>
        <div className="json-tree-list">
          <JsonTreeView
            key={`${documentSummaries[activeIndex]?.key ?? 'document'}-${expandedVersion}`}
            value={activeDocument}
            label={activeLabel}
            defaultExpandAll={expandAll}
            onCopyPath={copyPath}
            onCopyValue={copyValue}
          />
        </div>
        {copyMessage ? <p className="panel-footnote">{copyMessage}</p> : null}
      </section>
    </div>
  )
}

function documentKey(document: Record<string, unknown>, index: number) {
  const id = document.id ?? document._id

  if (typeof id === 'string' || typeof id === 'number') {
    return String(id)
  }

  return `document-${index}`
}

function documentLabel(document: Record<string, unknown>, index: number) {
  const id = document._id ?? document.id
  const name = document.name ?? document.title ?? document.sku

  if (typeof name === 'string' && name.trim()) {
    return name
  }

  if (typeof id === 'string' || typeof id === 'number') {
    return String(id)
  }

  return `document ${index + 1}`
}

function documentSummary(document: Record<string, unknown> | undefined) {
  if (!document) {
    return '0 field(s)'
  }

  return `${Object.keys(document).length} field(s)`
}
