import type { PlanRepository } from "../../domain/plans/plan-repository"
import {
  appendSessionIdInFs,
  clearWorkStateFromFs,
  createWorkStateRecord,
  findPlansInFs,
  getHeadShaFromFs,
  getPlanNameFromPath,
  getPlanProgressFromFs,
  pauseWorkInFs,
  readWorkStateFromFs,
  resumeWorkInFs,
  writeWorkStateToFs,
} from "./work-state-fs-store"

export function createPlanFsRepository(): PlanRepository {
  return {
    readWorkState: readWorkStateFromFs,
    writeWorkState: writeWorkStateToFs,
    clearWorkState: clearWorkStateFromFs,
    appendSessionId: appendSessionIdInFs,
    createWorkState: createWorkStateRecord,
    findPlans: findPlansInFs,
    getPlanProgress: getPlanProgressFromFs,
    getPlanName: getPlanNameFromPath,
    getHeadSha: getHeadShaFromFs,
    pauseWork: pauseWorkInFs,
    resumeWork: resumeWorkInFs,
  }
}
