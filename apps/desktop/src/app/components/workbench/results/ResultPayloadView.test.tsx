import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ConnectionProfile } from '@universality/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeRenderedColumnWidths } from './data-grid-layout'
import { FIELD_DRAG_MIME } from './field-drag'
import { JsonTreeView } from './JsonTreeView'
import { ResultPayloadView } from './ResultPayloadView'

const writeTextSpy = vi.fn()

beforeEach(() => {
  writeTextSpy.mockReset()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeTextSpy },
  })
})

describe('ResultPayloadView', () => {
  it('renders document payloads as an expandable table with closed child rows', () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'document',
          documents: [
            {
              _id: 'account-1',
              profile: { name: 'Avery', plan: 'Team' },
            },
          ],
        }}
      />,
    )

    const documentTable = screen.getByRole('treegrid', { name: 'Document result table' })
    expect(within(documentTable).getByText('key / _id')).toBeInTheDocument()
    expect(within(documentTable).getByText('type')).toBeInTheDocument()
    expect(within(documentTable).getByText('value')).toBeInTheDocument()
    expect(within(documentTable).getByText('account-1')).toBeInTheDocument()
    expect(within(documentTable).getByText('{2 field(s)}')).toBeInTheDocument()
    expect(screen.queryByText('profile')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand account-1' }))

    expect(screen.getByText('profile')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand profile' }))
    expect(screen.getByText('Team')).toBeInTheDocument()
  })

  it('shows non-string document _id values as the root label value', () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'document',
          documents: [{ _id: { $oid: '507f1f77bcf86cd799439011' }, status: 'active' }],
        }}
      />,
    )

    const documentTable = screen.getByRole('treegrid', { name: 'Document result table' })
    expect(within(documentTable).getByText('{"$oid":"507f1f77bcf86cd799439011"}')).toBeInTheDocument()
    expect(within(documentTable).queryByText('_id: {1 field(s)}')).not.toBeInTheDocument()
  })

  it('shows the execution summary in the document grid footer', () => {
    render(
      <ResultPayloadView
        resultSummary="2 document(s) returned from Copy of Fixture MongoDB."
        payload={{
          renderer: 'document',
          documents: [{ _id: 'account-1', status: 'active' }],
        }}
      />,
    )

    expect(
      screen.getByText('2 document(s) returned from Copy of Fixture MongoDB.'),
    ).toBeInTheDocument()
  })

  it('copies document values from the expandable table', async () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'document',
          documents: [{ _id: 'account-1', status: 'active' }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand account-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'active' }))

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('active')
    })
  })

  it('uses visible document field labels as drag handles for query builder drops', () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'document',
          documents: [{ _id: 'account-1', status: 'active' }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand account-1' }))

    const field = screen.getByText('status')
    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
    }

    expect(field).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(field, { dataTransfer })

    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(dataTransfer.setData).toHaveBeenCalledWith(FIELD_DRAG_MIME, 'status')
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'status')
  })

  it('enables Mongo document inline edits, typed badges, and context actions', async () => {
    render(
      <ResultPayloadView
        connection={mongoConnection()}
        payload={{
          renderer: 'document',
          documents: [{ _id: 'account-1', status: 'active', count: 7 }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand account-1' }))

    expect(screen.queryByLabelText('Change type status')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Change type count')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Edit value status')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Rename field status')).not.toBeInTheDocument()
    expect(screen.getAllByText('string')[0]).toHaveClass('is-string')
    expect(screen.getByText('number')).toHaveClass('is-number')

    fireEvent.doubleClick(screen.getByText('status'))
    fireEvent.change(screen.getByLabelText('Rename field status'), {
      target: { value: 'state' },
    })
    expect(screen.getByText('state')).toBeInTheDocument()

    fireEvent.doubleClick(screen.getByRole('button', { name: 'active' }))
    fireEvent.change(screen.getByLabelText('Edit value state'), {
      target: { value: 'paused' },
    })
    expect(screen.getByDisplayValue('paused')).toBeInTheDocument()

    fireEvent.doubleClick(screen.getByText('number'))
    expect(screen.getByLabelText('Change type count')).toHaveClass('is-number')
    fireEvent.change(screen.getByLabelText('Change type count'), {
      target: { value: 'string' },
    })
    expect(screen.queryByLabelText('Change type count')).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole('button', { name: 'paused' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Value' }))

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('paused')
    })
  })

  it('keeps non-editable document results read-only on double click', () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'document',
          documents: [{ _id: 'account-1', status: 'active' }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand account-1' }))
    fireEvent.doubleClick(screen.getByText('status'))
    fireEvent.doubleClick(screen.getByRole('button', { name: 'active' }))
    const stringBadges = screen.getAllByText('string')
    expect(stringBadges).toHaveLength(2)
    fireEvent.doubleClick(stringBadges[1]!)

    expect(screen.queryByLabelText('Rename field status')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Edit value status')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Change type status')).not.toBeInTheDocument()
  })

  it('renders table payloads with selection, buffered filtering, and copy actions', async () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'table',
          columns: ['name', 'status'],
          rows: [
            ['Avery', 'active'],
            ['Blake', 'paused'],
          ],
        }}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Find in results'), {
      target: { value: 'avery' },
    })

    expect(screen.getByText('1 of 2 buffered row(s)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avery' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Blake' })).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Avery' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Selection' }))

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('Avery')
    })
  })

  it('stretches table columns to fill the visible grid width', () => {
    expect(computeRenderedColumnWidths(['name', 'status'], {}, 448)).toEqual([200, 200])
    expect(computeRenderedColumnWidths(['name', 'status'], {}, 300)).toEqual([160, 160])
  })

  it('parses JSON-looking key-value entries into expandable trees', () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'keyvalue',
          entries: {
            'session:1': '{"user":"avery","cart":{"items":3}}',
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand session:1' }))

    expect(screen.getByText('user')).toBeInTheDocument()
    expect(screen.getByText('"avery"')).toBeInTheDocument()
    expect(screen.getByText('cart')).toBeInTheDocument()
  })

  it('shows actual returned documents in the JSON and Raw views', () => {
    const documents = [{ _id: 'product-1', sku: 'SKU-1' }]
    const { rerender } = render(
      <ResultPayloadView
        payload={{
          renderer: 'json',
          value: documents,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand result' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand [0]' }))

    expect(screen.getByText('sku')).toBeInTheDocument()
    expect(screen.getByText('"SKU-1"')).toBeInTheDocument()

    rerender(
      <ResultPayloadView
        payload={{
          renderer: 'raw',
          text: JSON.stringify(documents, null, 2),
        }}
      />,
    )

    expect(screen.getByLabelText('Raw result')).toHaveTextContent('SKU-1')
  })

  it('renders JSON payloads as trees while preserving primitive values', () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'json',
          value: { ok: true, total: 42, message: 'ready' },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand result' }))

    expect(screen.getByText('ok')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
    expect(screen.getByText('total')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('"ready"')).toBeInTheDocument()
  })

  it('renders search hits as source and aggregation tree sections', () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'searchHits',
          total: 1,
          hits: [
            {
              id: 'product-1',
              score: 1.25,
              source: { sku: 'SKU-1', inventory: { available: 7 } },
              highlights: { sku: ['<em>SKU</em>-1'] },
            },
          ],
          aggregations: { categories: { buckets: [{ key: 'coffee', doc_count: 1 }] } },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand search hits' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand hits' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand [0]' }))

    expect(screen.getByText('source')).toBeInTheDocument()
    expect(screen.getByText('highlights')).toBeInTheDocument()
    expect(screen.getByText('aggregations')).toBeInTheDocument()
  })
})

describe('JsonTreeView', () => {
  it('caps expanded children so large payloads do not flood the DOM', () => {
    const value = Object.fromEntries(
      Array.from({ length: 300 }, (_, index) => [`key${index}`, index]),
    )

    render(<JsonTreeView value={value} label="large result" />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand large result' }))

    const tree = screen.getByRole('tree', { name: 'large result JSON tree' })

    expect(within(tree).getByText('key0')).toBeInTheDocument()
    expect(within(tree).getByText('key249')).toBeInTheDocument()
    expect(within(tree).queryByText('key250')).not.toBeInTheDocument()
    expect(within(tree).getByText('50 more item(s)')).toBeInTheDocument()
  })
})

function mongoConnection(): ConnectionProfile {
  return {
    id: 'conn-mongo',
    name: 'Mongo',
    engine: 'mongodb',
    family: 'document',
    host: '127.0.0.1',
    port: 27017,
    database: 'catalog',
    environmentIds: ['env-dev'],
    tags: [],
    favorite: false,
    readOnly: false,
    icon: 'mongodb',
    auth: {
      username: 'universality',
      secretRef: {
        id: 'secret-mongo',
        provider: 'manual',
        service: 'Universality',
        account: 'conn-mongo',
        label: 'Mongo credential',
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
