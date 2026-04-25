import type {
  AdapterManifest,
  AppHealth,
  AppPreferences,
  BootstrapPayload,
  DiagnosticsReport,
  WorkspaceSnapshot,
} from '@universality/shared-types'
import { UNIVERSALITY_ADAPTER_MANIFESTS } from '@universality/shared-types'
import { buildDiagnosticsReport, resolveEnvironment } from '../state/helpers'

export const EMPTY_WORKSPACE_SCHEMA_VERSION = 6

export const adapterManifests: AdapterManifest[] = UNIVERSALITY_ADAPTER_MANIFESTS

export const defaultPreferences: AppPreferences = {
  theme: 'dark',
  telemetry: 'opt-in',
  lockAfterMinutes: 15,
  safeModeEnabled: true,
  commandPaletteEnabled: true,
}

export function createBlankSnapshot(): WorkspaceSnapshot {
  const timestamp = new Date().toISOString()

  return {
    schemaVersion: EMPTY_WORKSPACE_SCHEMA_VERSION,
    connections: [],
    environments: [],
    tabs: [],
    closedTabs: [],
    savedWork: [],
    explorerNodes: [],
    adapterManifests,
    preferences: defaultPreferences,
    guardrails: [],
    lockState: {
      isLocked: false,
    },
    ui: {
      activeConnectionId: '',
      activeEnvironmentId: '',
      activeTabId: '',
      explorerFilter: '',
      explorerView: 'structure',
      activeActivity: 'connections',
      sidebarCollapsed: false,
      activeSidebarPane: 'connections',
      sidebarWidth: 280,
      bottomPanelVisible: false,
      activeBottomPanelTab: 'results',
      bottomPanelHeight: 260,
      rightDrawer: 'none',
      rightDrawerWidth: 360,
    },
    updatedAt: timestamp,
  }
}

export function createBrowserPreviewHealth(): AppHealth {
  return {
    runtime: 'browser-preview',
    adapterHost: 'simulated',
    secretStorage: 'planned',
    platform: 'web',
    telemetry: 'opt-in',
  }
}

export function createBlankBootstrapPayload(): BootstrapPayload {
  const snapshot = createBlankSnapshot()
  const health = createBrowserPreviewHealth()

  return {
    health,
    snapshot,
    resolvedEnvironment: resolveEnvironment(
      snapshot.environments,
      snapshot.ui.activeEnvironmentId,
    ),
    diagnostics: buildDiagnosticsReport(snapshot, health),
  }
}

export function createDiagnosticsReport(
  snapshot: WorkspaceSnapshot,
  health: AppHealth,
): DiagnosticsReport {
  return buildDiagnosticsReport(snapshot, health)
}
