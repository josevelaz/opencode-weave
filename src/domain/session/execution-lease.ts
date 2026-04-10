export type ExecutionLeaseOwner = "none" | "plan" | "workflow"

export interface ExecutionLeaseSnapshot {
  owner: ExecutionLeaseOwner
  hasActivePlan: boolean
  hasActiveWorkflow: boolean
  activePlanPaused: boolean
  activeWorkflowPaused: boolean
}

export interface ExecutionLeaseRepository {
  getExecutionSnapshot(directory: string): ExecutionLeaseSnapshot
}

export function determineExecutionOwner(snapshot: Omit<ExecutionLeaseSnapshot, "owner">): ExecutionLeaseOwner {
  if (snapshot.hasActiveWorkflow && !snapshot.activeWorkflowPaused) {
    return "workflow"
  }

  if (snapshot.hasActivePlan && !snapshot.activePlanPaused) {
    return "plan"
  }

  return "none"
}
