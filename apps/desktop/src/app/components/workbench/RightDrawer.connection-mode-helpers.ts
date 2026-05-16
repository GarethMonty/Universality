import type { ConnectionMode } from '@datapadplusplus/shared-types'

export function normalizeConnectionMode(
  modes: readonly ConnectionMode[],
  current?: ConnectionMode,
) {
  if (current && modes.includes(current)) {
    return current
  }

  return modes[0] ?? 'native'
}
