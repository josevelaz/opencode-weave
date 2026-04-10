/**
 * Start-work hook: detects the /start-work command, resolves the target plan,
 * creates/updates work state, and returns context for injection into the prompt.
 */

import { validatePlan } from "../features/work-state"
import type { ValidationResult } from "../features/work-state"
import { createPlanFsRepository } from "../infrastructure/fs/plan-fs-repository"
import { createPlanService } from "../domain/plans/plan-service"
import { createWorkflowService } from "../domain/workflows/workflow-service"
import { parseBuiltinCommandEnvelope } from "../runtime/opencode/command-envelope"

const PlanService = createPlanService(createPlanFsRepository())
const WorkflowService = createWorkflowService()

export interface StartWorkInput {
  promptText: string
  sessionId: string
  directory: string
}

export interface StartWorkResult {
  /** Context to inject into the prompt (plan path, progress, instructions) */
  contextInjection: string | null
  /** Agent to switch to (always "tapestry" when command is detected) */
  switchAgent: string | null
}

/**
 * Handle the /start-work command.
 * Returns null contextInjection if this message is not a /start-work command.
 */
export function handleStartWork(input: StartWorkInput): StartWorkResult {
  const { promptText, sessionId, directory } = input

  const envelope = parseBuiltinCommandEnvelope(promptText)

  if (!envelope || envelope.command !== "start-work") {
    return { contextInjection: null, switchAgent: null }
  }

  // Check for active workflow (cross-system collision warning)
  const workflowWarning = checkWorkflowActive(directory)
  if (workflowWarning) {
    return { contextInjection: workflowWarning, switchAgent: null }
  }

  const explicitPlanName = envelope.arguments.trim() || extractPlanName(promptText)
  const existingState = PlanService.readWorkState(directory)
  const allPlans = PlanService.findPlans(directory)

  // Case 1: Explicit plan name provided
  if (explicitPlanName) {
    return handleExplicitPlan(explicitPlanName, allPlans, sessionId, directory)
  }

  // Case 2: Existing work state — resume
  if (existingState) {
    const progress = PlanService.getPlanProgress(existingState.active_plan)
    if (!progress.isComplete) {
      // Validate before resuming — a plan may have been edited and become malformed
      const validation = validatePlan(existingState.active_plan, directory)
      if (!validation.valid) {
        PlanService.clearExecution(directory)
        return {
          switchAgent: "tapestry",
          contextInjection: `## Plan Validation Failed\nThe active plan "${existingState.plan_name}" has structural issues. Work state has been cleared.\n\n${formatValidationResults(validation)}\n\nTell the user to fix the plan file and run /start-work again.`,
        }
      }
      const resumedState = PlanService.resumeExecution(directory, sessionId) ?? existingState
      const resumeContext = buildResumeContext(resumedState.active_plan, resumedState.plan_name, progress, resumedState.start_sha, directory)
      if (validation.warnings.length > 0) {
        return {
          switchAgent: "tapestry",
          contextInjection: `${resumeContext}\n\n### Validation Warnings\n${formatValidationResults(validation)}`,
        }
      }
      return {
        switchAgent: "tapestry",
        contextInjection: resumeContext,
      }
    }
    // Previous plan is complete — fall through to discovery
  }

  // Case 3: Discover plans
  return handlePlanDiscovery(allPlans, sessionId, directory)
}

/**
 * Check whether a workflow is currently active (running or paused).
 * Returns a markdown warning string if active, or null otherwise.
 */
function checkWorkflowActive(directory: string): string | null {
  const instance = WorkflowService.getActiveWorkflowInstance(directory)
  if (!instance) return null
  if (instance.status !== "running" && instance.status !== "paused") return null

  const definition = WorkflowService.loadWorkflowDefinition(instance.definition_path)
  const totalSteps = definition ? definition.steps.length : 0
  const completedSteps = Object.values(instance.steps).filter((step) => step.status === "completed").length

  const status = instance.status === "paused" ? "paused" : "running"

  return `## Active Workflow Detected

There is currently an active workflow: "${instance.definition_name}" (${instance.instance_id})
Goal: "${instance.goal}"
Status: ${status} • Progress: ${completedSteps}/${totalSteps} steps complete

Starting plan execution will conflict with the active workflow — both systems use the idle loop and only one can drive at a time.

**Options:**
- **Proceed anyway** — the workflow will be paused and can be resumed with \`/run-workflow\` after the plan completes
- **Abort the workflow first** — cancel the workflow, then start the plan
- **Cancel** — don't start the plan, continue with the workflow`
}

/**
 * Extract plan name from <user-request> tags in the prompt.
 */
function extractPlanName(promptText: string): string | null {
  const match = promptText.match(/<user-request>\s*([\s\S]*?)\s*<\/user-request>/i)
  if (!match) return null
  const cleaned = match[1].trim()
  return cleaned || null
}

/**
 * Handle explicit plan name: find matching plan, create state.
 */
function handleExplicitPlan(
  requestedName: string,
  allPlans: string[],
  sessionId: string,
  directory: string,
): StartWorkResult {
  const matched = PlanService.matchPlanByName(allPlans, requestedName)

  if (!matched) {
    const incompletePlans = PlanService.findIncompletePlans(allPlans)
    const listing =
      incompletePlans.length > 0
        ? incompletePlans.map((p) => `  - ${PlanService.getPlanName(p)}`).join("\n")
        : "  (none)"
    return {
      switchAgent: "tapestry",
      contextInjection: `## Plan Not Found\nNo plan matching "${requestedName}" was found.\n\nAvailable incomplete plans:\n${listing}\n\nTell the user which plans are available and ask them to specify one.`,
    }
  }

  const progress = PlanService.getPlanProgress(matched)
  if (progress.isComplete) {
    return {
      switchAgent: "tapestry",
      contextInjection: `## Plan Already Complete\nThe plan "${PlanService.getPlanName(matched)}" has all ${progress.total} tasks completed.\nTell the user this plan is already done and suggest creating a new one with Pattern.`,
    }
  }

  // Validate the plan before creating work state
  const validation = validatePlan(matched, directory)
  if (!validation.valid) {
    return {
        switchAgent: "tapestry",
        contextInjection: `## Plan Validation Failed\nThe plan "${PlanService.getPlanName(matched)}" has structural issues that must be fixed before execution can begin.\n\n${formatValidationResults(validation)}\n\nTell the user to fix these issues in the plan file and try again.`,
      }
  }

  const state = PlanService.createExecution(directory, matched, sessionId, "tapestry")

  const freshContext = buildFreshContext(matched, PlanService.getPlanName(matched), progress, state.start_sha, directory)
  if (validation.warnings.length > 0) {
    return {
      switchAgent: "tapestry",
      contextInjection: `${freshContext}\n\n### Validation Warnings\n${formatValidationResults(validation)}`,
    }
  }
  return {
    switchAgent: "tapestry",
    contextInjection: freshContext,
  }
}

/**
 * Handle plan discovery when no explicit name given and no active state.
 */
function handlePlanDiscovery(
  allPlans: string[],
  sessionId: string,
  directory: string,
): StartWorkResult {
  if (allPlans.length === 0) {
    return {
      switchAgent: "tapestry",
      contextInjection:
        "## No Plans Found\nNo plan files found at `.weave/plans/`.\nTell the user to switch to Pattern agent to create a work plan first.",
    }
  }

  const incompletePlans = PlanService.findIncompletePlans(allPlans)

  if (incompletePlans.length === 0) {
    return {
      switchAgent: "tapestry",
      contextInjection:
        "## All Plans Complete\nAll existing plans have been completed.\nTell the user to switch to Pattern agent to create a new plan.",
    }
  }

  if (incompletePlans.length === 1) {
    const plan = incompletePlans[0]
    const progress = PlanService.getPlanProgress(plan)

    // Validate the plan before creating work state
    const validation = validatePlan(plan, directory)
    if (!validation.valid) {
      return {
        switchAgent: "tapestry",
        contextInjection: `## Plan Validation Failed\nThe plan "${PlanService.getPlanName(plan)}" has structural issues that must be fixed before execution can begin.\n\n${formatValidationResults(validation)}\n\nTell the user to fix these issues in the plan file and try again.`,
      }
    }

    const state = PlanService.createExecution(directory, plan, sessionId, "tapestry")

    const freshContext = buildFreshContext(plan, PlanService.getPlanName(plan), progress, state.start_sha, directory)
    if (validation.warnings.length > 0) {
      return {
        switchAgent: "tapestry",
        contextInjection: `${freshContext}\n\n### Validation Warnings\n${formatValidationResults(validation)}`,
      }
    }
    return {
      switchAgent: "tapestry",
      contextInjection: freshContext,
    }
  }

  // Multiple incomplete plans — list them for the user to choose
  const listing = incompletePlans
    .map((p) => {
      const progress = PlanService.getPlanProgress(p)
      return `  - **${PlanService.getPlanName(p)}** (${progress.completed}/${progress.total} tasks done)`
    })
    .join("\n")

  return {
    switchAgent: "tapestry",
    contextInjection: `## Multiple Plans Found\nThere are ${incompletePlans.length} incomplete plans:\n${listing}\n\nAsk the user which plan to work on. They can run \`/start-work [plan-name]\` to select one.`,
  }
}

/**
 * Format validation errors and warnings as a markdown string.
 */
export function formatValidationResults(result: ValidationResult): string {
  const lines: string[] = []

  if (result.errors.length > 0) {
    lines.push("**Errors (blocking):**")
    for (const err of result.errors) {
      lines.push(`- [${err.category}] ${err.message}`)
    }
  }

  if (result.warnings.length > 0) {
    if (result.errors.length > 0) lines.push("")
    lines.push("**Warnings:**")
    for (const warn of result.warnings) {
      lines.push(`- [${warn.category}] ${warn.message}`)
    }
  }

  return lines.join("\n")
}

function buildFreshContext(
  planPath: string,
  planName: string,
  progress: { total: number; completed: number },
  startSha?: string,
  directory?: string,
): string {
  const shaLine = startSha ? `\n**Start SHA**: ${startSha}` : ""
  const dirLine = directory ? `\n**Working directory**: \`${directory}\`` : ""
  return `## Starting Plan: ${planName}
**Plan file**: \`${planPath}\`
**Progress**: ${progress.completed}/${progress.total} tasks completed${shaLine}${dirLine}

Read the plan file now and begin executing from the first unchecked \`- [ ]\` task.

**SIDEBAR TODOS — DO THIS FIRST:**
Before starting any work, use todowrite to populate the sidebar:
1. Create a summary todo (in_progress): "${planName} ${progress.completed}/${progress.total}"
2. Create a todo for the first unchecked task (in_progress)
3. Create todos for the next 2-3 tasks (pending)
Keep each todo under 35 chars. Update as you complete tasks.`
}

function buildResumeContext(
  planPath: string,
  planName: string,
  progress: { total: number; completed: number },
  startSha?: string,
  directory?: string,
): string {
  const remaining = progress.total - progress.completed
  const shaLine = startSha ? `\n**Start SHA**: ${startSha}` : ""
  const dirLine = directory ? `\n**Working directory**: \`${directory}\`` : ""
  return `## Resuming Plan: ${planName}
**Plan file**: \`${planPath}\`
**Progress**: ${progress.completed}/${progress.total} tasks completed
**Status**: RESUMING — continuing from where the previous session left off.${shaLine}${dirLine}

Read the plan file now and continue from the first unchecked \`- [ ]\` task.

**SIDEBAR TODOS — RESTORE STATE:**
Previous session's todos are lost. Use todowrite to restore the sidebar:
1. Create a summary todo (in_progress): "${planName} ${progress.completed}/${progress.total}"
2. Create a todo for the next unchecked task (in_progress)
3. Create todos for the following 2-3 tasks (pending)
Keep each todo under 35 chars. ${remaining} task${remaining !== 1 ? "s" : ""} remaining.`
}
