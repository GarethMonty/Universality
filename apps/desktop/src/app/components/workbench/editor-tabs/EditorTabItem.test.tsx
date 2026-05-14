import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  ConnectionProfile,
  EnvironmentProfile,
  QueryTabState,
} from '@datapadplusplus/shared-types'
import { EditorTabItem } from './EditorTabItem'

describe('EditorTabItem', () => {
  it('shows the query title without the legacy connection monogram', () => {
    render(
      <EditorTabItem
        active
        connection={connection}
        draftTitle=""
        editing={false}
        environment={environment}
        tab={tab}
        tabRef={vi.fn()}
        onBeginRename={vi.fn()}
        onCancelRename={vi.fn()}
        onCloseTab={vi.fn()}
        onCommitRename={vi.fn()}
        onContextMenu={vi.fn()}
        onDraftTitleChange={vi.fn()}
        onDragEnd={vi.fn()}
        onDragLeave={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onKeyDown={vi.fn()}
        onSelectTab={vi.fn()}
      />,
    )

    const renderedTab = screen.getByRole('tab')

    expect(within(renderedTab).getByText('Query 1')).toBeInTheDocument()
    expect(screen.queryByText('PO')).not.toBeInTheDocument()
    expect(renderedTab).toHaveAttribute(
      'title',
      expect.stringContaining('Connection: Primary Orders'),
    )
  })
})

const tab: QueryTabState = {
  id: 'tab-1',
  title: 'Query 1.sql',
  connectionId: 'conn-1',
  environmentId: 'env-1',
  family: 'sql',
  language: 'sql',
  editorLabel: 'SQL editor',
  queryText: 'select 1;',
  status: 'idle',
  dirty: false,
  history: [],
}

const connection: ConnectionProfile = {
  id: 'conn-1',
  name: 'Primary Orders',
  engine: 'postgresql',
  family: 'sql',
  host: 'localhost',
  port: 5432,
  database: 'orders',
  environmentIds: ['env-1'],
  tags: [],
  favorite: false,
  readOnly: false,
  icon: 'PO',
  auth: {},
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
}

const environment: EnvironmentProfile = {
  id: 'env-1',
  label: 'Development',
  color: '#3794ff',
  risk: 'low',
  variables: {},
  sensitiveKeys: [],
  requiresConfirmation: false,
  safeMode: true,
  exportable: true,
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
}
