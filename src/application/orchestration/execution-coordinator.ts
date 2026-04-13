import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"
import type { RuntimeChatMessageInput, RuntimeSessionIdleInput } from "../policy/runtime-policy"
import {
  isExecutionOwnerActive,
  isExecutionOwnerPaused,
  type ExecutionLeaseSnapshot,
} from "../../domain/session/execution-lease"

const ExecutionLeaseStore = createExecutionLeaseFsStore()

export type ExecutionOwner = "none" | "plan" | "workflow"

export interface ExecutionSnapshot extends ExecutionLeaseSnapshot {}

export function getExecutionSnapshot(directory: string): ExecutionSnapshot {
  return ExecutionLeaseStore.getExecutionSnapshot(directory)
}

export function shouldAutoPauseForUserMessage(input: {
  directory: string
  sessionId: string
  isBuiltinCommand: boolean
  isContinuation: boolean
}): boolean {
  if (input.isBuiltinCommand || input.isContinuation) {
    return false
  }

  const snapshot = getExecutionSnapshot(input.directory)
  return isExecutionOwnerActive(snapshot, "plan") && snapshot.sessionId === input.sessionId
}

export function shouldHandleWorkflowCommand(directory: string, sessionId: string): boolean {
  if (!directory) {
    return true
  }
  const snapshot = getExecutionSnapshot(directory)
  return snapshot.owner === "workflow" && snapshot.sessionId === sessionId && (snapshot.status === "running" || snapshot.status === "paused")
}

export function shouldCheckWorkflowContinuation(hooks: RuntimeSessionIdleInput["hooks"], directory: string): boolean {
  if (!hooks.workflowContinuation || !hooks.continuation.idle.workflow) {
    return false
  }
  if (!directory) {
    return true
  }
  return isExecutionOwnerActive(getExecutionSnapshot(directory), "workflow")
}

export function shouldCheckWorkContinuation(hooks: RuntimeSessionIdleInput["hooks"], directory: string): boolean {
  if (!hooks.workContinuation || !hooks.continuation.idle.work) {
    return false
  }
  if (!directory) {
    return true
  }
  const snapshot = getExecutionSnapshot(directory)
  return isExecutionOwnerActive(snapshot, "plan") || (snapshot.owner === "none" && !snapshot.hasActivePlan && !snapshot.hasActiveWorkflow)
}

export function doesSessionOwnExecution(directory: string, sessionId: string, owner?: ExecutionOwner): boolean {
  if (!directory) {
    return true
  }

  const snapshot = getExecutionSnapshot(directory)
  if (owner && snapshot.owner !== owner) {
    return false
  }

  return snapshot.sessionId === sessionId
}

export function shouldFinalizeTodos(hooks: RuntimeSessionIdleInput["hooks"], directory: string, continuationFired: boolean): boolean {
  if (continuationFired) {
    return false
  }

  if (!directory) {
    return true
  }

  const snapshot = getExecutionSnapshot(directory)
  if (snapshot.owner !== "none" || isExecutionOwnerPaused(snapshot, "plan") || isExecutionOwnerPaused(snapshot, "workflow")) {
    return false
  }

  return hooks.todoContinuationEnforcerEnabled
}
