import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs"
import { execSync } from "child_process"
import { basename, join } from "path"
import type { PlanProgress, WorkState } from "../../features/work-state/types"
import { PLANS_DIR, WEAVE_DIR, WORK_STATE_FILE } from "../../features/work-state/constants"

const UncheckedRegex = /^[-*]\s*\[\s*\]/gm
const CheckedRegex = /^[-*]\s*\[[xX]\]/gm

export function readWorkStateFromFs(directory: string): WorkState | null {
  const filePath = join(directory, WEAVE_DIR, WORK_STATE_FILE)
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const raw = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    if (typeof parsed.active_plan !== "string") {
      return null
    }
    if (!Array.isArray(parsed.session_ids)) {
      parsed.session_ids = []
    }

    return parsed as WorkState
  } catch {
    return null
  }
}

export function writeWorkStateToFs(directory: string, state: WorkState): boolean {
  try {
    const workDir = join(directory, WEAVE_DIR)
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true })
    }

    writeFileSync(join(workDir, WORK_STATE_FILE), JSON.stringify(state, null, 2), "utf-8")
    return true
  } catch {
    return false
  }
}

export function clearWorkStateFromFs(directory: string): boolean {
  const filePath = join(directory, WEAVE_DIR, WORK_STATE_FILE)
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
    return true
  } catch {
    return false
  }
}

export function appendSessionIdInFs(directory: string, sessionId: string): WorkState | null {
  const state = readWorkStateFromFs(directory)
  if (!state) {
    return null
  }
  if (!state.session_ids.includes(sessionId)) {
    state.session_ids.push(sessionId)
    writeWorkStateToFs(directory, state)
  }

  return state
}

export function createWorkStateRecord(planPath: string, sessionId: string, agent?: string, directory?: string): WorkState {
  const startSha = directory ? getHeadShaFromFs(directory) : undefined

  return {
    active_plan: planPath,
    started_at: new Date().toISOString(),
    session_ids: [sessionId],
    plan_name: getPlanNameFromPath(planPath),
    ...(agent !== undefined ? { agent } : {}),
    ...(startSha !== undefined ? { start_sha: startSha } : {}),
  }
}

export function getHeadShaFromFs(directory: string): string | undefined {
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: directory,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()

    return sha || undefined
  } catch {
    return undefined
  }
}

export function findPlansInFs(directory: string): string[] {
  const plansDir = join(directory, PLANS_DIR)
  try {
    if (!existsSync(plansDir)) {
      return []
    }

    return readdirSync(plansDir)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => {
        const fullPath = join(plansDir, entry)
        return { path: fullPath, mtime: statSync(fullPath).mtimeMs }
      })
      .sort((left, right) => right.mtime - left.mtime)
      .map((entry) => entry.path)
  } catch {
    return []
  }
}

export function getPlanProgressFromFs(planPath: string): PlanProgress {
  if (!existsSync(planPath)) {
    return { total: 0, completed: 0, isComplete: true }
  }

  try {
    const content = readFileSync(planPath, "utf-8")
    const unchecked = content.match(UncheckedRegex) || []
    const checked = content.match(CheckedRegex) || []
    const total = unchecked.length + checked.length
    const completed = checked.length

    return {
      total,
      completed,
      isComplete: total === 0 || completed === total,
    }
  } catch {
    return { total: 0, completed: 0, isComplete: true }
  }
}

export function getPlanNameFromPath(planPath: string): string {
  return basename(planPath, ".md")
}

export function pauseWorkInFs(directory: string): boolean {
  const state = readWorkStateFromFs(directory)
  if (!state) {
    return false
  }

  state.paused = true
  return writeWorkStateToFs(directory, state)
}

export function resumeWorkInFs(directory: string): boolean {
  const state = readWorkStateFromFs(directory)
  if (!state) {
    return false
  }

  state.paused = false
  return writeWorkStateToFs(directory, state)
}
