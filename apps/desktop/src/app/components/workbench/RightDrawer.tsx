import { useRef, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import type {
  AppHealth,
  ConnectionProfile,
  ConnectionTestResult,
  DiagnosticsReport,
  EnvironmentProfile,
  ExecutionCapabilities,
  ExplorerInspectResponse,
  ExportBundle,
  LocalDatabaseCreateRequest,
  LocalDatabaseCreateResult,
  LocalDatabasePickRequest,
  LocalDatabasePickResult,
  OperationExecutionRequest,
  OperationExecutionResponse,
  OperationManifestRequest,
  OperationManifestResponse,
  OperationPlanRequest,
  OperationPlanResponse,
  RightDrawerView,
  WorkspaceSnapshot,
} from '@datanaut/shared-types'
import { ConnectionsIcon, SettingsIcon } from './icons'
import { ConnectionBlade } from './RightDrawer.connection-blade'
import { DiagnosticsBlade } from './RightDrawer.diagnostics-blade'
import { InspectionBlade } from './RightDrawer.inspection-blade'
import { OperationsBlade } from './RightDrawer.operations-blade'
import { DrawerHeader } from './RightDrawer.primitives'

interface RightDrawerProps {
  view: RightDrawerView
  width: number
  health: AppHealth
  theme: WorkspaceSnapshot['preferences']['theme']
  activeConnection?: ConnectionProfile
  activeEnvironment?: EnvironmentProfile
  environments: EnvironmentProfile[]
  connectionTest?: ConnectionTestResult
  diagnostics?: DiagnosticsReport
  explorerInspection?: ExplorerInspectResponse
  exportBundle?: ExportBundle
  capabilities: ExecutionCapabilities
  exportPassphrase: string
  importPayload: string
  onExportPassphraseChange(value: string): void
  onImportPayloadChange(value: string): void
  onClose(): void
  onSaveConnection(profile: ConnectionProfile, secret?: string): void
  onTestConnection(profile: ConnectionProfile, environmentId: string): void
  onRefreshDiagnostics(): void
  onExportWorkspace(): void
  onImportWorkspace(): void
  onApplyTemplate(queryTemplate?: string): void
  onListOperations(
    request: OperationManifestRequest,
  ): Promise<OperationManifestResponse | undefined>
  onPlanOperation(
    request: OperationPlanRequest,
  ): Promise<OperationPlanResponse | undefined>
  onExecuteOperation(
    request: OperationExecutionRequest,
  ): Promise<OperationExecutionResponse | undefined>
  onToggleTheme(): void
  onPickLocalDatabaseFile(request: LocalDatabasePickRequest): Promise<LocalDatabasePickResult>
  onCreateLocalDatabase(
    request: LocalDatabaseCreateRequest,
  ): Promise<LocalDatabaseCreateResult | undefined>
  onResize(width: number): void
}

export function RightDrawer({
  view,
  width,
  health,
  theme,
  activeConnection,
  activeEnvironment,
  environments,
  connectionTest,
  diagnostics,
  explorerInspection,
  exportBundle,
  capabilities,
  exportPassphrase,
  importPayload,
  onExportPassphraseChange,
  onImportPayloadChange,
  onClose,
  onSaveConnection,
  onTestConnection,
  onRefreshDiagnostics,
  onExportWorkspace,
  onImportWorkspace,
  onApplyTemplate,
  onListOperations,
  onPlanOperation,
  onExecuteOperation,
  onToggleTheme,
  onPickLocalDatabaseFile,
  onCreateLocalDatabase,
  onResize,
}: RightDrawerProps) {
  const [isResizing, setIsResizing] = useState(false)
  const lastPointerX = useRef(0)

  return (
    <aside className="workbench-drawer" aria-label={`${view} drawer`}>
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize right drawer"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={560}
        aria-valuenow={width}
        className={`pane-resize-handle pane-resize-handle--drawer${isResizing ? ' is-active' : ''}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          lastPointerX.current = event.clientX
          setIsResizing(true)
        }}
        onPointerMove={(event) => {
          if (!isResizing) {
            return
          }

          const delta = lastPointerX.current - event.clientX
          lastPointerX.current = event.clientX
          onResize(width + delta)
        }}
        onPointerUp={() => setIsResizing(false)}
        onPointerCancel={() => setIsResizing(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            onResize(width + 16)
          }

          if (event.key === 'ArrowRight') {
            event.preventDefault()
            onResize(width - 16)
          }
        }}
      />

      {view === 'connection' ? (
        activeConnection ? (
          <ConnectionBlade
            activeConnection={activeConnection}
            environments={environments}
            connectionTest={connectionTest}
            onClose={onClose}
            onSaveConnection={onSaveConnection}
            onTestConnection={onTestConnection}
            onPickLocalDatabaseFile={onPickLocalDatabaseFile}
            onCreateLocalDatabase={onCreateLocalDatabase}
          />
        ) : (
          <DrawerPlaceholder
            copy="Create a connection first to edit profile details."
            icon={ConnectionsIcon}
            title="No Connection"
            onClose={onClose}
          />
        )
      ) : null}

      {view === 'inspection' ? (
        <InspectionBlade
          capabilities={capabilities}
          inspection={explorerInspection}
          onApplyTemplate={onApplyTemplate}
          onClose={onClose}
        />
      ) : null}

      {view === 'diagnostics' ? (
        <DiagnosticsBlade
          diagnostics={diagnostics}
          exportBundle={exportBundle}
          exportPassphrase={exportPassphrase}
          health={health}
          importPayload={importPayload}
          theme={theme}
          onClose={onClose}
          onExportPassphraseChange={onExportPassphraseChange}
          onExportWorkspace={onExportWorkspace}
          onImportPayloadChange={onImportPayloadChange}
          onImportWorkspace={onImportWorkspace}
          onRefreshDiagnostics={onRefreshDiagnostics}
          onToggleTheme={onToggleTheme}
        />
      ) : null}

      {view === 'operations' ? (
        activeConnection && activeEnvironment ? (
          <OperationsBlade
            activeConnection={activeConnection}
            activeEnvironment={activeEnvironment}
            onApplyTemplate={onApplyTemplate}
            onClose={onClose}
            onExecuteOperation={onExecuteOperation}
            onListOperations={onListOperations}
            onPlanOperation={onPlanOperation}
          />
        ) : (
          <DrawerPlaceholder
            copy="Select a connection and environment before opening operation actions."
            icon={SettingsIcon}
            title="No Operation Context"
            onClose={onClose}
          />
        )
      ) : null}
    </aside>
  )
}

function DrawerPlaceholder({
  copy,
  icon,
  title,
  onClose,
}: {
  copy: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  onClose(): void
}) {
  return (
    <>
      <DrawerHeader title={title} subtitle="Workspace" icon={icon} onClose={onClose} />
      <div className="drawer-scroll">
        <div className="drawer-section">
          <p className="drawer-copy">{copy}</p>
        </div>
      </div>
    </>
  )
}
