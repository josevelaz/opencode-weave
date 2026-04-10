import { readWorkState } from "../../features/work-state"
import { getActiveWorkflowInstance } from "../../features/workflow"
import type { CreatedHooks } from "../../hooks/create-hooks"

export type ExecutionOwner = "none" | "plan" | "workflow"

export interface ExecutionSnapshot {
  owner: ExecutionOwner
  hasActivePlan: boolean
  hasActiveWorkflow: boolean
  activePlanPaused: boolean
  activeWorkflowPaused: boolean
}

export function getExecutionSnapshot(directory: string): ExecutionSnapshot {
  const workState = readWorkState(directory)
  const workflow = getActiveWorkflowInstance(directory)

  const hasActivePlan = !!workState
  const activePlanPaused = workState?.paused === true
  const hasActiveWorkflow = !!workflow && (workflow.status === "running" || workflow.status === "paused")
  const activeWorkflowPaused = workflow?.status === "paused"

  if (hasActiveWorkflow && !activeWorkflowPaused) {
    return {
      owner: "workflow",
      hasActivePlan,
      hasActiveWorkflow,
      activePlanPaused,
      activeWorkflowPaused,
    }
  }

  if (hasActivePlan && !activePlanPaused) {
    return {
      owner: "plan",
      hasActivePlan,
      hasActiveWorkflow,
      activePlanPaused,
      activeWorkflowPaused,
    }
  }

  return {
    owner: "none",
    hasActivePlan,
    hasActiveWorkflow,
    activePlanPaused,
    activeWorkflowPaused,
  }
}

export function shouldAutoPauseForUserMessage(input: {
  directory: string
  isBuiltinCommand: boolean
  isContinuation: boolean
}): boolean {
  if (input.isBuiltinCommand || input.isContinuation) {
    return false
  }

  const snapshot = getExecutionSnapshot(input.directory)
  return snapshot.owner === "plan"
}

export function shouldHandleWorkflowCommand(directory: string): boolean {
  if (!directory) {
    return true
  }
  return getExecutionSnapshot(directory).owner === "workflow"
}

export function shouldCheckWorkflowContinuation(hooks: CreatedHooks, directory: string): boolean {
  if (!hooks.workflowContinuation || !hooks.continuation.idle.workflow) {
    return false
  }
  if (!directory) {
    return true
  }
  return getExecutionSnapshot(directory).owner === "workflow"
}

export function shouldCheckWorkContinuation(hooks: CreatedHooks, directory: string): boolean {
  if (!hooks.workContinuation || !hooks.continuation.idle.work) {
    return false
  }
  if (!directory) {
    return true
  }
  const snapshot = getExecutionSnapshot(directory)
  return snapshot.owner === "plan" || (!snapshot.hasActivePlan && !snapshot.hasActiveWorkflow)
}

export function shouldFinalizeTodos(hooks: CreatedHooks, directory: string, continuationFired: boolean): boolean {
  if (continuationFired) {
    return false
  }

  if (!directory) {
    return true
  }

  const snapshot = getExecutionSnapshot(directory)
  if (snapshot.owner !== "none") {
    return false
  }

  return hooks.todoContinuationEnforcerEnabled
}
