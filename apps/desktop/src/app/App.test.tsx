import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopClient } from '../services/runtime/client'
import { App } from './App'

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string
    onChange(value: string | undefined): void
  }) => (
    <textarea
      aria-label="Query editor"
      className="editor-textarea"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

async function createFirstConnection() {
  await screen.findByLabelText('connections sidebar')
  fireEvent.click(screen.getByLabelText('New connection'))

  const drawer = await screen.findByLabelText('connection drawer')

  await waitFor(() => {
    expect(within(drawer).getByLabelText('Name')).toHaveValue('PostgreSQL connection')
  })

  await waitFor(() => {
    expect(screen.getByRole('tab', { name: /Query 1/i })).toBeInTheDocument()
  })

  return drawer
}

async function runPreviewQuery() {
  await createFirstConnection()
  fireEvent.click(screen.getByRole('button', { name: 'Run query' }))

  await waitFor(() => {
    expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
  })
}

function getConnectionRow(connectionName: string) {
  const label = within(screen.getByLabelText('connections sidebar')).getByText(connectionName)
  const row = label.closest('[role="button"]')

  if (!(row instanceof HTMLElement)) {
    throw new Error(`Connection row was not found for ${connectionName}.`)
  }

  return row
}

function getEditorTabNames() {
  const tablist = screen.getByRole('tablist', { name: 'Editor tabs' })
  return within(tablist)
    .getAllByRole('tab')
    .map((tab) => tab.textContent ?? '')
}

async function openExplorerFromConnection(connectionName = 'PostgreSQL connection') {
  fireEvent.contextMenu(getConnectionRow(connectionName))
  fireEvent.click(
    await screen.findByRole('menuitem', {
      name: `Open Explorer for ${connectionName}`,
    }),
  )
}

async function createCatalogMongoWithBuilderTab() {
  const drawer = await createFirstConnection()
  fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

  await waitFor(() => {
    expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
  })

  fireEvent.click(screen.getByRole('button', { name: 'New connection' }))
  const mongoDrawer = await screen.findByLabelText('connection drawer')
  fireEvent.change(within(mongoDrawer).getByLabelText('Name'), {
    target: { value: 'Catalog Mongo' },
  })
  fireEvent.change(within(mongoDrawer).getByLabelText('Database type'), {
    target: { value: 'mongodb' },
  })
  fireEvent.click(within(mongoDrawer).getByRole('button', { name: 'Save Connection' }))

  await waitFor(() => {
    expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
  })

  const sidebar = screen.getByLabelText('connections sidebar')
  fireEvent.click(within(sidebar).getByLabelText('Expand connection Catalog Mongo'))

  const mongoTree = within(sidebar).getByRole('tree', { name: 'Catalog Mongo objects' })
  fireEvent.click(within(mongoTree).getByLabelText('Expand Databases'))
  fireEvent.click(within(mongoTree).getByLabelText('Expand admin'))
  fireEvent.click(within(mongoTree).getByLabelText('Expand Collections'))

  const productsCollection = within(mongoTree).getByRole('treeitem', { name: /products/i })
  fireEvent.dblClick(productsCollection)

  await waitFor(() => {
    expect(screen.getByRole('tab', { name: /products\.find/i })).toBeInTheDocument()
  })
}

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders a blank desktop workbench with first-run onboarding', async () => {
    render(<App />)

    expect(await screen.findByLabelText('Activity bar')).toBeInTheDocument()
    expect(screen.getByLabelText('connections sidebar')).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Editor tabs' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Bottom panel')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Status bar')).toBeInTheDocument()
    expect(screen.getByLabelText('First run onboarding')).toBeInTheDocument()
    expect(screen.getByText('No connections yet.')).toBeInTheDocument()
    expect(screen.queryByText('Analytics Postgres')).not.toBeInTheDocument()
    expect(screen.queryByText('Ops dashboard')).not.toBeInTheDocument()
  })

  it('keeps icon controls accessible and disables tab-only actions until a connection exists', async () => {
    render(<App />)

    expect(await screen.findByLabelText('Activity bar')).toBeInTheDocument()
    expect(screen.getByLabelText('Connections view')).toBeInTheDocument()
    expect(screen.getByLabelText('Environments view')).toBeInTheDocument()
    expect(screen.queryByLabelText('Explorer view')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New connection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create query tab' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Run query' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel query' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Explain query' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument()
    expect(screen.getByLabelText('Lock workspace')).toBeInTheDocument()
    expect(screen.getByLabelText('Open diagnostics drawer')).toBeInTheDocument()

    await createFirstConnection()

    expect(screen.getByRole('button', { name: 'Run query' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel query' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explain query' })).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle results panel')).toBeInTheDocument()
  })

  it('switches sidebar activities without losing the active editor tab', async () => {
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    await openExplorerFromConnection()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument()
    })
    expect(screen.getByRole('region', { name: 'Visual database structure' })).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Connections view'))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Query 1/i })).toBeInTheDocument()
    })
  })

  it('opens Explorer from a connection context menu', async () => {
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    fireEvent.contextMenu(getConnectionRow('PostgreSQL connection'))

    const menu = await screen.findByRole('menu', {
      name: 'Connection options for PostgreSQL connection',
    })
    expect(
      screen.queryByRole('button', {
        name: 'Delete connection PostgreSQL connection',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(menu).getByRole('menuitem', {
        name: 'Open Explorer for PostgreSQL connection',
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      within(menu).getByRole('menuitem', {
        name: 'Open Explorer for PostgreSQL connection',
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument()
    })
    expect(screen.getByLabelText('explorer sidebar')).toBeInTheDocument()
    expect(screen.getAllByText('PostgreSQL connection').length).toBeGreaterThan(0)
  })

  it('opens the connection drawer for editing from a connection context menu', async () => {
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    fireEvent.contextMenu(getConnectionRow('PostgreSQL connection'))

    const menu = await screen.findByRole('menu', {
      name: 'Connection options for PostgreSQL connection',
    })
    fireEvent.click(
      within(menu).getByRole('menuitem', {
        name: 'Edit connection PostgreSQL connection',
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Connection' })).toBeInTheDocument()
    })
    expect(
      within(screen.getByLabelText('connection drawer')).getByRole('button', {
        name: 'Save Connection',
      }),
    ).toBeInTheDocument()
  })

  it('creates a query from the connection context menu without opening connection details', async () => {
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    fireEvent.contextMenu(getConnectionRow('PostgreSQL connection'))
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Create query tab for PostgreSQL connection',
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Query 2/i })).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
  })

  it('closes connection details when creating a query from the connections pane', async () => {
    render(<App />)

    await createFirstConnection()
    expect(screen.getByLabelText('connection drawer')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New query tab' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Query 2/i })).toBeInTheDocument()
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })
  })

  it('opens operations from the connection context menu and previews a live-safe operation', async () => {
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    fireEvent.contextMenu(getConnectionRow('PostgreSQL connection'))
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Open operations for PostgreSQL connection',
      }),
    )

    const operationsDrawer = await screen.findByLabelText('operations drawer')
    expect(
      within(operationsDrawer).getByRole('heading', { level: 2, name: 'Operations' }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(within(operationsDrawer).getByText('Refresh Metadata')).toBeInTheDocument()
    })

    fireEvent.click(within(operationsDrawer).getByRole('button', { name: 'Execute' }))

    await waitFor(() => {
      expect(within(operationsDrawer).getByText('Preview operation completed.')).toBeInTheDocument()
    })
  })

  it('does not create a new query tab when selecting a connection that has no active tab', async () => {
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: /Close tab Query 1/i,
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('tab', { name: /Query 1/i }),
      ).not.toBeInTheDocument()
    })

    fireEvent.click(
      within(screen.getByLabelText('connections sidebar')).getByTitle(
        'PostgreSQL connection: select this postgresql connection for query tabs and Explorer.',
      ),
    )

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: /Query 1/i })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'New query tab' })).toBeInTheDocument()
  })

  it('opens the connection drawer for editing from the toolbar', async () => {
    render(<App />)

    await createFirstConnection()
    fireEvent.click(screen.getByRole('button', { name: 'Change connection' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Connection' })).toBeInTheDocument()
    })

    const drawer = screen.getByRole('button', { name: 'Save Connection' }).closest('aside')
    expect(drawer).not.toBeNull()
    expect(within(drawer!).getByRole('button', { name: 'Save Connection' })).toBeInTheDocument()
    expect(within(drawer!).getByLabelText('Environment')).toBeInTheDocument()
    expect(within(drawer!).getByLabelText('Database type')).toBeInTheDocument()
    expect(within(drawer!).getByText('Connection options')).toBeInTheDocument()
    expect(within(drawer!).getByRole('button', { name: 'Favorite' })).toBeInTheDocument()
    expect(within(drawer!).getByRole('button', { name: 'Read-only' })).toBeInTheDocument()
    expect(within(drawer!).queryByText('Variables')).not.toBeInTheDocument()
    expect(within(drawer!).queryByText('No environment selected')).not.toBeInTheDocument()
    expect(within(drawer!).queryByRole('button', { name: 'Save Environment' })).not.toBeInTheDocument()

    fireEvent.click(within(drawer!).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })
  })

  it('groups the connection list by environment, database type, or no grouping', async () => {
    render(<App />)

    await createFirstConnection()
    const updateUiStateSpy = vi.spyOn(desktopClient, 'updateUiState')
    const sidebar = screen.getByLabelText('connections sidebar')
    const header = within(sidebar).getByRole('heading', { name: 'Connections' }).parentElement

    expect(header).not.toBeNull()

    expect(within(sidebar).getByRole('button', { name: 'Group connections: None' })).toBeInTheDocument()
    expect(within(header!).getByRole('button', { name: 'Group connections: None' })).toBeInTheDocument()

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Group connections: None' }))
    const groupByEnvironment = within(sidebar).getByRole('menuitemradio', {
      name: /Environment/,
    })
    expect(groupByEnvironment).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(groupByEnvironment)
    await waitFor(() => {
      expect(updateUiStateSpy).toHaveBeenCalledWith({ connectionGroupMode: 'environment' })
    })
    await waitFor(() => {
      expect(within(sidebar).getByRole('button', { name: 'Group connections: Environment' })).toBeInTheDocument()
    })
    expect(within(sidebar).getByText('Local')).toBeInTheDocument()

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Group connections: Environment' }))
    const groupByDatabaseType = within(sidebar).getByRole('menuitemradio', {
      name: /Type/,
    })
    fireEvent.click(groupByDatabaseType)
    await waitFor(() => {
      expect(within(sidebar).getByRole('button', { name: 'Group connections: Type' })).toBeInTheDocument()
    })
    expect(within(sidebar).getByText('SQL')).toBeInTheDocument()

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Group connections: Type' }))
    const showWithoutGrouping = within(sidebar).getByRole('menuitemradio', {
      name: /None/,
    })
    fireEvent.click(showWithoutGrouping)
    await waitFor(() => {
      expect(within(sidebar).getByRole('button', { name: 'Group connections: None' })).toBeInTheDocument()
    })
  })

  it('collapses sidebar sections and persists the section state', async () => {
    render(<App />)

    await createFirstConnection()
    const updateUiStateSpy = vi.spyOn(desktopClient, 'updateUiState')
    const sidebar = screen.getByLabelText('connections sidebar')
    const connectionsSection = within(sidebar).getByRole('button', {
      name: 'Collapse Connections section (1)',
    })

    expect(connectionsSection).toHaveAttribute('aria-expanded', 'true')
    expect(within(sidebar).getByText('New PostgreSQL connection')).toBeInTheDocument()

    fireEvent.click(connectionsSection)

    await waitFor(() => {
      expect(updateUiStateSpy).toHaveBeenCalledWith({
        sidebarSectionStates: {
          'connections:none:connections': false,
        },
      })
    })
    await waitFor(() => {
      expect(
        within(sidebar).queryByText('New PostgreSQL connection'),
      ).not.toBeInTheDocument()
    })
    expect(
      within(sidebar).getByRole('button', { name: 'Expand Connections section (1)' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders datastore-specific object trees under connections', async () => {
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    const sidebar = screen.getByLabelText('connections sidebar')
    fireEvent.click(within(sidebar).getByLabelText('Expand connection PostgreSQL connection'))

    const sqlTree = within(sidebar).getByRole('tree', { name: 'PostgreSQL connection objects' })
    expect(sqlTree).toBeInTheDocument()
    expect(within(sqlTree).getByText('Schemas')).toBeInTheDocument()
    expect(within(sqlTree).queryByText('Tables')).not.toBeInTheDocument()

    fireEvent.click(within(sqlTree).getByLabelText('Expand Schemas'))
    fireEvent.click(within(sqlTree).getByLabelText('Expand public'))

    expect(within(sqlTree).getByText('Tables')).toBeInTheDocument()
    expect(within(sqlTree).getByText('Stored Procedures')).toBeInTheDocument()
    expect(within(sqlTree).queryByText('accounts')).not.toBeInTheDocument()

    fireEvent.click(within(sqlTree).getByLabelText('Expand Tables'))
    expect(within(sqlTree).getByText('accounts')).toBeInTheDocument()

    fireEvent.click(within(sqlTree).getByLabelText('Collapse Tables'))
    expect(within(sqlTree).queryByText('accounts')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('New connection'))
    const mongoDrawer = await screen.findByLabelText('connection drawer')
    fireEvent.change(within(mongoDrawer).getByLabelText('Name'), {
      target: { value: 'Catalog Mongo' },
    })
    fireEvent.change(within(mongoDrawer).getByLabelText('Database type'), {
      target: { value: 'mongodb' },
    })
    fireEvent.click(within(mongoDrawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    fireEvent.click(within(sidebar).getByLabelText('Expand connection Catalog Mongo'))

    const mongoTree = within(sidebar).getByRole('tree', { name: 'Catalog Mongo objects' })
    expect(mongoTree).toBeInTheDocument()
    expect(within(mongoTree).getByText('Databases')).toBeInTheDocument()
    expect(within(mongoTree).queryByText('Collections')).not.toBeInTheDocument()

    fireEvent.click(within(mongoTree).getByLabelText('Expand Databases'))
    fireEvent.click(within(mongoTree).getByLabelText('Expand admin'))
    fireEvent.click(within(mongoTree).getByLabelText('Expand Collections'))

    expect(within(mongoTree).getByText('Collections')).toBeInTheDocument()
    expect(within(mongoTree).getByText('products')).toBeInTheDocument()
  })

  it('edits environments separately with color picking and secret variables', async () => {
    render(<App />)

    await createFirstConnection()
    expect(screen.getByLabelText('Active environment')).toHaveTextContent('Local')

    fireEvent.click(screen.getByLabelText('Environments view'))

    const workspace = await screen.findByLabelText('Environment workspace')
    expect(within(workspace).getByRole('heading', { level: 1, name: 'Local' })).toBeInTheDocument()

    fireEvent.change(within(workspace).getByLabelText('Environment color'), {
      target: { value: '#ff8800' },
    })
    expect(within(workspace).getByLabelText('Environment color')).toHaveValue('#ff8800')

    fireEvent.change(within(workspace).getByLabelText('New variable key'), {
      target: { value: 'API_TOKEN' },
    })
    fireEvent.change(within(workspace).getByLabelText('New variable value'), {
      target: { value: 'token-value' },
    })
    fireEvent.click(within(workspace).getByRole('button', { name: 'Mark new variable as secret' }))
    fireEvent.click(within(workspace).getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(
        within(workspace).getByLabelText('Environment variable value API_TOKEN'),
      ).toHaveValue('token-value')
    })
    expect(within(workspace).getAllByText('********').length).toBeGreaterThan(0)

    fireEvent.click(within(workspace).getByRole('button', { name: 'Save Environment' }))

    await waitFor(() => {
      expect(
        within(workspace).getByLabelText('Environment variable value API_TOKEN'),
      ).toHaveValue('token-value')
    })
  })

  it('shows SQLite local database actions and creates a starter database path', async () => {
    const createLocalDatabaseSpy = vi.spyOn(desktopClient, 'createLocalDatabase')
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.change(within(drawer).getByLabelText('Database type'), {
      target: { value: 'sqlite' },
    })

    await waitFor(() => {
      expect(within(drawer).getByRole('button', { name: 'Open Existing' })).toBeInTheDocument()
    })
    expect(within(drawer).getByRole('button', { name: 'Create New' })).toBeInTheDocument()
    expect(within(drawer).queryByLabelText('Server')).not.toBeInTheDocument()
    expect(within(drawer).queryByLabelText('Password / Secret')).not.toBeInTheDocument()

    fireEvent.click(within(drawer).getByRole('button', { name: 'Create New' }))

    await waitFor(() => {
      expect(within(drawer).getByRole('dialog', { name: 'Create SQLite database' })).toBeInTheDocument()
    })

    fireEvent.click(within(drawer).getByRole('button', { name: 'Starter schema' }))

    await waitFor(() => {
      expect(createLocalDatabaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: 'sqlite',
          mode: 'starter',
        }),
      )
    })
    await waitFor(() => {
      expect(
        (within(drawer).getByLabelText('Database file') as HTMLInputElement).value,
      ).toContain('universality-preview-local.sqlite')
    })

    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })
    expect(
      within(screen.getByLabelText('Editor toolbar')).queryByText(
        /universality-preview-local\.sqlite/i,
      ),
    ).not.toBeInTheDocument()
  })

  it('persists keyboard resizing for sidebar, right drawer, and bottom panel', async () => {
    render(<App />)

    await createFirstConnection()
    const workbench = document.querySelector('.ads-workbench') as HTMLElement

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize sidebar' }), { key: 'ArrowRight' })
    await waitFor(() => {
      expect(workbench.style.getPropertyValue('--sidebar-width')).toBe('296px')
    })

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize right drawer' }), { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(workbench.style.getPropertyValue('--drawer-width')).toBe('376px')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run query' }))
    const bottomPanel = await screen.findByLabelText('Bottom panel')
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize bottom panel' }), { key: 'ArrowUp' })

    await waitFor(() => {
      expect(bottomPanel).toHaveStyle({ height: '284px' })
    })
  })

  it('creates, stores a secret for, duplicates, and deletes connections', async () => {
    const storeSecretSpy = vi.spyOn(desktopClient, 'storeSecret')
    render(<App />)

    await createFirstConnection()

    fireEvent.change(screen.getByLabelText('Password / Secret'), {
      target: { value: 'local-secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(storeSecretSpy).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Duplicate connection PostgreSQL connection' }),
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Duplicate connection PostgreSQL connection' }),
    )

    await waitFor(() => {
      expect(
        within(screen.getByLabelText('connection drawer')).getByLabelText('Name'),
      ).toHaveValue('Copy of PostgreSQL connection')
    })

    fireEvent.contextMenu(getConnectionRow('Copy of PostgreSQL connection'))
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Delete connection Copy of PostgreSQL connection',
      }),
    )

    const deleteDialog = await screen.findByRole('dialog', {
      name: 'Remove Copy of PostgreSQL connection?',
    })
    fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete Connection' }))

    await waitFor(() => {
      expect(
        within(screen.getByLabelText('connections sidebar')).queryByText(
          'Copy of PostgreSQL connection',
        ),
      ).not.toBeInTheDocument()
    })
  })

  it('opens the command palette and runs blank-safe commands', async () => {
    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    fireEvent.change(within(palette).getByLabelText('Search commands'), {
      target: { value: 'new connection' },
    })

    await waitFor(() => {
      expect(within(palette).getByRole('option', { name: /New connection/i })).toBeInTheDocument()
    })

    fireEvent.click(within(palette).getByRole('option', { name: /New connection/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Connection' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
  })

  it('supports workbench keyboard shortcuts once a tab exists', async () => {
    const executeSpy = vi.spyOn(desktopClient, 'executeQuery')
    render(<App />)

    await createFirstConnection()

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    await waitFor(() => {
      expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryByLabelText('Bottom panel')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryByLabelText('connections sidebar')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    await waitFor(() => {
      expect(screen.getByLabelText('connections sidebar')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText('3 rows returned from SQL adapter preview.')).toBeInTheDocument()
    })
  })

  it('shows keyboard shortcut help in diagnostics without a connection', async () => {
    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.click(screen.getByLabelText('Open diagnostics drawer'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Diagnostics' })).toBeInTheDocument()
    })
    expect(screen.getByText('Shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Ctrl K')).toBeInTheDocument()
  })

  it('saves, opens, and deletes saved query work from a real tab', async () => {
    render(<App />)

    await createFirstConnection()
    fireEvent.click(screen.getByLabelText('Saved Work view'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Saved Work' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Save current query'))

    await waitFor(() => {
      expect(screen.getByText('Saved Queries')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Open saved work Query 1/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('tab', { name: /Query 1/i }).length).toBeGreaterThan(1)
    })

    fireEvent.click(screen.getByLabelText('Saved Work view'))
    const savedWorkSidebar = screen.getByLabelText('saved-work sidebar')
    fireEvent.click(screen.getByRole('button', { name: /Delete saved work Query 1/i }))

    await waitFor(() => {
      expect(within(savedWorkSidebar).queryByText('Query 1')).not.toBeInTheDocument()
    })
  })

  it('renames query tabs and saves the renamed title into saved work', async () => {
    render(<App />)

    await createFirstConnection()
    fireEvent.contextMenu(screen.getByRole('tab', { name: /Query 1/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename tab Query 1/i }))

    const titleInput = screen.getByLabelText(/Rename tab Query 1/i)
    fireEvent.change(titleInput, { target: { value: 'Customer lookup' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Customer lookup/i })).toBeInTheDocument()
    })

    fireEvent.contextMenu(screen.getByRole('tab', { name: /Customer lookup/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Save tab Customer lookup/i }))
    fireEvent.click(screen.getByLabelText('Saved Work view'))

    await waitFor(() => {
      expect(screen.getByText('Customer lookup')).toBeInTheDocument()
    })
  })

  it('keeps query tab headers clean, scrollable, and reorderable', async () => {
    render(<App />)

    await createFirstConnection()
    const tablist = screen.getByRole('tablist', { name: 'Editor tabs' })

    expect(screen.getByRole('button', { name: 'Scroll tabs left' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scroll tabs right' })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: /Query 1/i })).toBeInTheDocument()
    expect(within(tablist).queryByText('Local')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create query tab' }))

    await waitFor(() => {
      expect(within(tablist).getByRole('tab', { name: /Query 2/i })).toBeInTheDocument()
    })

    fireEvent.contextMenu(within(tablist).getByRole('tab', { name: /Query 1/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Move tab Query 1.* right/i }))

    await waitFor(() => {
      expect(getEditorTabNames()[0]).toContain('Query 2')
    })
  })

  it('supports VS Code-style tab close actions from the context menu', async () => {
    render(<App />)

    await createFirstConnection()
    fireEvent.click(screen.getByRole('button', { name: 'Create query tab' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create query tab' }))

    const tablist = screen.getByRole('tablist', { name: 'Editor tabs' })

    await waitFor(() => {
      expect(within(tablist).getAllByRole('tab')).toHaveLength(3)
    })

    fireEvent.contextMenu(within(tablist).getByRole('tab', { name: /Query 1/i }))
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Close other tabs except Query 1/i }),
    )

    await waitFor(() => {
      expect(within(tablist).getAllByRole('tab')).toHaveLength(1)
    })
    expect(within(tablist).getByRole('tab', { name: /Query 1/i })).toBeInTheDocument()

    fireEvent.contextMenu(within(tablist).getByRole('tab', { name: /Query 1/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close all tabs' }))

    await waitFor(() => {
      expect(within(tablist).queryByRole('tab')).not.toBeInTheDocument()
    })
  })

  it('closes ephemeral tabs and keeps a recoverable closed-tab history', async () => {
    render(<App />)

    await createFirstConnection()
    fireEvent.click(
      screen.getByRole('button', {
        name: /Close tab Query 1/i,
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('tab', { name: /Query 1/i }),
      ).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Saved Work view'))

    await waitFor(() => {
      expect(screen.getByText('Closed Tabs')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: /Reopen closed tab Query 1/i,
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: /Query 1/i }),
      ).toBeInTheDocument()
    })
  })

  it('asks before closing a dirty saved query tab', async () => {
    const { container } = render(<App />)

    await createFirstConnection()
    fireEvent.click(screen.getByLabelText('Saved Work view'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Saved Work' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Save current query'))

    await waitFor(() => {
      expect(screen.getByText('Saved Queries')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: /Open saved work Query 1/i,
      }),
    )

    await waitFor(() => {
      expect(
        screen.getAllByRole('tab', { name: /Query 1/i }),
      ).toHaveLength(2)
    })

    const editor = await screen.findByLabelText('Query editor')
    fireEvent.change(editor, { target: { value: 'select 2;' } })

    await waitFor(() => {
      expect(container.querySelectorAll('.editor-tab-dirty').length).toBeGreaterThan(0)
    })

    const closeButtons = screen.getAllByRole('button', {
      name: /Close tab Query 1/i,
    })
    const dirtySavedCloseButton = closeButtons.at(-1)

    if (!dirtySavedCloseButton) {
      throw new Error('Expected a close button for the dirty saved tab.')
    }

    fireEvent.click(dirtySavedCloseButton)

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: 'Save changes before closing?' }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Save changes before closing?' }),
      ).not.toBeInTheDocument()
    })

    fireEvent.click(
      screen.getAllByRole('button', {
        name: /Close tab Query 1/i,
      }).at(-1)!,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save and Close' }))

    await waitFor(() => {
      expect(screen.getByText('Closed Tabs')).toBeInTheDocument()
    })
  })

  it('blocks privileged commands while the workspace is locked', async () => {
    render(<App />)

    await createFirstConnection()
    fireEvent.click(screen.getByLabelText('Lock workspace'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unlock Workspace' })).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Unlock the workspace before using privileged desktop commands.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows raw editor controls only for non-builder tabs', async () => {
    render(<App />)

    await createFirstConnection()

    expect(screen.queryByRole('button', { name: 'Show builder and raw' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show builder only' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show raw query only' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Query editor')).toBeInTheDocument()
  })

  it('shows builder controls for MongoDB scratch query tabs', async () => {
    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'New connection' }))
    const mongoDrawer = await screen.findByLabelText('connection drawer')
    fireEvent.change(within(mongoDrawer).getByLabelText('Name'), {
      target: { value: 'Catalog Mongo' },
    })
    fireEvent.change(within(mongoDrawer).getByLabelText('Database type'), {
      target: { value: 'mongodb' },
    })
    fireEvent.click(within(mongoDrawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    fireEvent.contextMenu(getConnectionRow('Catalog Mongo'))
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Create query tab for Catalog Mongo',
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show builder and raw' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Show builder only' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show raw query only' })).toBeInTheDocument()
    expect(screen.getByLabelText('MongoDB query builder')).toBeInTheDocument()
    expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
  })

  it('starts builder queries in side-by-side mode and toggles builder/raw panels', async () => {
    render(<App />)

    await createCatalogMongoWithBuilderTab()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Show builder and raw' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Show builder only' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show raw query only' })).toBeInTheDocument()

    expect(screen.getByLabelText('MongoDB query builder')).toBeInTheDocument()
    expect(screen.getByLabelText('Query editor')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show raw query only' }))
    expect(screen.queryByLabelText('MongoDB query builder')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Query editor')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show builder only' }))
    expect(screen.getByLabelText('MongoDB query builder')).toBeInTheDocument()
    expect(screen.queryByLabelText('Query editor')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show builder and raw' }))
    expect(screen.getByLabelText('MongoDB query builder')).toBeInTheDocument()
    expect(screen.getByLabelText('Query editor')).toBeInTheDocument()
  })

  it('applies generated Mongo builder query before execution', async () => {
    const updateBuilderSpy = vi.spyOn(desktopClient, 'updateQueryBuilderState')
    const executeSpy = vi.spyOn(desktopClient, 'executeQuery')

    render(<App />)

    await createCatalogMongoWithBuilderTab()

    const builder = screen.getByLabelText('MongoDB query builder')
    const addFilterButton = within(builder).getByRole('button', { name: 'Add Filter' })

    fireEvent.click(addFilterButton)

    const filterField = within(builder).getByLabelText('Filter field')
    const filterOperator = within(builder).getByLabelText('Filter operator')
    const filterValue = within(builder).getByLabelText('Filter value')

    fireEvent.change(filterField, { target: { value: 'status' } })
    fireEvent.change(filterOperator, { target: { value: 'eq' } })
    fireEvent.change(filterValue, { target: { value: 'open' } })

    await waitFor(() => {
      const queryEditor = screen.getByLabelText('Query editor') as HTMLTextAreaElement
      expect(queryEditor.value).toContain('"status"')
      expect(queryEditor.value).toContain('"open"')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run query' }))

    await waitFor(() => {
      expect(updateBuilderSpy).toHaveBeenCalled()
      const latestRequest = updateBuilderSpy.mock.calls.at(-1)?.[0]
      expect(latestRequest?.queryText).toContain('"status"')
      expect(latestRequest?.queryText).toContain('"open"')
      const latestExecution = executeSpy.mock.calls.at(-1)?.[0]
      expect(latestExecution?.queryText).toContain('"status"')
      expect(latestExecution?.queryText).toContain('"open"')
    })
  })

  it('keeps the last result visible while editing a Mongo builder query', async () => {
    render(<App />)

    await createCatalogMongoWithBuilderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Run query' }))

    await waitFor(() => {
      expect(screen.getByText('2 documents returned from MongoDB adapter preview.')).toBeInTheDocument()
    })

    const builder = screen.getByLabelText('MongoDB query builder')
    fireEvent.click(within(builder).getByRole('button', { name: 'Add Filter' }))
    fireEvent.change(within(builder).getByLabelText('Filter field'), {
      target: { value: 'inventory.available' },
    })

    expect(screen.getByText('2 documents returned from MongoDB adapter preview.')).toBeInTheDocument()
    expect(screen.getByRole('treegrid', { name: 'Document result table' })).toBeInTheDocument()
  })

  it('runs the raw editor text when query view is raw-only', async () => {
    const executeSpy = vi.spyOn(desktopClient, 'executeQuery')

    render(<App />)

    await createCatalogMongoWithBuilderTab()

    const queryEditor = await screen.findByLabelText('Query editor')
    const rawQuery = '{ "collection": "accounts", "filter": { "status": "open" }, "limit": 10 }'

    fireEvent.click(screen.getByRole('button', { name: 'Show raw query only' }))
    await waitFor(() => {
      expect(screen.queryByLabelText('MongoDB query builder')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show raw query only' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    fireEvent.change(queryEditor, { target: { value: rawQuery } })
    fireEvent.click(screen.getByRole('button', { name: 'Run query' }))

    await waitFor(() => {
      const latestExecution = executeSpy.mock.calls.at(-1)?.[0]
      expect(latestExecution?.queryText).toBe(rawQuery)
    })
  })

  it('routes command failures into the Messages panel until cleared', async () => {
    vi.spyOn(desktopClient, 'setTheme').mockRejectedValueOnce(
      new Error('Theme switch exploded'),
    )

    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.click(screen.getByLabelText('Toggle theme'))

    await waitFor(() => {
      expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
    })
    expect(screen.getByText('Theme switch exploded')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Hide bottom panel'))
    await waitFor(() => {
      expect(screen.queryByLabelText('Bottom panel')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Show 1 workbench message' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear message Theme switch exploded' }),
    )
    await waitFor(() => {
      expect(screen.queryByText('Theme switch exploded')).not.toBeInTheDocument()
    })
    expect(screen.getByText('No messages.')).toBeInTheDocument()
  })

  it('can clear all workbench messages from the Messages panel', async () => {
    vi.spyOn(desktopClient, 'setTheme').mockRejectedValueOnce(
      new Error('Theme switch exploded'),
    )

    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.click(screen.getByLabelText('Toggle theme'))

    await waitFor(() => {
      expect(screen.getByText('Theme switch exploded')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear all workbench messages' }))

    await waitFor(() => {
      expect(screen.queryByText('Theme switch exploded')).not.toBeInTheDocument()
    })
  })

  it('switches bottom panel views and can hide the panel', async () => {
    render(<App />)

    await runPreviewQuery()
    fireEvent.click(screen.getByRole('tab', { name: 'messages' }))

    await waitFor(() => {
      expect(
        screen.getByText('Command errors, runtime notices, and query diagnostics.'),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Hide bottom panel'))
    await waitFor(() => {
      expect(screen.queryByLabelText('Bottom panel')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Show bottom panel'))
    await waitFor(() => {
      expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
    })
  })

  it('copies, exports, and restores executed result history', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const createObjectUrl = vi.fn(() => 'blob:universality-result')
    const revokeObjectUrl = vi.fn()
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    })

    render(<App />)

    await runPreviewQuery()
    fireEvent.click(screen.getByRole('button', { name: 'Copy result' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('table_name'))
    })
    expect(screen.getByText('Result copied to clipboard.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Export result' }))

    await waitFor(() => {
      expect(createObjectUrl).toHaveBeenCalled()
    })
    expect(anchorClick).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:universality-result')

    fireEvent.change(screen.getByLabelText('Query editor'), {
      target: { value: 'select 2;' },
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Query editor')).toHaveValue('select 2;')
    })

    fireEvent.click(screen.getByRole('tab', { name: 'details' }))

    await waitFor(() => {
      expect(screen.getByText('Query History')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Restore history query success/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Query editor')).toHaveValue('select 1;')
    })
  })

  it('keeps explorer load failures local to the explorer pane', async () => {
    vi.spyOn(desktopClient, 'loadExplorer').mockRejectedValueOnce(
      new Error('Explorer fixture unavailable'),
    )

    render(<App />)

    const drawer = await createFirstConnection()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('connection drawer')).not.toBeInTheDocument()
    })

    await openExplorerFromConnection()

    const explorerSidebar = await screen.findByLabelText('explorer sidebar')

    await waitFor(() => {
      expect(
        within(explorerSidebar).getByText('Explorer fixture unavailable'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

