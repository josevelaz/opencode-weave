import type { PlanRepository } from "./plan-repository"

export function findPlanByName(planRepository: PlanRepository, plans: string[], requestedName: string): string | null {
  const lowered = requestedName.toLowerCase()
  const exact = plans.find((planPath) => planRepository.getPlanName(planPath).toLowerCase() === lowered)
  if (exact) {
    return exact
  }

  const partial = plans.find((planPath) => planRepository.getPlanName(planPath).toLowerCase().includes(lowered))
  return partial ?? null
}

export function listIncompletePlans(planRepository: PlanRepository, plans: string[]): string[] {
  return plans.filter((planPath) => !planRepository.getPlanProgress(planPath).isComplete)
}
