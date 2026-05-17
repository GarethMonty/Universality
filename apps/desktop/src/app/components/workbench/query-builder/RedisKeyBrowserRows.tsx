import type { CSSProperties } from 'react'
import { TrashIcon } from '../icons'
import { redisKeyTypeLabel } from './redis-key-browser'
import type { RedisTreeRow } from './redis-key-browser-tree'

interface RedisKeyBrowserRowsProps {
  rows: RedisTreeRow[]
  selectedKey?: string
  expandedPrefixes: Set<string>
  onTogglePrefix(prefix: string): void
  onSelectKey(key: string): void
  onDeleteKey(key: string): void
}

export function RedisKeyBrowserRows({
  rows,
  selectedKey,
  expandedPrefixes,
  onTogglePrefix,
  onSelectKey,
  onDeleteKey,
}: RedisKeyBrowserRowsProps) {
  return (
    <div className="redis-browser-table" role="treegrid" aria-rowcount={rows.length}>
      <div className="redis-browser-row redis-browser-row--header" role="row">
        <span>Key</span>
        <span>Type</span>
        <span>TTL</span>
        <span>Memory</span>
        <span>Length</span>
        <span />
      </div>
      <div className="redis-browser-rows">
        {rows.map((row) =>
          row.kind === 'prefix' ? (
            <RedisPrefixRow
              key={row.id}
              row={row}
              expanded={expandedPrefixes.has(row.id)}
              onTogglePrefix={onTogglePrefix}
            />
          ) : (
            <RedisKeyRow
              key={row.key.key}
              row={row}
              selected={selectedKey === row.key.key}
              onDeleteKey={onDeleteKey}
              onSelectKey={onSelectKey}
            />
          ),
        )}
      </div>
    </div>
  )
}

function RedisPrefixRow({
  expanded,
  row,
  onTogglePrefix,
}: {
  expanded: boolean
  row: Extract<RedisTreeRow, { kind: 'prefix' }>
  onTogglePrefix(prefix: string): void
}) {
  return (
    <button
      type="button"
      className="redis-browser-row redis-browser-row--prefix"
      style={{ '--redis-row-depth': row.depth } as CSSProperties}
      onClick={() => onTogglePrefix(row.id)}
    >
      <span>
        {expanded ? 'v' : '>'} {row.label}
      </span>
      <span />
      <span />
      <span />
      <span>{row.count}</span>
      <span />
    </button>
  )
}

function RedisKeyRow({
  row,
  selected,
  onDeleteKey,
  onSelectKey,
}: {
  row: Extract<RedisTreeRow, { kind: 'key' }>
  selected: boolean
  onDeleteKey(key: string): void
  onSelectKey(key: string): void
}) {
  return (
    <div
      className={`redis-browser-row redis-browser-row--key${selected ? ' is-selected' : ''}`}
      style={{ '--redis-row-depth': row.depth } as CSSProperties}
      role="row"
      onClick={() => onSelectKey(row.key.key)}
      onContextMenu={(event) => {
        event.preventDefault()
        onSelectKey(row.key.key)
      }}
      onDoubleClick={() => onSelectKey(row.key.key)}
    >
      <button type="button" className="redis-browser-key" onClick={() => onSelectKey(row.key.key)}>
        {row.key.key}
      </button>
      <span className={`redis-type-badge is-${row.key.type}`}>{redisKeyTypeLabel(row.key.type)}</span>
      <span>{row.key.ttlLabel ?? 'No limit'}</span>
      <span>{row.key.memoryUsageLabel ?? ''}</span>
      <span>{row.key.length ?? ''}</span>
      <button
        type="button"
        className="toolbar-icon-action"
        aria-label={`Delete ${row.key.key}`}
        title="Delete key"
        onClick={(event) => {
          event.stopPropagation()
          onDeleteKey(row.key.key)
        }}
      >
        <TrashIcon className="toolbar-icon" />
      </button>
    </div>
  )
}
