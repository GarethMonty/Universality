import { fireEvent, render, screen } from '@testing-library/react'
import type { ConnectionProfile, ExecutionResultEnvelope } from '@universality/shared-types'
import { describe, expect, it, vi } from 'vitest'
import { ResultsView } from './ResultsView'

describe('ResultsView', () => {
  it('paginates document results with a default page size of 20', () => {
    const documents = Array.from({ length: 25 }, (_item, index) => ({
      _id: `document-${index + 1}`,
      status: 'active',
    }))
    const result = resultEnvelope(documents)

    render(
      <ResultsView
        capabilities={{
          canCancel: false,
          canExplain: false,
          defaultRowLimit: 200,
          editorLanguage: 'mongodb',
          supportsLiveMetadata: true,
        }}
        connection={connectionProfile({ family: 'document', engine: 'mongodb' })}
        payload={result.payloads[0]}
        renderer="document"
        result={result}
        onLoadNextPage={vi.fn()}
        onSelectRenderer={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Page size')).toHaveValue('20')
    expect(screen.getByText('1-20 of 25')).toBeInTheDocument()
    expect(screen.getByText('document-1')).toBeInTheDocument()
    expect(screen.queryByText('document-21')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('21-25 of 25')).toBeInTheDocument()
    expect(screen.getByText('document-21')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Page size'), {
      target: { value: '10' },
    })

    expect(screen.getByText('1-10 of 25')).toBeInTheDocument()
  })

  it('does not locally paginate non-document table results', () => {
    const rows = Array.from({ length: 25 }, (_item, index) => [
      `account-${index + 1}`,
      index % 2 === 0 ? 'active' : 'inactive',
    ])
    const result: ExecutionResultEnvelope = {
      id: 'result-table',
      engine: 'postgresql',
      summary: '25 row(s) returned from PostgreSQL.',
      defaultRenderer: 'table',
      rendererModes: ['table', 'json', 'raw'],
      payloads: [
        {
          renderer: 'table',
          columns: ['id', 'status'],
          rows,
        },
      ],
      notices: [],
      executedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 14,
    }

    render(
      <ResultsView
        capabilities={{
          canCancel: false,
          canExplain: false,
          defaultRowLimit: 200,
          editorLanguage: 'sql',
          supportsLiveMetadata: true,
        }}
        connection={connectionProfile({ family: 'sql', engine: 'postgresql' })}
        payload={result.payloads[0]}
        renderer="table"
        result={result}
        onLoadNextPage={vi.fn()}
        onSelectRenderer={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Page size')).not.toBeInTheDocument()
    expect(screen.queryByText('1-20 of 25')).not.toBeInTheDocument()
    expect(screen.getByText('account-1')).toBeInTheDocument()
    expect(screen.getByText('account-25')).toBeInTheDocument()
  })
})

function resultEnvelope(documents: Array<Record<string, unknown>>): ExecutionResultEnvelope {
  return {
    id: 'result-documents',
    engine: 'mongodb',
    summary: `${documents.length} documents returned from MongoDB adapter preview.`,
    defaultRenderer: 'document',
    rendererModes: ['document', 'json', 'raw'],
    payloads: [
      {
        renderer: 'document',
        documents,
      },
    ],
    notices: [],
    executedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 12,
  }
}

function connectionProfile({
  engine,
  family,
}: {
  engine: ConnectionProfile['engine']
  family: ConnectionProfile['family']
}): ConnectionProfile {
  return {
    id: `conn-${engine}`,
    name: engine,
    engine,
    family,
    host: 'localhost',
    port: undefined,
    database: undefined,
    connectionString: undefined,
    connectionMode: 'native',
    environmentIds: ['env-dev'],
    tags: [],
    favorite: false,
    readOnly: false,
    icon: engine,
    color: undefined,
    group: undefined,
    notes: undefined,
    auth: {
      username: undefined,
      secretRef: undefined,
      sslMode: undefined,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
