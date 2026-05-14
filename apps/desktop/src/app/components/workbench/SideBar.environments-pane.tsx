import type { CSSProperties } from 'react'
import type { EnvironmentProfile } from '@datanaut/shared-types'
import {
  ChevronRightIcon,
  EnvironmentsIcon,
  PlusIcon,
  ReadOnlyIcon,
} from './icons'

export function EnvironmentsPane({
  activeEnvironmentId,
  environmentFilter,
  environments,
  onCreateEnvironment,
  onEnvironmentFilterChange,
  onSelectEnvironment,
}: {
  activeEnvironmentId: string
  environmentFilter: string
  environments: EnvironmentProfile[]
  onCreateEnvironment(): void
  onEnvironmentFilterChange(value: string): void
  onSelectEnvironment(environmentId: string): void
}) {
  return (
    <>
      <div className="sidebar-header">
        <h1>Environments</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label="New environment"
            title="Create a new environment with variables, color, and risk settings."
            onClick={onCreateEnvironment}
          >
            <PlusIcon className="sidebar-icon" />
          </button>
        </div>
      </div>

      <label className="sidebar-search">
        <span className="sr-only">Search environments</span>
        <input
          type="search"
          placeholder="Search environments"
          value={environmentFilter}
          onChange={(event) => onEnvironmentFilterChange(event.target.value)}
        />
      </label>

      <div className="sidebar-scroll">
        {environments.length === 0 ? (
          <div className="sidebar-empty">
            <EnvironmentsIcon className="empty-icon" />
            <p>No environments yet.</p>
            <button type="button" className="sidebar-empty-action" onClick={onCreateEnvironment}>
              New Environment
            </button>
          </div>
        ) : null}

        {environments.map((environment) => (
          <button
            key={environment.id}
            type="button"
            className={`tree-item${environment.id === activeEnvironmentId ? ' is-active' : ''}`}
            title={`${environment.label}: edit variables, secret flags, color, and ${environment.risk} risk guardrails.`}
            onClick={() => onSelectEnvironment(environment.id)}
          >
            <span className="tree-item-chevron">
              <ChevronRightIcon className="tree-icon tree-icon--muted" />
            </span>
            <span
              className="tree-item-badge tree-item-badge--swatch"
              style={{ '--environment-color': environment.color } as CSSProperties}
            >
              <EnvironmentsIcon className="tree-icon" />
            </span>
            <span className="tree-item-content">
              <strong>{environment.label}</strong>
              <span>
                {environment.risk} / {Object.keys(environment.variables).length} vars
              </span>
            </span>
            <span className="tree-item-flags">
              {environment.requiresConfirmation ? (
                <ReadOnlyIcon className="tree-flag-icon" aria-label="Requires confirmation" />
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
