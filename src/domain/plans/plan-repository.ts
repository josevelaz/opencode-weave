import type { PlanProgress, WorkState } from "../../features/work-state/types"

export interface PlanRepository {
  readWorkState(directory: string): WorkState | null
  writeWorkState(directory: string, state: WorkState): boolean
  clearWorkState(directory: string): boolean
  appendSessionId(directory: string, sessionId: string): WorkState | null
  createWorkState(planPath: string, sessionId: string, agent?: string, directory?: string): WorkState
  findPlans(directory: string): string[]
  getPlanProgress(planPath: string): PlanProgress
  getPlanName(planPath: string): string
  getHeadSha(directory: string): string | undefined
  pauseWork(directory: string): boolean
  resumeWork(directory: string): boolean
}
