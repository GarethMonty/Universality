import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import type { QueryBuilderState, QueryTabState } from '@datanaut/shared-types'
import { describe, expect, it, vi } from 'vitest'
import { FIELD_DRAG_MIME, FIELD_DRAG_PAYLOAD_MIME } from '../results/field-drag'
import { ResultPayloadView } from '../results/ResultPayloadView'
import { createDefaultCqlPartitionBuilderState } from './cql-partition'
import { createDefaultDynamoDbKeyConditionBuilderState } from './dynamodb-key-condition'
import { createDefaultMongoFindBuilderState } from './mongo-find'
import { QueryBuilderPanel } from './QueryBuilderPanel'
import { createDefaultSearchDslBuilderState } from './search-dsl'
import { createDefaultSqlSelectBuilderState } from './sql-select'

describe('QueryBuilderPanel', () => {
  it('adds dragged result fields to filter, projection, and sort sections', () => {
    const onBuilderStateChange = vi.fn()
    const tab = mongoTab()

    render(<BuilderHarness onBuilderStateChange={onBuilderStateChange} tab={tab} />)

    expect(screen.queryByText('Live query')).not.toBeInTheDocument()
    expect(screen.queryByText('Mongo Find Builder')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'products' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Collection')).toHaveValue('products')
    expect(screen.queryByLabelText('Filter group logic Group 1')).not.toBeInTheDocument()

    dropField(section('Filters'), 'profile.status')
    expect(screen.getByLabelText('Filter field')).toHaveValue('profile.status')
    expect(screen.getByLabelText('Apply filter profile.status')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Apply filter profile.status'))
    expect(screen.getByLabelText('Apply filter profile.status')).not.toBeChecked()
    expect(screen.queryByLabelText('Filter group logic Group 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Group' }))
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

  it('adds a Mongo filter from the Filters section header', () => {
    const onBuilderStateChange = vi.fn()

    render(<BuilderHarness onBuilderStateChange={onBuilderStateChange} tab={mongoTab()} />)

    const filtersSection = section('Filters')
    const rootAddFilterButton = within(filtersSection).getAllByRole('button', {
      name: 'Add Filter',
    })[0] as HTMLElement

    fireEvent.click(rootAddFilterButton)

    expect(screen.getByLabelText('Filter field')).toHaveValue('')
    expect(screen.getByLabelText(/^Apply filter/)).toBeChecked()
    expect(screen.queryByLabelText('Filter group logic Group 1')).not.toBeInTheDocument()
    expect(onBuilderStateChange).toHaveBeenCalledOnce()
  })

  it('adds document result fields to the Mongo builder section they are dropped on', () => {
    const onBuilderStateChange = vi.fn()
    const tab = mongoTab()

    render(
      <div>
        <ResultPayloadView
          payload={{
            renderer: 'document',
            documents: [
              {
                _id: 'product-1',
                profile: { name: 'Lamp', status: 'active' },
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          }}
        />
        <BuilderHarness onBuilderStateChange={onBuilderStateChange} tab={tab} />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand product-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand profile' }))

    dragDocumentFieldToSection('profile.status', 'Filters', { stripCustomDropPayload: true })
    expect(screen.getByLabelText('Filter field')).toHaveValue('profile.status')
    expect(screen.getByLabelText('Value type')).toHaveValue('string')
    expect(screen.getByLabelText('Filter value')).toHaveValue('active')

    dragDocumentFieldToSection('profile.name', 'Projection')
    expect(screen.getByLabelText('Projection field')).toHaveValue('profile.name')

    dragDocumentFieldToSection('createdAt', 'Sort')
    expect(screen.getByLabelText('Sort field')).toHaveValue('createdAt')
    expect(onBuilderStateChange).toHaveBeenCalledTimes(3)
  })

  it('renders a SQL SELECT builder with drag targets and compact table controls', () => {
    const onBuilderStateChange = vi.fn()

    render(
      <BuilderHarness
        connectionEngine="postgresql"
        initialBuilderState={createDefaultSqlSelectBuilderState('accounts', 'public', 20)}
        onBuilderStateChange={onBuilderStateChange}
        tab={sqlTab()}
      />,
    )

    expect(screen.getByRole('region', { name: 'SQL SELECT builder' })).toBeInTheDocument()
    expect(screen.getByLabelText('Schema')).toHaveValue('public')
    expect(screen.getByLabelText('Table')).toHaveValue('accounts')

    dropField(section('Columns'), 'email')
    expect(screen.getByLabelText('Selected column')).toHaveValue('email')

    dropField(section('Filters'), 'status')
    expect(screen.getByLabelText('Filter field')).toHaveValue('status')
    fireEvent.change(screen.getByLabelText('Filter value'), {
      target: { value: 'active' },
    })

    dropField(section('Sort'), 'created_at')
    expect(screen.getByLabelText('Sort field')).toHaveValue('created_at')
    expect(onBuilderStateChange).toHaveBeenCalled()
  })

  it('renders a DynamoDB key-condition builder with field drop zones', () => {
    const onBuilderStateChange = vi.fn()

    render(
      <BuilderHarness
        connectionEngine="dynamodb"
        initialBuilderState={createDefaultDynamoDbKeyConditionBuilderState('Orders', 20)}
        onBuilderStateChange={onBuilderStateChange}
        tab={dynamoDbTab()}
      />,
    )

    expect(screen.getByRole('region', { name: 'DynamoDB key-condition builder' })).toBeInTheDocument()
    expect(screen.getByLabelText('Table')).toHaveValue('Orders')
    expect(screen.getByLabelText('Partition key field')).toHaveValue('pk')

    dropField(section('Filters'), 'status')
    expect(screen.getByLabelText('Filter field')).toHaveValue('status')

    dropField(section('Projection'), 'total')
    expect(screen.getByLabelText('Projection field')).toHaveValue('total')
    expect(onBuilderStateChange).toHaveBeenCalled()
  })

  it('renders a CQL partition builder with partition and projection drop zones', () => {
    const onBuilderStateChange = vi.fn()

    render(
      <BuilderHarness
        connectionEngine="cassandra"
        initialBuilderState={createDefaultCqlPartitionBuilderState('events_by_customer', 'app', 20)}
        onBuilderStateChange={onBuilderStateChange}
        tab={cassandraTab()}
      />,
    )

    expect(screen.getByRole('region', { name: 'CQL partition query builder' })).toBeInTheDocument()
    expect(screen.getByLabelText('Keyspace')).toHaveValue('app')
    expect(screen.getByLabelText('Table')).toHaveValue('events_by_customer')

    dropField(section('Filters'), 'status')
    expect(screen.getAllByLabelText('Condition field').at(-1)).toHaveValue('status')

    dropField(section('Columns'), 'event_id')
    expect(screen.getByLabelText('Selected column')).toHaveValue('event_id')
    expect(onBuilderStateChange).toHaveBeenCalled()
  })

  it('renders a Search Query DSL builder with filters, source fields, and aggregations', () => {
    const onBuilderStateChange = vi.fn()

    render(
      <BuilderHarness
        connectionEngine="elasticsearch"
        initialBuilderState={createDefaultSearchDslBuilderState('products', 20)}
        onBuilderStateChange={onBuilderStateChange}
        tab={searchTab()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Search Query DSL builder' })).toBeInTheDocument()
    expect(screen.getByLabelText('Index')).toHaveValue('products')
    fireEvent.change(screen.getByLabelText('Search query mode'), {
      target: { value: 'match' },
    })
    fireEvent.change(screen.getByLabelText('Search field'), {
      target: { value: 'name' },
    })
    fireEvent.change(screen.getByLabelText('Search value'), {
      target: { value: 'lamp' },
    })

    dropField(section('Filters'), 'status.keyword')
    expect(screen.getByLabelText('Filter field')).toHaveValue('status.keyword')

    dropField(section('Source Fields'), 'sku')
    expect(screen.getByLabelText('Source Fields field')).toHaveValue('sku')

    dropField(section('Aggregations'), 'status.keyword')
    expect(screen.getByLabelText('Aggregation field')).toHaveValue('status.keyword')
    expect(onBuilderStateChange).toHaveBeenCalled()
  })
})

function BuilderHarness({
  connectionEngine = 'mongodb',
  initialBuilderState,
  onBuilderStateChange,
  tab,
}: {
  connectionEngine?: 'mongodb' | 'postgresql' | 'dynamodb' | 'cassandra' | 'elasticsearch'
  initialBuilderState?: QueryBuilderState
  onBuilderStateChange(tabId: string, builderState: QueryBuilderState): void
  tab: QueryTabState
}) {
  const [builderState, setBuilderState] = useState<QueryBuilderState>(
    initialBuilderState ?? createDefaultMongoFindBuilderState('products'),
  )

  return (
    <QueryBuilderPanel
      connection={{
        id: `conn-${connectionEngine}`,
        name: connectionEngine,
        engine: connectionEngine,
        family:
          connectionEngine === 'mongodb'
            ? 'document'
            : connectionEngine === 'dynamodb'
              ? 'widecolumn'
            : connectionEngine === 'cassandra'
                ? 'widecolumn'
                : connectionEngine === 'elasticsearch'
                  ? 'search'
                  : 'sql',
        host: '127.0.0.1',
        environmentIds: ['env-dev'],
        tags: [],
        favorite: false,
        readOnly: false,
        icon: connectionEngine,
        auth: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }}
      tab={tab}
      builderState={builderState}
      collectionOptions={['products', 'inventory', 'orders']}
      tableOptions={['accounts', 'orders', 'Orders']}
      onBuilderStateChange={(tabId, nextBuilderState) => {
        setBuilderState(nextBuilderState)
        onBuilderStateChange(tabId, nextBuilderState)
      }}
    />
  )
}

function searchTab(): QueryTabState {
  const builderState: QueryBuilderState = createDefaultSearchDslBuilderState('products')

  return {
    id: 'tab-search',
    title: 'products.json',
    connectionId: 'conn-search',
    environmentId: 'env-dev',
    family: 'search',
    language: 'query-dsl',
    editorLabel: 'Search DSL editor',
    queryText: '{}',
    status: 'idle',
    dirty: false,
    history: [],
    builderState,
  }
}

function cassandraTab(): QueryTabState {
  const builderState: QueryBuilderState = createDefaultCqlPartitionBuilderState(
    'events_by_customer',
    'app',
  )

  return {
    id: 'tab-cassandra',
    title: 'events_by_customer.cql',
    connectionId: 'conn-cassandra',
    environmentId: 'env-dev',
    family: 'widecolumn',
    language: 'cql',
    editorLabel: 'CQL editor',
    queryText: 'select * from app.events_by_customer limit 20;',
    status: 'idle',
    dirty: false,
    history: [],
    builderState,
  }
}

function dynamoDbTab(): QueryTabState {
  const builderState: QueryBuilderState = createDefaultDynamoDbKeyConditionBuilderState('Orders')

  return {
    id: 'tab-dynamodb',
    title: 'Orders.json',
    connectionId: 'conn-dynamodb',
    environmentId: 'env-dev',
    family: 'widecolumn',
    language: 'json',
    editorLabel: 'Document query',
    queryText: '{}',
    status: 'idle',
    dirty: false,
    history: [],
    builderState,
  }
}

function sqlTab(): QueryTabState {
  const builderState: QueryBuilderState = createDefaultSqlSelectBuilderState(
    'accounts',
    'public',
  )

  return {
    id: 'tab-sql',
    title: 'accounts.sql',
    connectionId: 'conn-postgresql',
    environmentId: 'env-dev',
    family: 'sql',
    language: 'sql',
    editorLabel: 'SQL editor',
    queryText: 'select * from public.accounts limit 20;',
    status: 'idle',
    dirty: false,
    history: [],
    builderState,
  }
}

function section(title: string) {
  return screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
}

function dropField(target: HTMLElement, field: string) {
  const dataTransfer = createFieldDataTransfer(field)

  fireEvent.dragOver(target, { dataTransfer })
  fireEvent.drop(target, { dataTransfer })
}

function dragDocumentFieldToSection(
  field: string,
  sectionTitle: string,
  options: { stripCustomDropPayload?: boolean } = {},
) {
  const source = screen.getAllByTitle(`Drag ${field} to the query builder`).at(-1) as HTMLElement
  const dataTransfer = createFieldDataTransfer()
  const target = section(sectionTitle)
  const dropDataTransfer = options.stripCustomDropPayload
    ? createFieldDataTransfer(field, { includeCustomPayload: false })
    : dataTransfer

  fireEvent.dragStart(source, { dataTransfer })
  fireEvent.dragOver(target, { dataTransfer: dropDataTransfer })
  fireEvent.drop(target, { dataTransfer: dropDataTransfer })
}

function createFieldDataTransfer(
  field = '',
  options: { includeCustomPayload?: boolean } = {},
) {
  const includeCustomPayload = options.includeCustomPayload ?? true
  const data = new Map<string, string>([
    [FIELD_DRAG_MIME, field],
    ['text/plain', field],
  ])

  return {
    effectAllowed: '',
    dropEffect: 'copy',
    getData: (type: string) =>
      includeCustomPayload || type !== FIELD_DRAG_PAYLOAD_MIME
        ? data.get(type) ?? ''
        : '',
    setData: (type: string, value: string) => data.set(type, value),
  }
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
