import { clientAdapters } from './client-adapters'
import { clientConnections } from './client-connections'
import { clientExecution } from './client-execution'
import { clientSavedWork } from './client-saved-work'
import { clientTabs } from './client-tabs'
import { clientWorkspace } from './client-workspace'

export const desktopClient = {
  ...clientWorkspace,
  ...clientConnections,
  ...clientTabs,
  ...clientSavedWork,
  ...clientAdapters,
  ...clientExecution,
}
