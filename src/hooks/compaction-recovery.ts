import { getPlanProgress, readWorkState } from "../features/work-state"
import { createExecutionLeaseFsStore } from "../infrastructure/fs/execution-lease-fs-store"
import {
  projectExecutionTransition,
} from "../domain/session/execution-lease"
import type { ExecutionLeaseState, SessionRuntimeState } from "../features/work-state/types"
import { CONTINUATION_MARKER } from "./work-continuation"
import {
  getActiveWorkflowInstance,
  loadWorkflowDefinition,
  composeStepPrompt,
  WORKFLOW_CONTINUATION_MARKER,
} from "../features/workflow"
import { buildWorkflowContinuationPrompt } from "../domain/workflows/workflow-context"
import { debug, info, warn } from "../shared/log"
import { AGENT_DISPLAY_NAMES } from "../shared/agent-display-names"

const ExecutionLeaseRepository = createExecutionLeaseFsStore()

export interface CompactionRecoveryInput {
  sessionId: string
  directory: string
  enabledAgents?: ReadonlySet<string>
}

export interface CompactionRecoveryResult {
  continuationPrompt: string | null
  switchAgent: string | null
}

export function checkCompactionRecovery(input: CompactionRecoveryInput): CompactionRecoveryResult {
  const sessionRuntime = sanitizeSessionRuntime(input, ExecutionLeaseRepository.readSessionRuntime(input.directory, input.sessionId))
  const lease = ExecutionLeaseRepository.readExecutionLease(input.directory)

  const workflowRecovery = buildWorkflowRecoveryPrompt(input, lease, sessionRuntime)
  if (workflowRecovery) {
    info("[compaction] Restoring workflow-owned session", {
      sessionId: input.sessionId,
      switchAgent: workflowRecovery.switchAgent,
    })
    return workflowRecovery
  }

  const workRecovery = buildWorkRecoveryPrompt(input, lease, sessionRuntime)
  if (workRecovery) {
    info("[compaction] Restoring plan-owned session", {
      sessionId: input.sessionId,
      switchAgent: workRecovery.switchAgent,
    })
    return workRecovery
  }

  const identityRecovery = buildIdentityOnlyRecoveryPrompt(input, sessionRuntime)
  if (identityRecovery) {
    info("[compaction] Restoring ad-hoc foreground agent", {
      sessionId: input.sessionId,
      switchAgent: identityRecovery.switchAgent,
    })
    return identityRecovery
  }

  debug("[compaction] No recovery action required", {
    sessionId: input.sessionId,
    ownerKind: lease?.owner_kind ?? "none",
    hasForegroundAgent: !!sessionRuntime?.foreground_agent,
  })

  return { continuationPrompt: null, switchAgent: null }
}

function buildWorkflowRecoveryPrompt(
  input: CompactionRecoveryInput,
  lease: ExecutionLeaseState | null,
  sessionRuntime: SessionRuntimeState | null,
): CompactionRecoveryResult | null {
  const sessionOwnsWorkflowLease = lease?.owner_kind !== "workflow" || isLeaseOwnedBySession(lease, input.sessionId)
  const instance = getActiveWorkflowInstance(input.directory)
  if (!instance) {
    if (lease?.owner_kind === "workflow" && sessionOwnsWorkflowLease) {
      clearStaleOwner(input, lease, sessionRuntime, "Workflow lease had no active instance")
    }
    return null
  }

  if (instance.status !== "running") {
    if (lease?.owner_kind === "workflow" && sessionOwnsWorkflowLease) {
      clearStaleOwner(input, lease, sessionRuntime, `Workflow is ${instance.status}`)
    }
    return null
  }

  if (!isSessionBound(instance.session_ids, input.sessionId, lease)) {
    return null
  }

  const definition = loadWorkflowDefinition(instance.definition_path)
  if (!definition) {
    if (lease?.owner_kind === "workflow" && sessionOwnsWorkflowLease) {
      clearStaleOwner(input, lease, sessionRuntime, "Workflow definition could not be loaded")
    }
    return null
  }

  const currentStep = definition.steps.find((step) => step.id === instance.current_step_id)
  if (!currentStep) {
    if (lease?.owner_kind === "workflow" && sessionOwnsWorkflowLease) {
      clearStaleOwner(input, lease, sessionRuntime, "Workflow current step was missing")
    }
    return null
  }

  if (!isKnownEnabledAgent(input, currentStep.agent)) {
    if (lease?.owner_kind === "workflow" && sessionOwnsWorkflowLease) {
      clearStaleOwner(input, lease, sessionRuntime, `Workflow step agent \"${currentStep.agent}\" was unavailable`)
    }
    warn("[compaction] Workflow step agent was unavailable", {
      sessionId: input.sessionId,
      agent: currentStep.agent,
      workflow: instance.instance_id,
      step: currentStep.id,
    })
    return null
  }

  healWorkflowOwnership(input, lease, sessionRuntime, `${instance.instance_id}/${instance.current_step_id}`, currentStep.agent)

  return {
    continuationPrompt: buildWorkflowContinuationPrompt({
      sessionId: input.sessionId,
      body: [
        "## Context Restored After Compaction",
        "Resume the active workflow from reconciled runtime state.",
        "",
        composeStepPrompt(currentStep, instance, definition),
      ].join("\n"),
    }),
    switchAgent: currentStep.agent,
  }
}

function buildWorkRecoveryPrompt(
  input: CompactionRecoveryInput,
  lease: ExecutionLeaseState | null,
  sessionRuntime: SessionRuntimeState | null,
): CompactionRecoveryResult | null {
  const sessionOwnsPlanLease = lease?.owner_kind !== "plan" || isLeaseOwnedBySession(lease, input.sessionId)
  if (lease?.owner_kind === "none") {
    return null
  }

  const state = readWorkState(input.directory)
  if (!state) {
    if (lease?.owner_kind === "plan" && sessionOwnsPlanLease) {
      clearStaleOwner(input, lease, sessionRuntime, "Plan lease had no work state")
    }
    return null
  }

  if (state.paused) {
    if (lease?.owner_kind === "plan" && sessionOwnsPlanLease) {
      clearStaleOwner(input, lease, sessionRuntime, "Plan was paused")
    }
    return null
  }

  if (lease?.owner_kind === "workflow") {
    return null
  }

  if (!isSessionBound(state.session_ids, input.sessionId, lease)) {
    return null
  }

  const progress = getPlanProgress(state.active_plan)
  if (progress.isComplete) {
    if (lease?.owner_kind === "plan" && sessionOwnsPlanLease) {
      clearStaleOwner(input, lease, sessionRuntime, "Plan was already complete")
    }
    return null
  }

  const remaining = progress.total - progress.completed
  const switchAgent = lease?.executor_agent ?? state.agent ?? "tapestry"
  if (!isKnownEnabledAgent(input, switchAgent)) {
    if (lease?.owner_kind === "plan") {
      clearInvalidPlanAgent(input, lease, sessionRuntime, switchAgent)
    } else {
      warn("[compaction] Plan fallback agent was unavailable", {
        sessionId: input.sessionId,
        agent: switchAgent,
        plan: state.active_plan,
      })
    }
    return null
  }

  healPlanOwnership(input, lease, sessionRuntime, state.active_plan, switchAgent)

  return {
    continuationPrompt: [
      CONTINUATION_MARKER,
      "## Context Restored After Compaction",
      "Resume your active work plan from reconciled runtime state.",
      "",
      `**Plan**: ${state.plan_name}`,
      `**File**: \`${state.active_plan}\``,
      `**Working directory**: \`${input.directory}\``,
      `**Progress**: ${progress.completed}/${progress.total} tasks completed (${remaining} remaining)`,
      "",
      "1. Read the plan file now and re-check the first unchecked task",
      "2. Restore sidebar todos from current plan progress",
      "3. Continue execution from persisted state without restarting the plan",
    ].join("\n"),
    switchAgent,
  }
}

function buildIdentityOnlyRecoveryPrompt(
  input: CompactionRecoveryInput,
  sessionRuntime: SessionRuntimeState | null,
): CompactionRecoveryResult | null {
  if (!sessionRuntime?.foreground_agent) {
    return null
  }

  if (!isKnownEnabledAgent(input, sessionRuntime.foreground_agent)) {
    clearInvalidForegroundAgent(input, sessionRuntime, sessionRuntime.foreground_agent)
    return null
  }

  return {
    continuationPrompt: [
      WORKFLOW_CONTINUATION_MARKER,
      "## Context Restored After Compaction",
      `Foreground agent restored: ${sessionRuntime.foreground_agent}.`,
      "No running plan or workflow owns this session, so no automated continuation was injected.",
    ].join("\n"),
    switchAgent: sessionRuntime.foreground_agent,
  }
}

function sanitizeSessionRuntime(
  input: CompactionRecoveryInput,
  sessionRuntime: SessionRuntimeState | null,
): SessionRuntimeState | null {
  if (!sessionRuntime?.foreground_agent) {
    return sessionRuntime
  }

  if (isKnownEnabledAgent(input, sessionRuntime.foreground_agent)) {
    return sessionRuntime
  }

  clearInvalidForegroundAgent(input, sessionRuntime, sessionRuntime.foreground_agent)
  return {
    ...sessionRuntime,
    foreground_agent: null,
  }
}

function isSessionBound(
  sessionIds: string[],
  sessionId: string,
  lease: ExecutionLeaseState | null,
): boolean {
  if (lease?.session_id) {
    return lease.session_id === sessionId
  }

  if (sessionIds.length === 0) {
    return true
  }

  return sessionIds.at(-1) === sessionId
}

function isLeaseOwnedBySession(lease: ExecutionLeaseState | null, sessionId: string): boolean {
  return !!lease?.session_id && lease.session_id === sessionId
}

function clearStaleOwner(
  input: CompactionRecoveryInput,
  lease: ExecutionLeaseState,
  sessionRuntime: SessionRuntimeState | null,
  reason: string,
): void {
  warn("[compaction] Clearing stale execution ownership", {
    sessionId: input.sessionId,
    ownerKind: lease.owner_kind,
    reason,
  })

  const projection = projectExecutionTransition({
    event: "clear_owner",
    sessionId: input.sessionId,
    currentLease: lease,
    currentSessionRuntime: sessionRuntime,
  })

  ExecutionLeaseRepository.clearExecutionLease(input.directory)
  if (projection.sessionRuntime) {
    ExecutionLeaseRepository.writeSessionRuntime(input.directory, projection.sessionRuntime)
  }
}

function clearInvalidPlanAgent(
  input: CompactionRecoveryInput,
  lease: ExecutionLeaseState,
  sessionRuntime: SessionRuntimeState | null,
  agent: string,
): void {
  warn("[compaction] Plan owner referenced unknown or disabled agent", {
    sessionId: input.sessionId,
    agent,
    ownerRef: lease.owner_ref,
  })

  clearStaleOwner(input, lease, sessionRuntime, `Plan executor agent \"${agent}\" was unavailable`)
}

function clearInvalidForegroundAgent(
  input: CompactionRecoveryInput,
  sessionRuntime: SessionRuntimeState,
  agent: string,
): void {
  warn("[compaction] Clearing stale foreground agent", {
    sessionId: input.sessionId,
    agent,
    mode: sessionRuntime.mode,
  })

  ExecutionLeaseRepository.writeSessionRuntime(input.directory, {
    ...sessionRuntime,
    foreground_agent: null,
    updated_at: new Date().toISOString(),
  })
}

function healWorkflowOwnership(
  input: CompactionRecoveryInput,
  lease: ExecutionLeaseState | null,
  sessionRuntime: SessionRuntimeState | null,
  executionRef: string,
  agent: string,
): void {
  const projection = projectExecutionTransition({
    event: "resume_workflow",
    sessionId: input.sessionId,
    ownerRef: executionRef,
    executionRef,
    executorAgent: agent,
    foregroundAgent: agent,
    currentLease: lease,
    currentSessionRuntime: sessionRuntime,
  })

  if (projection.lease) {
    ExecutionLeaseRepository.writeExecutionLease(input.directory, projection.lease)
  }
  if (projection.sessionRuntime) {
    ExecutionLeaseRepository.writeSessionRuntime(input.directory, projection.sessionRuntime)
  }
}

function healPlanOwnership(
  input: CompactionRecoveryInput,
  lease: ExecutionLeaseState | null,
  sessionRuntime: SessionRuntimeState | null,
  executionRef: string,
  agent: string,
): void {
  const projection = projectExecutionTransition({
    event: "resume_plan",
    sessionId: input.sessionId,
    ownerRef: executionRef,
    executionRef,
    executorAgent: agent,
    foregroundAgent: agent,
    currentLease: lease,
    currentSessionRuntime: sessionRuntime,
  })

  if (projection.lease) {
    ExecutionLeaseRepository.writeExecutionLease(input.directory, projection.lease)
  }
  if (projection.sessionRuntime) {
    ExecutionLeaseRepository.writeSessionRuntime(input.directory, projection.sessionRuntime)
  }
}

function isKnownEnabledAgent(input: CompactionRecoveryInput, agent: string | null | undefined): boolean {
  if (!agent) {
    return false
  }

  const agentKey = agent.toLowerCase()
  if (input.enabledAgents) {
    return input.enabledAgents.has(agentKey)
  }

  return agentKey in AGENT_DISPLAY_NAMES || agentKey === agent
}
