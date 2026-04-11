import type {
  ExecutionLeaseState,
  ExecutionLeaseStatus,
  ExecutionOwnerKind,
  SessionRuntimeMode,
  SessionRuntimeState,
  SessionRuntimeStatus,
} from "../../features/work-state/types"

export type ExecutionLeaseOwner = ExecutionOwnerKind

export type ExecutionTransitionEvent =
  | "observe_ad_hoc_agent"
  | "start_plan"
  | "resume_plan"
  | "start_workflow"
  | "resume_workflow"
  | "advance_workflow_step"
  | "pause_owner"
  | "complete_owner"
  | "clear_owner"
  | "delete_session"

export type ExecutionLeaseAction = "preserve" | "upsert" | "clear" | "clear_if_owned_by_session"

export type SessionRuntimeAction = "preserve" | "upsert" | "clear"

export interface ExecutionStateTransition {
  event: ExecutionTransitionEvent
  leaseAction: ExecutionLeaseAction
  sessionAction: SessionRuntimeAction
  ownerKind?: ExecutionOwnerKind
  leaseStatus?: ExecutionLeaseStatus
  sessionMode?: SessionRuntimeMode
  sessionStatus?: SessionRuntimeStatus
  foregroundAgent: "observed" | "executor" | "preserve"
  note: string
}

export interface ExecutionTransitionProjection {
  lease: ExecutionLeaseState | null
  sessionRuntime: SessionRuntimeState | null
}

export const ExecutionStateTransitions: readonly ExecutionStateTransition[] = [
  {
    event: "observe_ad_hoc_agent",
    leaseAction: "preserve",
    sessionAction: "upsert",
    sessionMode: "ad_hoc",
    sessionStatus: "running",
    foregroundAgent: "observed",
    note: "Session bootstrap updates foreground identity without claiming repo execution ownership.",
  },
  {
    event: "start_plan",
    leaseAction: "upsert",
    sessionAction: "upsert",
    ownerKind: "plan",
    leaseStatus: "running",
    sessionMode: "plan",
    sessionStatus: "running",
    foregroundAgent: "executor",
    note: "Starting /start-work claims repo execution for the plan and foregrounds the executor agent.",
  },
  {
    event: "resume_plan",
    leaseAction: "upsert",
    sessionAction: "upsert",
    ownerKind: "plan",
    leaseStatus: "running",
    sessionMode: "plan",
    sessionStatus: "running",
    foregroundAgent: "executor",
    note: "Resuming /start-work keeps plan ownership explicit and rebinds the active session.",
  },
  {
    event: "start_workflow",
    leaseAction: "upsert",
    sessionAction: "upsert",
    ownerKind: "workflow",
    leaseStatus: "running",
    sessionMode: "workflow",
    sessionStatus: "running",
    foregroundAgent: "executor",
    note: "Workflow start takes precedence over plans and foregrounds the current step agent.",
  },
  {
    event: "resume_workflow",
    leaseAction: "upsert",
    sessionAction: "upsert",
    ownerKind: "workflow",
    leaseStatus: "running",
    sessionMode: "workflow",
    sessionStatus: "running",
    foregroundAgent: "executor",
    note: "Workflow resume restores the active step agent as the foreground executor.",
  },
  {
    event: "advance_workflow_step",
    leaseAction: "upsert",
    sessionAction: "upsert",
    ownerKind: "workflow",
    leaseStatus: "running",
    sessionMode: "workflow",
    sessionStatus: "running",
    foregroundAgent: "executor",
    note: "Workflow step advance keeps workflow ownership and moves foreground identity to the next step agent.",
  },
  {
    event: "pause_owner",
    leaseAction: "upsert",
    sessionAction: "upsert",
    leaseStatus: "paused",
    sessionStatus: "paused",
    foregroundAgent: "preserve",
    note: "Interrupts pause automation without inventing a new foreground agent.",
  },
  {
    event: "complete_owner",
    leaseAction: "clear",
    sessionAction: "upsert",
    sessionMode: "ad_hoc",
    sessionStatus: "idle",
    foregroundAgent: "preserve",
    note: "Completion clears repo ownership but preserves the session foreground agent as plain ad-hoc context.",
  },
  {
    event: "clear_owner",
    leaseAction: "clear",
    sessionAction: "upsert",
    sessionMode: "ad_hoc",
    sessionStatus: "idle",
    foregroundAgent: "preserve",
    note: "Cleanup clears stale ownership while leaving the session in safe ad-hoc mode.",
  },
  {
    event: "delete_session",
    leaseAction: "clear_if_owned_by_session",
    sessionAction: "clear",
    foregroundAgent: "preserve",
    note: "Session deletion clears per-session runtime state and clears repo ownership only when that session owns it.",
  },
] as const

export interface ExecutionLeaseSnapshot {
  owner: ExecutionLeaseOwner
  ownerRef: string | null
  status: ExecutionLeaseStatus
  sessionId: string | null
  executorAgent: string | null
  hasActivePlan: boolean
  hasActiveWorkflow: boolean
  activePlanPaused: boolean
  activeWorkflowPaused: boolean
}

export interface ExecutionLeaseRepository {
  readExecutionLease(directory: string): ExecutionLeaseState | null
  writeExecutionLease(directory: string, state: ExecutionLeaseState): boolean
  clearExecutionLease(directory: string): boolean
  readSessionRuntime(directory: string, sessionId: string): SessionRuntimeState | null
  writeSessionRuntime(directory: string, state: SessionRuntimeState): boolean
  clearSessionRuntime(directory: string, sessionId: string): boolean
  getExecutionSnapshot(directory: string): ExecutionLeaseSnapshot
}

export function getExecutionStateTransition(event: ExecutionTransitionEvent): ExecutionStateTransition {
  return ExecutionStateTransitions.find((transition) => transition.event === event) ?? ExecutionStateTransitions[0]
}

export function determineExecutionOwner(snapshot: Omit<ExecutionLeaseSnapshot, "owner" | "ownerRef" | "status" | "sessionId" | "executorAgent">): ExecutionLeaseOwner {
  if (snapshot.hasActiveWorkflow && !snapshot.activeWorkflowPaused) {
    return "workflow"
  }

  if (snapshot.hasActivePlan && !snapshot.activePlanPaused) {
    return "plan"
  }

  return "none"
}

export function createExecutionLeaseState(input: {
  ownerKind: ExecutionOwnerKind
  ownerRef?: string | null
  status: ExecutionLeaseStatus
  sessionId?: string | null
  executorAgent?: string | null
  startedAt?: string
  updatedAt?: string
}): ExecutionLeaseState {
  const now = input.updatedAt ?? new Date().toISOString()

  return {
    owner_kind: input.ownerKind,
    owner_ref: input.ownerRef ?? null,
    status: input.status,
    session_id: input.sessionId ?? null,
    executor_agent: input.executorAgent ?? null,
    started_at: input.startedAt ?? now,
    updated_at: now,
  }
}

export function createSessionRuntimeState(input: {
  sessionId: string
  foregroundAgent?: string | null
  mode: SessionRuntimeMode
  executionRef?: string | null
  status: SessionRuntimeStatus
  updatedAt?: string
}): SessionRuntimeState {
  return {
    session_id: input.sessionId,
    foreground_agent: input.foregroundAgent ?? null,
    mode: input.mode,
    execution_ref: input.executionRef ?? null,
    status: input.status,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  }
}

export function createExecutionLeaseSnapshot(input: {
  lease?: ExecutionLeaseState | null
  hasActivePlan: boolean
  hasActiveWorkflow: boolean
  activePlanPaused: boolean
  activeWorkflowPaused: boolean
}): ExecutionLeaseSnapshot {
  const owner = input.lease?.owner_kind ?? determineExecutionOwner(input)

  return {
    owner,
    ownerRef: input.lease?.owner_ref ?? null,
    status: input.lease?.status ?? deriveLegacyLeaseStatus(owner, input.activePlanPaused, input.activeWorkflowPaused),
    sessionId: input.lease?.session_id ?? null,
    executorAgent: input.lease?.executor_agent ?? null,
    hasActivePlan: input.hasActivePlan,
    hasActiveWorkflow: input.hasActiveWorkflow,
    activePlanPaused: input.activePlanPaused,
    activeWorkflowPaused: input.activeWorkflowPaused,
  }
}

export function isExecutionOwnerActive(snapshot: ExecutionLeaseSnapshot, owner: ExecutionLeaseOwner): boolean {
  return snapshot.owner === owner && snapshot.status === "running"
}

export function isExecutionOwnerPaused(snapshot: ExecutionLeaseSnapshot, owner: ExecutionLeaseOwner): boolean {
  return snapshot.owner === owner && snapshot.status === "paused"
}

export function projectExecutionTransition(input: {
  event: ExecutionTransitionEvent
  sessionId: string
  ownerRef?: string | null
  executionRef?: string | null
  foregroundAgent?: string | null
  executorAgent?: string | null
  currentLease?: ExecutionLeaseState | null
  currentSessionRuntime?: SessionRuntimeState | null
  at?: string
}): ExecutionTransitionProjection {
  const transition = getExecutionStateTransition(input.event)
  const at = input.at ?? new Date().toISOString()
  const foregroundAgent = resolveForegroundAgent(input, transition)
  const lease = resolveLeaseProjection(input, transition, foregroundAgent, at)
  const sessionRuntime = resolveSessionProjection(input, transition, foregroundAgent, at)

  return {
    lease,
    sessionRuntime,
  }
}

function deriveLegacyLeaseStatus(
  owner: ExecutionLeaseOwner,
  activePlanPaused: boolean,
  activeWorkflowPaused: boolean,
): ExecutionLeaseStatus {
  if (owner === "workflow") {
    return activeWorkflowPaused ? "paused" : "running"
  }

  if (owner === "plan") {
    return activePlanPaused ? "paused" : "running"
  }

  return activePlanPaused || activeWorkflowPaused ? "paused" : "completed"
}

function resolveForegroundAgent(
  input: {
    foregroundAgent?: string | null
    executorAgent?: string | null
    currentLease?: ExecutionLeaseState | null
    currentSessionRuntime?: SessionRuntimeState | null
  },
  transition: ExecutionStateTransition,
): string | null {
  switch (transition.foregroundAgent) {
    case "observed":
      return input.foregroundAgent ?? input.currentSessionRuntime?.foreground_agent ?? input.currentLease?.executor_agent ?? null
    case "executor":
      return input.executorAgent ?? input.foregroundAgent ?? input.currentLease?.executor_agent ?? null
    case "preserve":
    default:
      return input.currentSessionRuntime?.foreground_agent ?? input.currentLease?.executor_agent ?? input.foregroundAgent ?? input.executorAgent ?? null
  }
}

function resolveLeaseProjection(
  input: {
    event: ExecutionTransitionEvent
    sessionId: string
    ownerRef?: string | null
    currentLease?: ExecutionLeaseState | null
  },
  transition: ExecutionStateTransition,
  foregroundAgent: string | null,
  at: string,
): ExecutionLeaseState | null {
  switch (transition.leaseAction) {
    case "preserve":
      return input.currentLease ?? null
    case "clear":
      return null
    case "clear_if_owned_by_session":
      if (input.currentLease?.session_id === input.sessionId) {
        return null
      }
      return input.currentLease ?? null
    case "upsert": {
      const ownerKind = transition.ownerKind ?? input.currentLease?.owner_kind ?? "none"
      if (ownerKind === "none") {
        return null
      }
      return createExecutionLeaseState({
        ownerKind,
        ownerRef: input.ownerRef ?? input.currentLease?.owner_ref ?? null,
        status: transition.leaseStatus ?? input.currentLease?.status ?? "running",
        sessionId: input.sessionId,
        executorAgent: foregroundAgent,
        startedAt: input.currentLease?.started_at ?? at,
        updatedAt: at,
      })
    }
  }
}

function resolveSessionProjection(
  input: {
    sessionId: string
    executionRef?: string | null
    currentLease?: ExecutionLeaseState | null
    currentSessionRuntime?: SessionRuntimeState | null
  },
  transition: ExecutionStateTransition,
  foregroundAgent: string | null,
  at: string,
): SessionRuntimeState | null {
  switch (transition.sessionAction) {
    case "preserve":
      return input.currentSessionRuntime ?? null
    case "clear":
      return null
    case "upsert":
      return createSessionRuntimeState({
        sessionId: input.sessionId,
        foregroundAgent,
        mode: transition.sessionMode ?? inferSessionMode(input.currentSessionRuntime, input.currentLease),
        executionRef: input.executionRef ?? input.currentSessionRuntime?.execution_ref ?? input.currentLease?.owner_ref ?? null,
        status: transition.sessionStatus ?? input.currentSessionRuntime?.status ?? "idle",
        updatedAt: at,
      })
  }
}

function inferSessionMode(
  currentSessionRuntime?: SessionRuntimeState | null,
  currentLease?: ExecutionLeaseState | null,
): SessionRuntimeMode {
  if (currentSessionRuntime?.mode) {
    return currentSessionRuntime.mode
  }

  switch (currentLease?.owner_kind) {
    case "plan":
      return "plan"
    case "workflow":
      return "workflow"
    case "none":
    default:
      return "ad_hoc"
  }
}
