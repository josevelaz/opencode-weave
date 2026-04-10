import { createPlanFsRepository } from "../../infrastructure/fs/plan-fs-repository"
import type { PlanProgress, WorkState } from "./types"

const Repository = createPlanFsRepository()

/**
 * Read work state from .weave/state.json.
 * Returns null if file is missing, unparseable, or invalid.
 */
export function readWorkState(directory: string): WorkState | null {
  return Repository.readWorkState(directory)
}

/**
 * Write work state to .weave/state.json.
 * Creates .weave/ directory if needed.
 */
export function writeWorkState(directory: string, state: WorkState): boolean {
  return Repository.writeWorkState(directory, state)
}

/**
 * Clear work state by deleting .weave/state.json.
 */
export function clearWorkState(directory: string): boolean {
  return Repository.clearWorkState(directory)
}

/**
 * Append a session ID to the work state (if not already present).
 * Returns the updated state, or null if no state exists.
 */
export function appendSessionId(directory: string, sessionId: string): WorkState | null {
  return Repository.appendSessionId(directory, sessionId)
}

/**
 * Create a fresh WorkState for a plan file.
 */
export function createWorkState(planPath: string, sessionId: string, agent?: string, directory?: string): WorkState {
  return Repository.createWorkState(planPath, sessionId, agent, directory)
}

/**
 * Get the current HEAD SHA of the git repo at the given directory.
 * Returns undefined if not a git repo or git is unavailable.
 */
export function getHeadSha(directory: string): string | undefined {
  return Repository.getHeadSha(directory)
}

/**
 * Find all plan files in .weave/plans/, sorted by modification time (newest first).
 * Returns absolute paths.
 */
export function findPlans(directory: string): string[] {
  return Repository.findPlans(directory)
}

/**
 * Count checked and unchecked markdown checkboxes in a plan file.
 * Returns isComplete: true if file is missing, has 0 checkboxes, or all are checked.
 */
export function getPlanProgress(planPath: string): PlanProgress {
  return Repository.getPlanProgress(planPath)
}

/**
 * Extract plan name from file path (basename minus .md extension).
 */
export function getPlanName(planPath: string): string {
  return Repository.getPlanName(planPath)
}

/**
 * Pause work by setting paused: true in the work state.
 * Returns false if no state exists (e.g., no active plan).
 */
export function pauseWork(directory: string): boolean {
  return Repository.pauseWork(directory)
}

/**
 * Resume work by setting paused: false in the work state.
 * Returns false if no state exists.
 */
export function resumeWork(directory: string): boolean {
  return Repository.resumeWork(directory)
}
