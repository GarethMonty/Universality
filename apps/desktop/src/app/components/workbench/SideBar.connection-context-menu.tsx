import type { ConnectionProfile } from '@datapadplusplus/shared-types'
import {
  CopyIcon,
  ExplorerIcon,
  PlayIcon,
  RenameIcon,
  SettingsIcon,
  TrashIcon,
} from './icons'

export interface ConnectionContextMenuState {
  connectionId: string
  x: number
  y: number
}

export function ConnectionContextMenu({
  connection,
  position,
  onClose,
  onCreateTab,
  onDeleteConnection,
  onDuplicateConnection,
  onOpenConnectionDrawer,
  onOpenConnectionExplorer,
  onOpenConnectionOperations,
}: {
  connection: ConnectionProfile
  position: Pick<ConnectionContextMenuState, 'x' | 'y'>
  onClose(): void
  onCreateTab(connectionId?: string): void
  onDeleteConnection(connectionId: string): void
  onDuplicateConnection(connectionId: string): void
  onOpenConnectionDrawer(connectionId: string): void
  onOpenConnectionExplorer(connectionId: string): void
  onOpenConnectionOperations(connectionId: string): void
}) {
  const runAndClose = (action: () => void) => {
    onClose()
    action()
  }

  return (
    <div
      className="connection-context-menu"
      role="menu"
      aria-label={`Connection options for ${connection.name}`}
      style={{
        left: position.x,
        top: position.y,
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="connection-context-menu-item"
        aria-label={`Create query tab for ${connection.name}`}
        onClick={() => runAndClose(() => onCreateTab(connection.id))}
      >
        <PlayIcon className="connection-context-menu-icon" />
        <span>New Query</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="connection-context-menu-item"
        aria-label={`Open Explorer for ${connection.name}`}
        onClick={() => runAndClose(() => onOpenConnectionExplorer(connection.id))}
      >
        <ExplorerIcon className="connection-context-menu-icon" />
        <span>Open Explorer</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="connection-context-menu-item"
        aria-label={`Edit connection ${connection.name}`}
        onClick={() => runAndClose(() => onOpenConnectionDrawer(connection.id))}
      >
        <RenameIcon className="connection-context-menu-icon" />
        <span>Edit connection</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="connection-context-menu-item"
        aria-label={`Duplicate connection ${connection.name}`}
        onClick={() => runAndClose(() => onDuplicateConnection(connection.id))}
      >
        <CopyIcon className="connection-context-menu-icon" />
        <span>Duplicate</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="connection-context-menu-item"
        aria-label={`Open operations for ${connection.name}`}
        onClick={() => runAndClose(() => onOpenConnectionOperations(connection.id))}
      >
        <SettingsIcon className="connection-context-menu-icon" />
        <span>Operations</span>
      </button>
      <div className="connection-context-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="connection-context-menu-item connection-context-menu-item--danger"
        aria-label={`Delete connection ${connection.name}`}
        onClick={() => runAndClose(() => onDeleteConnection(connection.id))}
      >
        <TrashIcon className="connection-context-menu-icon" />
        <span>Delete</span>
      </button>
    </div>
  )
}
