import type {
  ConnectionProfile,
  QueryTabState,
  WorkspaceSnapshot,
} from '@datapadplusplus/shared-types'
import { describe, expect, it } from 'vitest'
import { openLibraryItem, setLibraryNodeEnvironment } from './browser-library'

describe('browser Library runtime', () => {
  it('selects an already-open library item instead of opening a duplicate tab', () => {
    const snapshot = workspaceSnapshot()

    const next = openLibraryItem(snapshot, 'library-query-1')

    expect(next.tabs).toHaveLength(1)
    expect(next.ui.activeTabId).toBe('tab-existing')
    expect(next.ui.activeConnectionId).toBe('connection-1')
    expect(next.ui.activeEnvironmentId).toBe('environment-1')
  })

  it('sets and clears direct library environments', () => {
    const snapshot = workspaceSnapshot()
    snapshot.environments.push({
      id: 'environment-2',
      label: 'Prod',
      color: '#e06c75',
      risk: 'high',
      variables: {},
      sensitiveKeys: [],
      requiresConfirmation: true,
      safeMode: true,
      exportable: false,
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
    })

    const assigned = setLibraryNodeEnvironment(snapshot, {
      nodeId: 'library-query-1',
      environmentId: 'environment-2',
    })

    expect(assigned.libraryNodes[0]?.environmentId).toBe('environment-2')

    const cleared = setLibraryNodeEnvironment(assigned, {
      nodeId: 'library-query-1',
      environmentId: undefined,
    })

    expect(cleared.libraryNodes[0]?.environmentId).toBeUndefined()
  })

  it('opens library items with the nearest parent environment', () => {
    const snapshot = workspaceSnapshot()
    snapshot.tabs = []
    snapshot.environments.push(
      {
        id: 'environment-1',
        label: 'Dev',
        color: '#2dbf9b',
        risk: 'low',
        variables: {},
        sensitiveKeys: [],
        requiresConfirmation: false,
        safeMode: false,
        exportable: true,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
      },
      {
        id: 'environment-2',
        label: 'Prod',
        color: '#e06c75',
        risk: 'high',
        variables: {},
        sensitiveKeys: [],
        requiresConfirmation: true,
        safeMode: true,
        exportable: false,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
      },
    )
    snapshot.libraryNodes = [
      {
        id: 'folder-top',
        kind: 'folder',
        name: 'Top',
        tags: [],
        environmentId: 'environment-1',
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
      },
      {
        id: 'folder-child',
        kind: 'folder',
        parentId: 'folder-top',
        name: 'Child',
        tags: [],
        environmentId: 'environment-2',
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
      },
      {
        id: 'library-query-1',
        kind: 'query',
        parentId: 'folder-child',
        name: 'Orders',
        tags: [],
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        connectionId: 'connection-1',
        language: 'sql',
        queryText: 'select 1;',
      },
    ]

    const next = openLibraryItem(snapshot, 'library-query-1')

    expect(next.tabs[0]?.environmentId).toBe('environment-2')
  })
})

function workspaceSnapshot(): WorkspaceSnapshot {
  const connection: ConnectionProfile = {
    id: 'connection-1',
    name: 'Fixture PostgreSQL',
    engine: 'postgresql',
    family: 'sql',
    host: 'localhost',
    port: 5432,
    database: 'catalog',
    environmentIds: ['environment-1'],
    tags: [],
    favorite: false,
    readOnly: false,
    icon: 'postgresql',
    auth: {},
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
  }
  const existingTab: QueryTabState = {
    id: 'tab-existing',
    title: 'Orders',
    connectionId: connection.id,
    environmentId: 'environment-1',
    family: connection.family,
    language: 'sql',
    editorLabel: 'SQL',
    queryText: 'select 1;',
    status: 'idle',
    dirty: false,
    history: [],
    saveTarget: { kind: 'library', libraryItemId: 'library-query-1' },
    savedQueryId: 'library-query-1',
  }

  return {
    schemaVersion: 3,
    connections: [connection],
    environments: [],
    tabs: [existingTab],
    closedTabs: [],
    libraryNodes: [
      {
        id: 'library-query-1',
        kind: 'query',
        parentId: 'library-root-queries',
        name: 'Orders',
        tags: [],
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        connectionId: connection.id,
        environmentId: 'environment-1',
        language: 'sql',
        queryText: 'select 1;',
      },
    ],
    savedWork: [],
    explorerNodes: [],
    adapterManifests: [],
    preferences: {
      theme: 'dark',
      telemetry: 'disabled',
      lockAfterMinutes: 0,
      safeModeEnabled: true,
    },
    guardrails: [],
    lockState: { isLocked: false },
    ui: {
      activeConnectionId: '',
      activeEnvironmentId: '',
      activeTabId: '',
      explorerFilter: '',
      explorerView: 'tree',
      connectionGroupMode: 'none',
      sidebarSectionStates: {},
      activeActivity: 'library',
      sidebarCollapsed: false,
      activeSidebarPane: 'library',
      sidebarWidth: 320,
      bottomPanelVisible: true,
      activeBottomPanelTab: 'results',
      bottomPanelHeight: 260,
      rightDrawer: 'none',
      rightDrawerWidth: 360,
    },
    updatedAt: '2026-05-14T00:00:00.000Z',
  }
}
