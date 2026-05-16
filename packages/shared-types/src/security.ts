import type {
  ConnectionProfile,
  EnvironmentProfile,
  ResolvedEnvironment,
} from './connection'

export type ThemeMode = 'system' | 'light' | 'dark'
export type TelemetryMode = 'disabled' | 'opt-in'
export type GuardrailAction = 'connect' | 'execute-query' | 'export'
export type GuardrailStatus = 'allow' | 'confirm' | 'block'

export interface GuardrailPolicy {
  id: string
  action: GuardrailAction
  minimumRisk?: 'medium' | 'high' | 'critical'
  requireConfirmation?: boolean
  blockWritesWhenReadOnly?: boolean
  warnOnLargeResults?: boolean
}

export interface GuardrailDecision {
  id?: string
  status: GuardrailStatus
  reasons: string[]
  safeModeApplied: boolean
  requiredConfirmationText?: string
}

export interface GuardrailEvaluationInput {
  action: GuardrailAction
  connection: ConnectionProfile
  environment: EnvironmentProfile
  resolvedEnvironment: ResolvedEnvironment
  queryText?: string
}

export interface AppPreferences {
  theme: ThemeMode
  telemetry: TelemetryMode
  lockAfterMinutes: number
  safeModeEnabled: boolean
}

export interface LockState {
  isLocked: boolean
  lockedAt?: string
}
