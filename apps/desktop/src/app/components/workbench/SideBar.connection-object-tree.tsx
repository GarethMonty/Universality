import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ConnectionProfile, ScopedQueryTarget } from '@datanaut/shared-types'
import { ChevronDownIcon, ChevronRightIcon } from './icons'
import {
  buildConnectionObjectTree,
  connectionTreeNodeTarget,
  isScopedQueryable,
} from './SideBar.helpers'
import { ExplorerNodeIcon } from './SideBar.node-icons'
import type { ConnectionTreeNode } from './SideBar.helpers'

export function ConnectionObjectTree({
  connection,
  onOpenScopedQuery,
}: {
  connection: ConnectionProfile
  onOpenScopedQuery(connectionId: string, target: ScopedQueryTarget): void
}) {
  const nodes = useMemo(() => buildConnectionObjectTree(connection), [connection])
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const toggleNode = (nodeKey: string) =>
    setExpandedNodes((current) => ({
      ...current,
      [nodeKey]: !current[nodeKey],
    }))
  const openNodeQuery = (node: ConnectionTreeNode) => {
    if (!isScopedQueryable(node)) {
      return
    }

    onOpenScopedQuery(connection.id, connectionTreeNodeTarget(node))
  }

  return (
    <div className="connection-object-tree" role="tree" aria-label={`${connection.name} objects`}>
      {nodes.map((node) => (
        <ConnectionObjectTreeNode
          key={node.id}
          depth={1}
          expandedNodes={expandedNodes}
          node={node}
          nodeKey={node.id}
          onOpenQuery={openNodeQuery}
          onToggleNode={toggleNode}
        />
      ))}
    </div>
  )
}

function ConnectionObjectTreeNode({
  depth,
  expandedNodes,
  node,
  nodeKey,
  onOpenQuery,
  onToggleNode,
}: {
  depth: number
  expandedNodes: Record<string, boolean>
  node: ConnectionTreeNode
  nodeKey: string
  onOpenQuery(node: ConnectionTreeNode): void
  onToggleNode(nodeKey: string): void
}) {
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const expanded = Boolean(expandedNodes[nodeKey])
  const toggleNode = () => {
    if (hasChildren) {
      onToggleNode(nodeKey)
    }
  }

  return (
    <>
      <div
        role="treeitem"
        tabIndex={hasChildren ? 0 : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={depth}
        className={`tree-item connection-object-item${hasChildren ? ' is-branch' : ''}`}
        style={{ '--tree-depth': depth } as CSSProperties}
        title={node.detail ? `${node.label}: ${node.detail}` : node.label}
        onClick={toggleNode}
        onDoubleClick={() => onOpenQuery(node)}
        onKeyDown={(event) => {
          if (hasChildren && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            toggleNode()
          }
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="tree-item-chevron tree-item-chevron-button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
            title={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleNode(nodeKey)
            }}
          >
            {expanded ? (
              <ChevronDownIcon className="tree-icon" />
            ) : (
              <ChevronRightIcon className="tree-icon" />
            )}
          </button>
        ) : (
          <span className="tree-item-chevron">
            <span className="tree-icon tree-icon--spacer" />
          </span>
        )}
        <span className="tree-item-badge tree-item-badge--ghost">
          <ExplorerNodeIcon kind={node.kind} />
        </span>
        <span className="tree-item-content">
          <strong>{node.label}</strong>
          <span>
            {node.kind}
            {node.detail ? ` / ${node.detail}` : ''}
          </span>
        </span>
      </div>

      {expanded
        ? children.map((child) => {
            const childKey = `${nodeKey}/${child.id}`

            return (
              <ConnectionObjectTreeNode
                key={childKey}
                depth={depth + 1}
                expandedNodes={expandedNodes}
                node={child}
                nodeKey={childKey}
                onOpenQuery={onOpenQuery}
                onToggleNode={onToggleNode}
              />
            )
          })
        : null}
    </>
  )
}
