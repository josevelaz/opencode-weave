import type { PlanProgress } from "../../features/work-state/types"
import type { PlanRepository } from "./plan-repository"

export function getPlanProgressView(planRepository: PlanRepository, planPath: string): PlanProgress {
  return planRepository.getPlanProgress(planPath)
}

export function isPlanComplete(planRepository: PlanRepository, planPath: string): boolean {
  return getPlanProgressView(planRepository, planPath).isComplete
}
