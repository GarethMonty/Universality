import type { OperationExecutionRequest, OperationExecutionResponse, OperationPlanRequest, OperationPlanResponse, WorkspaceSnapshot } from '@datanaut/shared-types'
import { defaultQueryTextForConnection, languageForConnection } from '../../app/state/helpers'
import { buildOperationManifestsForConnection } from './browser-operation-manifests'
import { collectDiagnosticsLocally, inspectPermissionsLocally } from './browser-operation-inspection'
import { findConnection } from './browser-store'

export { buildOperationManifestsForConnection } from './browser-operation-manifests'
export { collectDiagnosticsLocally, inspectPermissionsLocally } from './browser-operation-inspection'

export function planOperationLocally(
  snapshot: WorkspaceSnapshot,
  request: OperationPlanRequest,
): OperationPlanResponse {
  const connection = findConnection(snapshot, request.connectionId)

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  const destructive =
    request.operationId.includes('.drop') ||
    request.operationId.includes('backup') ||
    request.operationId.includes('restore')
  const costly =
    destructive ||
    request.operationId.includes('.profile') ||
    request.operationId.includes('metrics')

  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    plan: {
      operationId: request.operationId,
      engine: connection.engine,
      summary: `Preview operation plan prepared for ${connection.name}.`,
      generatedRequest:
        request.objectName && connection.family === 'sql'
          ? `select * from ${request.objectName} limit 100;`
          : defaultQueryTextForConnection(connection),
      requestLanguage: languageForConnection(connection),
      destructive,
      estimatedCost: costly
        ? 'Unknown until a live dry run/profile is available.'
        : 'No material cost expected in preview mode.',
      estimatedScanImpact: costly
        ? 'May scan data or execute workload depending on the engine.'
        : 'Metadata/read preview only.',
      requiredPermissions: destructive
        ? ['owner/admin role or equivalent destructive privilege']
        : ['read metadata/query privilege'],
      confirmationText: destructive || costly ? `CONFIRM ${connection.engine.toUpperCase()}` : undefined,
      warnings: [
        'Preview mode generates guarded operation plans without mutating the datastore.',
      ],
    },
  }
}

export function executeOperationLocally(
  snapshot: WorkspaceSnapshot,
  request: OperationExecutionRequest,
): OperationExecutionResponse {
  const planResponse = planOperationLocally(snapshot, request)
  const connection = findConnection(snapshot, request.connectionId)
  const operation = connection
    ? buildOperationManifestsForConnection(connection).find(
        (item) => item.id === request.operationId,
      )
    : undefined
  const executionSupport = operation?.executionSupport ?? 'unsupported'
  const warnings = [...planResponse.plan.warnings]
  const messages: string[] = []

  if (!connection) {
    throw new Error('Connection was not found.')
  }

  if (
    connection.readOnly &&
    operation &&
    ['write', 'destructive'].includes(operation.risk)
  ) {
    warnings.push('Live execution was blocked because this connection is read-only.')
  }

  const confirmationText = planResponse.plan.confirmationText
  if (confirmationText && request.confirmationText !== confirmationText) {
    warnings.push(`Type \`${confirmationText}\` before executing this operation.`)
  }

  if (executionSupport !== 'live' || warnings.length > planResponse.plan.warnings.length) {
    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      operationId: request.operationId,
      executionSupport,
      executed: false,
      plan: planResponse.plan,
      messages,
      warnings,
    }
  }

  if (request.operationId.endsWith('security.inspect')) {
    const permissionInspection = inspectPermissionsLocally(snapshot, request).inspection
    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      operationId: request.operationId,
      executionSupport,
      executed: true,
      plan: planResponse.plan,
      permissionInspection,
      messages: ['Permission inspection completed.'],
      warnings,
    }
  }

  if (request.operationId.endsWith('diagnostics.metrics')) {
    const diagnostics = collectDiagnosticsLocally(snapshot, request).diagnostics
    return {
      connectionId: request.connectionId,
      environmentId: request.environmentId,
      operationId: request.operationId,
      executionSupport,
      executed: true,
      plan: planResponse.plan,
      diagnostics,
      messages: ['Adapter diagnostics collected.'],
      warnings,
    }
  }

  return {
    connectionId: request.connectionId,
    environmentId: request.environmentId,
    operationId: request.operationId,
    executionSupport,
    executed: true,
    plan: planResponse.plan,
    metadata: {
      summary: `Preview operation ${request.operationId} executed in browser mode.`,
    },
    messages: ['Preview operation completed.'],
    warnings,
  }
}

