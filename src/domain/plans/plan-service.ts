import type { ValidationResult } from "../../features/work-state"
import type { WorkState } from "../../features/work-state/types"
import type { PlanRepository } from "./plan-repository"
import { createFreshPlanExecution, resumePlanExecution } from "./plan-execution"
import { getPlanProgressView } from "./plan-progress"
import { findPlanByName, listIncompletePlans } from "./plan-selection"

export interface PlanService {
  readWorkState(directory: string): WorkState | null
  findPlans(directory: string): string[]
  getPlanProgress(planPath: string): { total: number; completed: number; isComplete: boolean }
  getPlanName(planPath: string): string
  findIncompletePlans(plans: string[]): string[]
  matchPlanByName(plans: string[], requestedName: string): string | null
  createExecution(directory: string, planPath: string, sessionId: string, agent: string): WorkState
  resumeExecution(directory: string, sessionId: string): WorkState | null
  clearExecution(directory: string): boolean
}

export function createPlanService(planRepository: PlanRepository): PlanService {
  return {
    readWorkState(directory) {
      return planRepository.readWorkState(directory)
    },
    findPlans(directory) {
      return planRepository.findPlans(directory)
    },
    getPlanProgress(planPath) {
      return getPlanProgressView(planRepository, planPath)
    },
    getPlanName(planPath) {
      return planRepository.getPlanName(planPath)
    },
    findIncompletePlans(plans) {
      return listIncompletePlans(planRepository, plans)
    },
    matchPlanByName(plans, requestedName) {
      return findPlanByName(planRepository, plans, requestedName)
    },
    createExecution(directory, planPath, sessionId, agent) {
      return createFreshPlanExecution({
        planRepository,
        directory,
        planPath,
        sessionId,
        agent,
      })
    },
    resumeExecution(directory, sessionId) {
      return resumePlanExecution({
        planRepository,
        directory,
        sessionId,
      })
    },
    clearExecution(directory) {
      return planRepository.clearWorkState(directory)
    },
  }
}

export type { ValidationResult }
