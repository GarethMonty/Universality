import type {
  AdapterDiagnosticsRequest,
  AdapterDiagnosticsResponse,
  PermissionInspectionRequest,
  PermissionInspectionResponse,
  WorkspaceSnapshot,
} from '@datapadplusplus/shared-types'
import { datastoreBacklogByEngine } from '@datapadplusplus/shared-types'
import { buildOperationManifestsForConnection } from './browser-operation-manifests'
import { findConnection } from './browser-store'

export function inspectPermissionsLocally(
  snapshot: WorkspaceSnapshot,
  request: PermissionInspectionRequest,
): PermissionInspectionResponse {
  const connection = findConnection(snapshot, request.connectionId)

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  const operations = buildOperationManifestsForConnection(connection)
  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    inspection: {
      engine: connection.engine,
      principal: connection.auth.username ?? connection.auth.principal,
      effectiveRoles: connection.readOnly ? ['read-only-profile'] : ['profile-default'],
      effectivePrivileges: connection.readOnly
        ? ['metadata:read', 'query:read']
        : ['metadata:read', 'query:read', 'operation:plan'],
      iamSignals: connection.connectionMode?.startsWith('cloud')
        ? ['cloud-identity-profile']
        : [],
      unavailableActions: operations
        .filter((operation) =>
          connection.readOnly
            ? ['write', 'destructive', 'costly'].includes(operation.risk)
            : operation.previewOnly && operation.risk === 'destructive',
        )
        .map((operation) => ({
          operationId: operation.id,
          reason: connection.readOnly
            ? 'Connection profile is read-only.'
            : 'Destructive beta operations require live permission checks before execution.',
        })),
      warnings: ['Permission inspection is preview-normalized in browser mode.'],
    },
  }
}

export function collectDiagnosticsLocally(
  snapshot: WorkspaceSnapshot,
  request: AdapterDiagnosticsRequest,
): AdapterDiagnosticsResponse {
  const connection = findConnection(snapshot, request.connectionId)

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    diagnostics: {
      engine: connection.engine,
      plans: [
        {
          renderer: 'plan',
          format: 'json',
          value: { engine: connection.engine, scope: request.scope ?? 'connection' },
          summary: 'Preview plan payload.',
        },
      ],
      profiles: [
        {
          renderer: 'profile',
          summary: 'Preview profile payload.',
          stages: [{ name: 'preview', durationMs: 0, rows: 0 }],
        },
      ],
      metrics: [
        {
          renderer: 'metrics',
          metrics: [
            {
              name: 'preview.capabilities',
              value: datastoreBacklogByEngine(connection.engine)?.capabilities.length ?? 0,
              unit: 'capabilities',
              labels: { engine: connection.engine },
            },
          ],
        },
      ],
      queryHistory: [
        {
          renderer: 'json',
          value: { message: 'Preview query history normalizes engine-specific history APIs.' },
        },
      ],
      costEstimates: [
        {
          renderer: 'costEstimate',
          estimatedBytes: 0,
          estimatedCredits: 0,
          estimatedCost: 0,
          details: { dryRunRequired: true },
        },
      ],
      warnings: ['Browser preview diagnostics do not contact live engines.'],
    },
  }
}
