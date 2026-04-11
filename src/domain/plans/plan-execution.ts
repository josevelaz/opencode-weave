import { projectExecutionTransition, type ExecutionLeaseRepository } from "../session/execution-lease"
import type { WorkState } from "../../features/work-state/types"
import type { PlanRepository } from "./plan-repository"

export function createFreshPlanExecution(args: {
  planRepository: PlanRepository
  executionLeaseRepository?: ExecutionLeaseRepository
  directory: string
  planPath: string
  sessionId: string
  agent: string
}): WorkState {
  args.planRepository.clearWorkState(args.directory)
  const state = args.planRepository.createWorkState(args.planPath, args.sessionId, args.agent, args.directory)
  args.planRepository.writeWorkState(args.directory, state)

  if (args.executionLeaseRepository) {
    const projection = projectExecutionTransition({
      event: "start_plan",
      sessionId: args.sessionId,
      ownerRef: args.planPath,
      executionRef: args.planPath,
      executorAgent: args.agent,
      foregroundAgent: args.agent,
      currentLease: args.executionLeaseRepository.readExecutionLease(args.directory),
      currentSessionRuntime: args.executionLeaseRepository.readSessionRuntime(args.directory, args.sessionId),
    })

    if (projection.lease) {
      args.executionLeaseRepository.writeExecutionLease(args.directory, projection.lease)
    }
    if (projection.sessionRuntime) {
      args.executionLeaseRepository.writeSessionRuntime(args.directory, projection.sessionRuntime)
    }
  }

  return state
}

export function resumePlanExecution(args: {
  planRepository: PlanRepository
  executionLeaseRepository?: ExecutionLeaseRepository
  directory: string
  sessionId: string
}): WorkState | null {
  const state = args.planRepository.appendSessionId(args.directory, args.sessionId)
  if (!state) {
    return null
  }

  args.planRepository.resumeWork(args.directory)
  const resumedState = args.planRepository.readWorkState(args.directory)

  if (args.executionLeaseRepository && resumedState) {
    const executorAgent = resumedState.agent ?? "tapestry"
    const projection = projectExecutionTransition({
      event: "resume_plan",
      sessionId: args.sessionId,
      ownerRef: resumedState.active_plan,
      executionRef: resumedState.active_plan,
      executorAgent,
      foregroundAgent: executorAgent,
      currentLease: args.executionLeaseRepository.readExecutionLease(args.directory),
      currentSessionRuntime: args.executionLeaseRepository.readSessionRuntime(args.directory, args.sessionId),
    })

    if (projection.lease) {
      args.executionLeaseRepository.writeExecutionLease(args.directory, projection.lease)
    }
    if (projection.sessionRuntime) {
      args.executionLeaseRepository.writeSessionRuntime(args.directory, projection.sessionRuntime)
    }
  }

  return resumedState
}
