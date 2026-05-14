import { useState } from 'react'
import type { ConnectionGroupMode } from '@datapadplusplus/shared-types'
import {
  ChevronDownIcon,
  ConnectionsIcon,
  DatabaseIcon,
  EnvironmentsIcon,
} from './icons'

const CONNECTION_GROUP_OPTIONS = [
  {
    mode: 'none',
    label: 'None',
    description: 'Show all connections in one list',
    Icon: ConnectionsIcon,
  },
  {
    mode: 'environment',
    label: 'Environment',
    description: 'Group by workspace environment',
    Icon: EnvironmentsIcon,
  },
  {
    mode: 'database-type',
    label: 'Type',
    description: 'Group by datastore family',
    Icon: DatabaseIcon,
  },
] as const satisfies ReadonlyArray<{
  mode: ConnectionGroupMode
  label: string
  description: string
  Icon: typeof ConnectionsIcon
}>

interface ConnectionsHeaderProps {
  onCreateConnection(): void
}

export function ConnectionsHeader({ onCreateConnection }: ConnectionsHeaderProps) {
  return (
    <div className="sidebar-header">
      <h1>Connections</h1>
      <div className="sidebar-actions">
        <button
          type="button"
          className="sidebar-icon-button"
          aria-label="New connection"
          title="Create a new datastore connection profile."
          onClick={onCreateConnection}
        >
          <ConnectionsIcon className="sidebar-icon" />
        </button>
      </div>
    </div>
  )
}

interface ConnectionGroupDropdownProps {
  connectionGroupMode: ConnectionGroupMode
  onConnectionGroupModeChange(value: ConnectionGroupMode): void
}

export function ConnectionGroupDropdown({
  connectionGroupMode,
  onConnectionGroupModeChange,
}: ConnectionGroupDropdownProps) {
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false)
  const activeGroupOption =
    CONNECTION_GROUP_OPTIONS.find((option) => option.mode === connectionGroupMode) ??
    CONNECTION_GROUP_OPTIONS[0]
  const ActiveGroupIcon = activeGroupOption.Icon

  return (
    <div
      className="sidebar-group-dropdown"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setGroupDropdownOpen(false)
        }
      }}
    >
      <button
        type="button"
        className="sidebar-group-trigger"
        aria-haspopup="menu"
        aria-expanded={groupDropdownOpen}
        aria-label={`Group connections: ${activeGroupOption.label}`}
        title="Choose how the connection list is grouped."
        onClick={() => setGroupDropdownOpen((current) => !current)}
      >
        <ActiveGroupIcon className="sidebar-group-icon" />
        <span>{activeGroupOption.label}</span>
        <ChevronDownIcon className="sidebar-group-chevron" />
      </button>

      {groupDropdownOpen ? (
        <div className="sidebar-group-menu" role="menu" aria-label="Connection grouping">
          {CONNECTION_GROUP_OPTIONS.map((option) => {
            const OptionIcon = option.Icon
            const selected = option.mode === connectionGroupMode

            return (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`sidebar-group-menu-item${selected ? ' is-active' : ''}`}
                onClick={() => {
                  onConnectionGroupModeChange(option.mode)
                  setGroupDropdownOpen(false)
                }}
              >
                <OptionIcon className="sidebar-group-icon" />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
