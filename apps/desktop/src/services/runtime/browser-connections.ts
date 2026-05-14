import type { ConnectionProfile, EnvironmentProfile, WorkspaceSnapshot } from '@datapadplusplus/shared-types'
import { cloneSnapshot } from './browser-store'
import { createQueryTabForConnection } from './browser-tabs'

export function setActiveConnection(
  snapshot: WorkspaceSnapshot,
  connectionId: string,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const connection =
    next.connections.find((item) => item.id === connectionId) ?? next.connections[0]

  if (!connection) {
    return next
  }

  const tab = next.tabs.find((item) => item.connectionId === connection.id)

  next.ui.activeConnectionId = connection.id
  next.ui.activeEnvironmentId =
    tab?.environmentId ?? connection.environmentIds[0] ?? next.ui.activeEnvironmentId
  next.ui.activeTabId = tab?.id ?? ''
  next.updatedAt = new Date().toISOString()
  return next
}



export function upsertConnection(
  snapshot: WorkspaceSnapshot,
  profile: ConnectionProfile,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const index = next.connections.findIndex((item) => item.id === profile.id)

  if (index >= 0) {
    next.connections[index] = profile
  } else {
    next.connections.push(profile)
  }

  next.updatedAt = new Date().toISOString()
  return next
}



export function deleteConnection(
  snapshot: WorkspaceSnapshot,
  connectionId: string,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)

  next.connections = next.connections.filter((connection) => connection.id !== connectionId)
  next.tabs = next.tabs.filter((tab) => tab.connectionId !== connectionId)

  if (next.tabs.length === 0 && next.connections[0]) {
    const connection = next.connections[0]
    next.tabs.push(createQueryTabForConnection(next, connection, false))
  }

  const activeTab =
    next.tabs.find((tab) => tab.id === next.ui.activeTabId) ?? next.tabs[0]

  if (activeTab) {
    next.ui.activeConnectionId = activeTab.connectionId
    next.ui.activeEnvironmentId = activeTab.environmentId
    next.ui.activeTabId = activeTab.id
  } else {
    next.ui.activeConnectionId = ''
    next.ui.activeEnvironmentId = ''
    next.ui.activeTabId = ''
    next.ui.bottomPanelVisible = false
    next.ui.rightDrawer = 'none'
  }

  next.updatedAt = new Date().toISOString()
  return next
}



export function upsertEnvironment(
  snapshot: WorkspaceSnapshot,
  profile: EnvironmentProfile,
): WorkspaceSnapshot {
  const next = cloneSnapshot(snapshot)
  const index = next.environments.findIndex((item) => item.id === profile.id)

  if (index >= 0) {
    next.environments[index] = profile
  } else {
    next.environments.push(profile)
  }

  next.updatedAt = new Date().toISOString()
  return next
}

