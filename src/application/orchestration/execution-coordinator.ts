import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"
import type { CreatedHooks } from "../../hooks/create-hooks"
import type { ExecutionLeaseSnapshot } from "../../domain/session/execution-lease"

const ExecutionLeaseStore = createExecutionLeaseFsStore()

export type ExecutionOwner = "none" | "plan" | "workflow"

export interface ExecutionSnapshot extends ExecutionLeaseSnapshot {}

export function getExecutionSnapshot(directory: string): ExecutionSnapshot {
  return ExecutionLeaseStore.getExecutionSnapshot(directory)
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
