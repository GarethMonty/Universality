import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopClient } from '../services/runtime/client'
import { App } from './App'

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders the desktop shell workbench chrome', async () => {
    render(<App />)

    expect(await screen.findByLabelText('Activity bar')).toBeInTheDocument()
    expect(screen.getByLabelText('connections sidebar')).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Editor tabs' })).toBeInTheDocument()
    expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
    expect(screen.getByLabelText('Status bar')).toBeInTheDocument()
  })

  it('keeps compact icon controls accessible by name', async () => {
    render(<App />)

    expect(await screen.findByLabelText('Activity bar')).toBeInTheDocument()
    expect(screen.getByLabelText('Connections view')).toBeInTheDocument()
    expect(screen.getByLabelText('Explorer view')).toBeInTheDocument()
    expect(screen.getByLabelText('New connection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run query' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel query' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explain query' })).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle results panel')).toBeInTheDocument()
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument()
    expect(screen.getByLabelText('Lock workspace')).toBeInTheDocument()
    expect(screen.getByLabelText('Open diagnostics drawer')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Explorer view'))

    await waitFor(() => {
      expect(screen.getByLabelText('Refresh explorer')).toBeInTheDocument()
    })
  })

  it('switches sidebar activities without losing the active editor tab', async () => {
    render(<App />)

    await screen.findByLabelText('connections sidebar')

    fireEvent.click(screen.getByLabelText('Explorer view'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument()
    })
    expect(screen.getAllByRole('tab', { name: /Ops dashboard/i })[0]).toBeInTheDocument()
  })

  it('opens the connection drawer for editing', async () => {
    render(<App />)

    await screen.findByLabelText('connections sidebar')

    fireEvent.click(screen.getByRole('button', { name: 'Change connection' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Connection' })).toBeInTheDocument()
    })

    const drawer = screen.getByRole('button', { name: 'Save Connection' }).closest('aside')
    expect(drawer).not.toBeNull()
    expect(within(drawer!).getByRole('button', { name: 'Save Connection' })).toBeInTheDocument()
  })

  it('opens the command palette and runs a selected command', async () => {
    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    fireEvent.change(within(palette).getByLabelText('Search commands'), {
      target: { value: 'connection drawer' },
    })

    await waitFor(() => {
      expect(
        within(palette).getByRole('option', { name: /Open connection drawer/i }),
      ).toBeInTheDocument()
    })

    fireEvent.click(within(palette).getByRole('option', { name: /Open connection drawer/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Connection' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
  })

  it('supports workbench keyboard shortcuts', async () => {
    const executeSpy = vi.spyOn(desktopClient, 'executeQuery')
    render(<App />)

    await screen.findByLabelText('Bottom panel')

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryAllByLabelText('Bottom panel')).toHaveLength(0)
    })

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    await waitFor(() => {
      expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryAllByLabelText('connections sidebar')).toHaveLength(0)
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
      expect(screen.getByText('Confirmation required')).toBeInTheDocument()
    })

    expect(screen.queryByText('3 rows returned from SQL adapter preview.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and run' }))
    await waitFor(() => {
      expect(screen.getByText('3 rows returned from SQL adapter preview.')).toBeInTheDocument()
    })
  })

  it('shows keyboard shortcut help in diagnostics', async () => {
    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.click(screen.getByLabelText('Open diagnostics drawer'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Diagnostics' })).toBeInTheDocument()
    })
    expect(screen.getByText('Shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Ctrl K')).toBeInTheDocument()
  })

  it('saves, opens, and deletes saved query work', async () => {
    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.click(screen.getByLabelText('Saved Work view'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Saved Work' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Save current query'))

    await waitFor(() => {
      expect(screen.getByText('Saved Queries')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open saved work Redis hot key pack' }))

    await waitFor(() => {
      expect(screen.getAllByRole('tab', { name: /Redis hot key pack/i })[0]).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Saved Work view'))
    const savedWorkSidebar = screen.getByLabelText('saved-work sidebar')
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved work Redis hot key pack' }))

    await waitFor(() => {
      expect(within(savedWorkSidebar).queryByText('Redis hot key pack')).not.toBeInTheDocument()
    })
  })

  it('blocks privileged commands while the workspace is locked', async () => {
    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.click(screen.getByLabelText('Lock workspace'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unlock Workspace' })).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Unlock the workspace before using privileged desktop commands.',
      )
    })
    expect(screen.queryByText('Confirmation required')).not.toBeInTheDocument()
  })

  it('switches bottom panel views and can hide the panel', async () => {
    render(<App />)

    await screen.findByLabelText('Bottom panel')
    fireEvent.click(screen.getByRole('tab', { name: 'messages' }))

    await waitFor(() => {
      expect(screen.getByText('Logs and adapter notices.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Hide bottom panel'))
    await waitFor(() => {
      expect(screen.queryAllByLabelText('Bottom panel')).toHaveLength(0)
    })

    fireEvent.click(screen.getByLabelText('Show bottom panel'))
    await waitFor(() => {
      expect(screen.getByLabelText('Bottom panel')).toBeInTheDocument()
    })
  })

  it('keeps explorer load failures local to the explorer pane', async () => {
    vi.spyOn(desktopClient, 'loadExplorer').mockRejectedValueOnce(
      new Error('Explorer fixture unavailable'),
    )

    render(<App />)

    await screen.findByLabelText('connections sidebar')
    fireEvent.click(screen.getByLabelText('Explorer view'))

    const explorerSidebar = await screen.findByLabelText('explorer sidebar')

    await waitFor(() => {
      expect(
        within(explorerSidebar).getByText('Explorer fixture unavailable'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
