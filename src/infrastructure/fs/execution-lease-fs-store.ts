import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { parse as parseJsonc } from "jsonc-parser"
import type { ExecutionLeaseRepository, ExecutionLeaseSnapshot } from "../../domain/session/execution-lease"
import {
  createExecutionLeaseSnapshot,
  createExecutionLeaseState,
  createSessionRuntimeState,
} from "../../domain/session/execution-lease"
import type { ExecutionLeaseState, SessionRuntimeState } from "../../features/work-state/types"
import { ACTIVE_EXECUTION_PATH, RUNTIME_DIR } from "../../features/work-state/constants"
import { createPlanFsRepository } from "./plan-fs-repository"
import { createWorkflowFsRepository } from "./workflow-fs-repository"
import {
  clearSessionRuntimeFromFs,
  readSessionRuntimeFromFs,
  writeSessionRuntimeToFs,
} from "./work-state-fs-store"

export function createExecutionLeaseFsStore(): ExecutionLeaseRepository {
  const planRepository = createPlanFsRepository()
  const workflowRepository = createWorkflowFsRepository()

  return {
    readExecutionLease(directory: string): ExecutionLeaseState | null {
      return readExecutionLeaseFromFs(directory)
    },
    writeExecutionLease(directory: string, state: ExecutionLeaseState): boolean {
      return writeExecutionLeaseToFs(directory, state)
    },
    clearExecutionLease(directory: string): boolean {
      return clearExecutionLeaseFromFs(directory)
    },
    readSessionRuntime(directory: string, sessionId: string) {
      return readSessionRuntimeFromFs(directory, sessionId) ?? deriveLegacySessionRuntime(directory, sessionId)
    },
    writeSessionRuntime(directory: string, state) {
      return writeSessionRuntimeToFs(directory, state)
    },
    clearSessionRuntime(directory: string, sessionId: string) {
      return clearSessionRuntimeFromFs(directory, sessionId)
    },
    getExecutionSnapshot(directory: string): ExecutionLeaseSnapshot {
      const workState = planRepository.readWorkState(directory)
      const activePlan = isIncompletePlanWorkState(planRepository, workState)
      const workflow = workflowRepository.getActiveWorkflowInstance(directory)
      const lease = readExecutionLeaseFromFs(directory) ?? deriveLegacyExecutionLease(directory)

      const snapshot = {
        hasActivePlan: activePlan,
        hasActiveWorkflow: !!workflow && (workflow.status === "running" || workflow.status === "paused"),
        activePlanPaused: activePlan && workState?.paused === true,
        activeWorkflowPaused: workflow?.status === "paused",
      }

      return createExecutionLeaseSnapshot({
        lease,
        ...snapshot,
      })
    },
  }
}

function deriveLegacyExecutionLease(directory: string): ExecutionLeaseState | null {
  const planRepository = createPlanFsRepository()
  const workflowRepository = createWorkflowFsRepository()
  const workState = planRepository.readWorkState(directory)
  const workflow = workflowRepository.getActiveWorkflowInstance(directory)

  if (workflow && (workflow.status === "running" || workflow.status === "paused")) {
    return createExecutionLeaseState({
      ownerKind: "workflow",
      ownerRef: `${workflow.instance_id}/${workflow.current_step_id}`,
      status: workflow.status === "paused" ? "paused" : "running",
      sessionId: workflow.session_ids.at(-1) ?? null,
      executorAgent: resolveWorkflowStepAgent(workflow),
      startedAt: workflow.started_at,
      updatedAt: workflow.ended_at ?? workflow.started_at,
    })
  }

  if (isIncompletePlanWorkState(planRepository, workState)) {
    if (workState.paused) {
      return null
    }

    return createExecutionLeaseState({
      ownerKind: "plan",
      ownerRef: workState.active_plan,
      status: "running",
      sessionId: workState.session_ids.at(-1) ?? null,
      executorAgent: workState.agent ?? "tapestry",
      startedAt: workState.started_at,
      updatedAt: workState.started_at,
    })
  }

  return null
}

export function deriveLegacySessionRuntime(directory: string, sessionId: string): SessionRuntimeState | null {
  const planRepository = createPlanFsRepository()
  const workflowRepository = createWorkflowFsRepository()
  const workflow = workflowRepository.getActiveWorkflowInstance(directory)
  if (workflow && (workflow.session_ids.length === 0 || workflow.session_ids.includes(sessionId))) {
    return createSessionRuntimeState({
      sessionId,
      foregroundAgent: resolveWorkflowStepAgent(workflow),
      mode: "workflow",
      executionRef: `${workflow.instance_id}/${workflow.current_step_id}`,
      status: workflow.status === "paused" ? "paused" : "running",
      updatedAt: workflow.ended_at ?? workflow.started_at,
    })
  }

  const workState = planRepository.readWorkState(directory)
  if (
    isIncompletePlanWorkState(planRepository, workState)
    && (workState.session_ids.length === 0 || workState.session_ids.includes(sessionId))
  ) {
    return createSessionRuntimeState({
      sessionId,
      foregroundAgent: workState.agent ?? "tapestry",
      mode: "plan",
      executionRef: workState.active_plan,
      status: workState.paused ? "paused" : "running",
      updatedAt: workState.started_at,
    })
  }

  return null
}

function isIncompletePlanWorkState(
  planRepository: ReturnType<typeof createPlanFsRepository>,
  workState: { active_plan: string } | null,
): workState is { active_plan: string; paused?: boolean; session_ids: string[]; agent?: string; started_at: string } {
  return !!workState && !planRepository.getPlanProgress(workState.active_plan).isComplete
}

function resolveWorkflowStepAgent(workflow: {
  definition_path: string
  current_step_id: string
}): string | null {
  return resolveWorkflowStepAgentFromDefinition(workflow.definition_path, workflow.current_step_id)
}

function resolveWorkflowStepAgentFromDefinition(definitionPath: string, currentStepId: string): string | null {
  try {
    const raw = readFileSync(definitionPath, "utf-8")
    const parsed = parseJsonc(raw) as { steps?: Array<{ id?: string; agent?: string }> }
    const currentStep = parsed.steps?.find((step) => step.id === currentStepId)
    return currentStep?.agent ?? null
  } catch {
    return null
  }
}

function readExecutionLeaseFromFs(directory: string): ExecutionLeaseState | null {
  const filePath = join(directory, ACTIVE_EXECUTION_PATH)
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const raw = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    if (typeof parsed.owner_kind !== "string") {
      return null
    }
    if (typeof parsed.status !== "string") {
      return null
    }

    return parsed as ExecutionLeaseState
  } catch {
    return null
  }
}

function writeExecutionLeaseToFs(directory: string, state: ExecutionLeaseState): boolean {
  try {
    const runtimeDir = join(directory, RUNTIME_DIR)
    if (!existsSync(runtimeDir)) {
      mkdirSync(runtimeDir, { recursive: true })
    }

    writeFileSync(join(directory, ACTIVE_EXECUTION_PATH), JSON.stringify(state, null, 2), "utf-8")
    return true
  } catch {
    return false
  }
}

function clearExecutionLeaseFromFs(directory: string): boolean {
  const filePath = join(directory, ACTIVE_EXECUTION_PATH)
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
    return true
  } catch {
    return false
  }
}
