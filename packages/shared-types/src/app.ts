import type { AdapterManifest } from './capabilities'
import type {
  ConnectionProfile,
  EnvironmentProfile,
  ResolvedEnvironment,
} from './connection'
import type { AppPreferences, GuardrailDecision, LockState } from './security'
import type {
  ClosedQueryTabSnapshot,
  DiagnosticsReport,
  ExplorerNode,
  QueryTabState,
  SavedWorkItem,
} from './workspace'

export interface AppHealth {
  runtime: 'browser-preview' | 'tauri'
  adapterHost: 'scaffolded' | 'connected' | 'simulated'
  secretStorage: 'planned' | 'ready' | 'keyring' | 'file'
  platform: string
  telemetry: 'disabled' | 'opt-in'
}

export type UiActivity =
  | 'connections'
  | 'environments'
  | 'explorer'
  | 'saved-work'
  | 'search'
  | 'settings'

export type SidebarPane =
  | 'connections'
  | 'environments'
  | 'explorer'
  | 'saved-work'
  | 'search'

export type BottomPanelTab = 'results' | 'messages' | 'details'

export type RightDrawerView =
  | 'none'
  | 'connection'
  | 'inspection'
  | 'diagnostics'
  | 'operations'

export interface UiState {
  activeConnectionId: string
  activeEnvironmentId: string
  activeTabId: string
  explorerFilter: string
  explorerView: 'tree' | 'structure'
  activeActivity: UiActivity
  sidebarCollapsed: boolean
  activeSidebarPane: SidebarPane
  sidebarWidth: number
  bottomPanelVisible: boolean
  activeBottomPanelTab: BottomPanelTab
  bottomPanelHeight: number
  rightDrawer: RightDrawerView
  rightDrawerWidth: number
}

export interface WorkspaceSnapshot {
  schemaVersion: number
  connections: ConnectionProfile[]
  environments: EnvironmentProfile[]
  tabs: QueryTabState[]
  closedTabs: ClosedQueryTabSnapshot[]
  savedWork: SavedWorkItem[]
  explorerNodes: ExplorerNode[]
  adapterManifests: AdapterManifest[]
  preferences: AppPreferences
  guardrails: GuardrailDecision[]
  lockState: LockState
  ui: UiState
  updatedAt: string
}

export interface BootstrapPayload {
  health: AppHealth
  snapshot: WorkspaceSnapshot
  resolvedEnvironment: ResolvedEnvironment
  diagnostics: DiagnosticsReport
}

export interface ExportBundle {
  format: 'universality-bundle'
  version: number
  encryptedPayload: string
}
