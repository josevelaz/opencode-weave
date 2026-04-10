import type { WorkState } from "../../features/work-state/types"
import type { PlanRepository } from "./plan-repository"

export function createFreshPlanExecution(args: {
  planRepository: PlanRepository
  directory: string
  planPath: string
  sessionId: string
  agent: string
}): WorkState {
  args.planRepository.clearWorkState(args.directory)
  const state = args.planRepository.createWorkState(args.planPath, args.sessionId, args.agent, args.directory)
  args.planRepository.writeWorkState(args.directory, state)
  return state
}

export function resumePlanExecution(args: {
  planRepository: PlanRepository
  directory: string
  sessionId: string
}): WorkState | null {
  const state = args.planRepository.appendSessionId(args.directory, args.sessionId)
  if (!state) {
    return null
  }

  args.planRepository.resumeWork(args.directory)
  return args.planRepository.readWorkState(args.directory)
}
