import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('renders document payloads as a Studio 3T-style document list and collapsed tree', () => {
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

    const returnedDocuments = screen.getByLabelText('Returned documents')
    expect(within(returnedDocuments).getByText('account-1')).toBeInTheDocument()
    expect(within(returnedDocuments).getByText('2 field(s)')).toBeInTheDocument()
    expect(screen.queryByText('profile')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand account-1' }))

    expect(screen.getByText('profile')).toBeInTheDocument()
    expect(screen.getByText('_id')).toBeInTheDocument()
  })

  it('copies document paths and values from the tree', async () => {
    render(
      <ResultPayloadView
        payload={{
          renderer: 'document',
          documents: [{ _id: 'account-1', status: 'active' }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand account-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy path status' }))

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('$.status')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy value status' }))

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('active')
    })
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
