import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { QueryBuilderState, QueryTabState } from '@datanaut/shared-types'
import { describe, expect, it, vi } from 'vitest'
import { FIELD_DRAG_MIME } from '../results/field-drag'
import { createDefaultMongoFindBuilderState } from './mongo-find'
import { QueryBuilderPanel } from './QueryBuilderPanel'

describe('QueryBuilderPanel', () => {
  it('adds dragged result fields to filter, projection, and sort sections', () => {
    const onBuilderStateChange = vi.fn()
    const tab = mongoTab()

    render(<BuilderHarness onBuilderStateChange={onBuilderStateChange} tab={tab} />)

    expect(screen.queryByText('Live query')).not.toBeInTheDocument()
    expect(screen.queryByText('Mongo Find Builder')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'products' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Collection')).toHaveValue('products')

    dropField(section('Filters'), 'profile.status')
    expect(screen.getByLabelText('Filter field')).toHaveValue('profile.status')
    expect(screen.getByLabelText('Apply filter profile.status')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Apply filter profile.status'))
    expect(screen.getByLabelText('Apply filter profile.status')).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('Filter group logic Group 1'), {
      target: { value: 'or' },
    })
    expect(screen.getByLabelText('Filter group logic Group 1')).toHaveValue('or')
    fireEvent.click(screen.getByRole('button', { name: 'Add Group' }))
    expect(screen.getByLabelText('Filter group logic Group 2')).toHaveValue('and')

    dropField(section('Projection'), 'profile.name')
    expect(screen.getByLabelText('Projection field')).toHaveValue('profile.name')
    expect(screen.getByLabelText('Projection mode profile.name')).toHaveValue('include')
    fireEvent.change(screen.getByLabelText('Projection mode profile.name'), {
      target: { value: 'exclude' },
    })
    expect(screen.getByLabelText('Projection mode profile.name')).toHaveValue('exclude')

    dropField(section('Sort'), 'createdAt')
    expect(screen.getByLabelText('Sort field')).toHaveValue('createdAt')
    expect(onBuilderStateChange).toHaveBeenCalled()
  })
})

function BuilderHarness({
  onBuilderStateChange,
  tab,
}: {
  onBuilderStateChange(tabId: string, builderState: QueryBuilderState): void
  tab: QueryTabState
}) {
  const [builderState, setBuilderState] = useState<QueryBuilderState>(
    createDefaultMongoFindBuilderState('products'),
  )

  return (
    <QueryBuilderPanel
      tab={tab}
      builderState={builderState}
      collectionOptions={['products', 'inventory', 'orders']}
      onBuilderStateChange={(tabId, nextBuilderState) => {
        setBuilderState(nextBuilderState)
        onBuilderStateChange(tabId, nextBuilderState)
      }}
    />
  )
}

function section(title: string) {
  return screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
}

function dropField(target: HTMLElement, field: string) {
  const data = new Map<string, string>([
    [FIELD_DRAG_MIME, field],
    ['text/plain', field],
  ])
  const dataTransfer = {
    dropEffect: 'copy',
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => data.set(type, value),
  }

  fireEvent.dragOver(target, { dataTransfer })
  fireEvent.drop(target, { dataTransfer })
}

function mongoTab(): QueryTabState {
  const builderState: QueryBuilderState = createDefaultMongoFindBuilderState('products')

  return {
    id: 'tab-mongo',
    title: 'products.find.json',
    connectionId: 'conn-mongo',
    environmentId: 'env-dev',
    family: 'document',
    language: 'mongodb',
    editorLabel: 'Document query',
    queryText: '{}',
    status: 'idle',
    dirty: false,
    history: [],
    builderState,
  }
}
