import type { ExecutionLeaseRepository, ExecutionLeaseSnapshot } from "../../domain/session/execution-lease"
import { determineExecutionOwner } from "../../domain/session/execution-lease"
import { createPlanFsRepository } from "./plan-fs-repository"
import { createWorkflowFsRepository } from "./workflow-fs-repository"

export function createExecutionLeaseFsStore(): ExecutionLeaseRepository {
  const planRepository = createPlanFsRepository()
  const workflowRepository = createWorkflowFsRepository()

  return {
    getExecutionSnapshot(directory: string): ExecutionLeaseSnapshot {
      const workState = planRepository.readWorkState(directory)
      const workflow = workflowRepository.getActiveWorkflowInstance(directory)

      const snapshot = {
        hasActivePlan: !!workState,
        hasActiveWorkflow: !!workflow && (workflow.status === "running" || workflow.status === "paused"),
        activePlanPaused: workState?.paused === true,
        activeWorkflowPaused: workflow?.status === "paused",
      }

      return {
        ...snapshot,
        owner: determineExecutionOwner(snapshot),
      }
    },
  }
}
