/**
 * Workflow hook handler: detects /run-workflow commands, parses arguments,
 * manages workflow instances, and drives step transitions on session.idle.
 */

import { info } from "../../shared/log"
import { createPlanFsRepository } from "../../infrastructure/fs/plan-fs-repository"
import { createPlanService } from "../../domain/plans/plan-service"
import { createWorkflowService } from "../../domain/workflows/workflow-service"
import { buildWorkflowContinuationPrompt } from "../../domain/workflows/workflow-context"
import { checkWorkflowCompletion } from "../../domain/workflows/workflow-completion"
import type { CompletionContext } from "./index"
import { parseBuiltinCommandEnvelope } from "../../runtime/opencode/command-envelope"
import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"

const PlanService = createPlanService(createPlanFsRepository())
const WorkflowService = createWorkflowService()
const ExecutionLeaseRepository = createExecutionLeaseFsStore()

/**
 * Marker embedded in workflow continuation prompts so the auto-pause guard
 * in plugin-interface.ts can recognize them and NOT pause coexisting WorkState plans.
 */
export const WORKFLOW_CONTINUATION_MARKER = "<!-- weave:workflow-continuation -->"

export interface WorkflowHookResult {
  /** Context to inject into the prompt (step prompt with workflow context) */
  contextInjection: string | null
  /** Agent to switch to for the current step */
  switchAgent: string | null
}

/**
 * Parse /run-workflow arguments into workflow name and optional goal.
 * Argument format: `<workflow-name> "goal text"` or `<workflow-name>` or empty.
 */
export function parseWorkflowArgs(args: string): {
  workflowName: string | null
  goal: string | null
} {
  const trimmed = args.trim()
  if (!trimmed) return { workflowName: null, goal: null }

  // Try to extract quoted goal: workflow-name "goal text"
  const quotedMatch = trimmed.match(/^(\S+)\s+"([^"]+)"$/)
  if (quotedMatch) {
    return { workflowName: quotedMatch[1], goal: quotedMatch[2] }
  }

  // Try single-quoted: workflow-name 'goal text'
  const singleQuotedMatch = trimmed.match(/^(\S+)\s+'([^']+)'$/)
  if (singleQuotedMatch) {
    return { workflowName: singleQuotedMatch[1], goal: singleQuotedMatch[2] }
  }

  // No quotes — check if there's additional text after the workflow name
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { workflowName: parts[0], goal: null }
  }

  // Multiple words without quotes — first word is name, rest is goal
  return { workflowName: parts[0], goal: parts.slice(1).join(" ") }
}

/**
 * Handle the /run-workflow command.
 * Detects the command via <session-context> tag, parses arguments,
 * and either creates a new instance, resumes an existing one, or lists available definitions.
 */
export function handleRunWorkflow(input: {
  promptText: string
  sessionId: string
  directory: string
  workflowDirs?: string[]
}): WorkflowHookResult {
  const { promptText, sessionId, directory, workflowDirs } = input

  const envelope = parseBuiltinCommandEnvelope(promptText)

  if (!envelope || envelope.command !== "run-workflow") {
    return { contextInjection: null, switchAgent: null }
  }

  const args = envelope.arguments || extractArguments(promptText)
  const { workflowName, goal } = parseWorkflowArgs(args)

  // Check for active work-state plan (cross-system collision warning)
  const workStateWarning = checkWorkStatePlanActive(directory)

  // Check for existing active instance
  const activeInstance = WorkflowService.getActiveWorkflowInstance(directory)

  // Case 1: No args, no active instance → list available definitions
  if (!workflowName && !activeInstance) {
    const result = listAvailableWorkflows(directory, workflowDirs)
    return prependWarning(result, workStateWarning)
  }

  // Case 2: No args, active instance exists → resume it
  if (!workflowName && activeInstance) {
    if (!isSessionAllowedForWorkflow(directory, activeInstance, sessionId)) {
      return { contextInjection: null, switchAgent: null }
    }
    const result = resumeActiveWorkflow(directory, sessionId)
    return prependWarning(result, workStateWarning)
  }

  // Case 3: Workflow name provided, no goal, active instance matches → resume
  if (workflowName && !goal && activeInstance && activeInstance.definition_id === workflowName) {
    if (!isSessionAllowedForWorkflow(directory, activeInstance, sessionId)) {
      return { contextInjection: null, switchAgent: null }
    }
    const result = resumeActiveWorkflow(directory, sessionId)
    return prependWarning(result, workStateWarning)
  }

  // Case 4: Workflow name provided with goal → start new instance
  if (workflowName && goal) {
    // Check for existing active instance — can't start new while one is active
    if (activeInstance) {
       if (!isSessionAllowedForWorkflow(directory, activeInstance, sessionId)) {
        return {
          contextInjection: `## Workflow Owned By Another Session\nWorkflow "${activeInstance.definition_name}" is currently bound to another session (${activeInstance.instance_id}).\nGoal: "${activeInstance.goal}"\n\nResume it from the owning session, or abort it there before starting a new workflow.`,
          switchAgent: null,
        }
      }

      return {
        contextInjection: `## Workflow Already Active\nThere is already an active workflow: "${activeInstance.definition_name}" (${activeInstance.instance_id}).\nGoal: "${activeInstance.goal}"\n\nTo start a new workflow, first abort the current one with \`/workflow abort\` or let it complete.`,
        switchAgent: null,
      }
    }

    const result = startNewWorkflow(workflowName, goal, sessionId, directory, workflowDirs)
    return prependWarning(result, workStateWarning)
  }

  // Case 5: Workflow name provided, no goal, no matching active instance → start with name only
  if (workflowName && !goal) {
    if (activeInstance) {
      if (!isSessionAllowedForWorkflow(directory, activeInstance, sessionId)) {
        return {
          contextInjection: `## Workflow Owned By Another Session\nWorkflow "${activeInstance.definition_name}" is currently bound to another session (${activeInstance.instance_id}).\nGoal: "${activeInstance.goal}"\n\nResume it from the owning session, or abort it there before starting a new workflow.`,
          switchAgent: null,
        }
      }

      return {
        contextInjection: `## Workflow Already Active\nThere is already an active workflow: "${activeInstance.definition_name}" (${activeInstance.instance_id}).\nGoal: "${activeInstance.goal}"\n\nDid you mean to resume the active workflow? Run \`/run-workflow\` without arguments to resume.`,
        switchAgent: null,
      }
    }

    // No active instance, no goal — need a goal to start
    return {
      contextInjection: `## Goal Required\nTo start the "${workflowName}" workflow, provide a goal:\n\`/run-workflow ${workflowName} "your goal here"\``,
      switchAgent: null,
    }
  }

  return { contextInjection: null, switchAgent: null }
}

/**
 * Check workflow continuation on session.idle.
 * If an active workflow instance exists and the current step's completion condition is met,
 * advance to the next step and return a continuation prompt.
 */
export function checkWorkflowContinuation(input: {
  sessionId: string
  directory: string
  lastAssistantMessage?: string
  lastUserMessage?: string
  workflowDirs?: string[]
}): { continuationPrompt: string | null; switchAgent: string | null } {
  const { directory, lastAssistantMessage, lastUserMessage } = input

  const instance = WorkflowService.getActiveWorkflowInstance(directory)
  if (!instance) return { continuationPrompt: null, switchAgent: null }
  if (instance.status !== "running") return { continuationPrompt: null, switchAgent: null }
  const activeLease = ExecutionLeaseRepository.readExecutionLease(directory)
  if (activeLease?.owner_kind === "workflow" && activeLease.session_id && activeLease.session_id !== input.sessionId) {
    return { continuationPrompt: null, switchAgent: null }
  }
  if (instance.session_ids.length > 0 && instance.session_ids.at(-1) !== input.sessionId) {
    return { continuationPrompt: null, switchAgent: null }
  }

  const definition = WorkflowService.loadWorkflowDefinition(instance.definition_path)
  if (!definition) return { continuationPrompt: null, switchAgent: null }

  const currentStepDef = definition.steps.find((s) => s.id === instance.current_step_id)
  if (!currentStepDef) return { continuationPrompt: null, switchAgent: null }

  const completionContext: CompletionContext = {
    directory,
    config: currentStepDef.completion,
    artifacts: instance.artifacts,
    lastAssistantMessage,
    lastUserMessage,
  }

  const action = checkWorkflowCompletion(directory, completionContext)

  switch (action.type) {
    case "inject_prompt":
      return {
        continuationPrompt: buildWorkflowContinuationPrompt({
          sessionId: input.sessionId,
          body: action.prompt ?? "",
        }),
        switchAgent: action.agent ?? currentStepDef.agent,
      }
    case "complete":
      return {
        continuationPrompt: buildWorkflowContinuationPrompt({
          sessionId: input.sessionId,
          body: `## Workflow Complete\n${action.reason ?? "All steps have been completed."}\n\nSummarize what was accomplished across all workflow steps.`,
        }),
        switchAgent: currentStepDef.agent,
      }
    case "pause":
      return {
        continuationPrompt: buildWorkflowContinuationPrompt({
          sessionId: input.sessionId,
          body: `## Workflow Paused\n${action.reason ?? "The workflow has been paused."}\n\nInform the user about the pause and what to do next.`,
        }),
        switchAgent: currentStepDef.agent,
      }
    case "none":
    default:
      return { continuationPrompt: null, switchAgent: null }
  }
}

/**
 * Check whether a work-state plan is currently active (not complete).
 * Returns a markdown warning string if active, or null otherwise.
 */
function checkWorkStatePlanActive(directory: string): string | null {
  const state = PlanService.readWorkState(directory)
  if (!state) return null

  const progress = PlanService.getPlanProgress(state.active_plan)
  if (progress.isComplete) return null

  const status = state.paused ? "paused" : "running"
  const planName = state.plan_name ?? state.active_plan

  return `## Active Plan Detected

There is currently an active plan being executed: "${planName}"
Status: ${status} • Progress: ${progress.completed}/${progress.total} tasks complete

Starting a workflow will take priority over the active plan — plan continuation will be suspended while the workflow runs.

**Options:**
- **Proceed anyway** — the plan will be paused and can be resumed with \`/start-work\` after the workflow completes
- **Abort the plan first** — abandon the current plan, then start the workflow
- **Cancel** — don't start the workflow, continue with the plan`
}

/**
 * Prepend a work-state warning to a WorkflowHookResult's contextInjection.
 * If the result already has contextInjection, joins them with a separator.
 * If the result has no contextInjection, uses the warning alone.
 * If warning is null, returns the result unchanged.
 */
function prependWarning(result: WorkflowHookResult, warning: string | null): WorkflowHookResult {
  if (!warning) return result
  if (!result.contextInjection) {
    return { ...result, contextInjection: warning }
  }
  return { ...result, contextInjection: `${warning}\n\n---\n\n${result.contextInjection}` }
}

// ─── Private helpers ────────────────────────────────────────────────────────

/**
 * Extract the arguments from <user-request> tags.
 */
function extractArguments(promptText: string): string {
  const match = promptText.match(/<user-request>\s*([\s\S]*?)\s*<\/user-request>/i)
  if (!match) return ""
  return match[1].trim()
}

/**
 * List available workflow definitions.
 */
function listAvailableWorkflows(directory: string, workflowDirs?: string[]): WorkflowHookResult {
  const workflows = WorkflowService.discoverWorkflows(directory, workflowDirs)
  if (workflows.length === 0) {
    return {
      contextInjection:
        "## No Workflows Available\nNo workflow definitions found.\n\nWorkflow definitions should be placed in `.opencode/workflows/` (project) or `~/.config/opencode/workflows/` (user).",
      switchAgent: null,
    }
  }

  const listing = workflows
    .map((workflow) => `  - **${workflow.definition.name}**: ${workflow.definition.description ?? "(no description)"} (${workflow.scope})`)
    .join("\n")

  return {
    contextInjection: `## Available Workflows\n${listing}\n\nTo start a workflow, run:\n\`/run-workflow <name> "your goal"\``,
    switchAgent: null,
  }
}

/**
 * Resume the currently active workflow instance.
 */
function resumeActiveWorkflow(directory: string, sessionId: string): WorkflowHookResult {
  const action = WorkflowService.resumeWorkflow(directory, sessionId)
  if (action.type === "none") {
    // Instance exists but isn't paused — it's running. Return current step info.
    const instance = WorkflowService.getActiveWorkflowInstance(directory)
    if (instance && instance.status === "running") {
      const definition = WorkflowService.loadWorkflowDefinition(instance.definition_path)
      if (definition) {
        const currentStep = definition.steps.find((s) => s.id === instance.current_step_id)
        return {
          contextInjection: `## Workflow In Progress\nWorkflow "${instance.definition_name}" is already running.\nCurrent step: **${currentStep?.name ?? instance.current_step_id}**\nGoal: "${instance.goal}"\n\nContinue with the current step.`,
          switchAgent: currentStep?.agent ?? null,
        }
      }
    }
    return { contextInjection: null, switchAgent: null }
  }

  return {
    contextInjection: action.prompt ?? null,
    switchAgent: action.agent ?? null,
  }
}

function isSessionAllowedForWorkflow(
  directory: string,
  instance: { session_ids: string[] },
  sessionId: string,
): boolean {
  const activeLease = ExecutionLeaseRepository.readExecutionLease(directory)
  if (activeLease?.owner_kind === "workflow" && activeLease.session_id) {
    return activeLease.session_id === sessionId
  }

  return instance.session_ids.length === 0 || instance.session_ids.at(-1) === sessionId
}

/**
 * Start a new workflow from a definition name and goal.
 */
function startNewWorkflow(
  workflowName: string,
  goal: string,
  sessionId: string,
  directory: string,
  workflowDirs?: string[],
): WorkflowHookResult {
  const workflows = WorkflowService.discoverWorkflows(directory, workflowDirs)
  const match = workflows.find((w) => w.definition.name === workflowName)

  if (!match) {
    const available = workflows.map((w) => w.definition.name).join(", ")
    return {
      contextInjection: `## Workflow Not Found\nNo workflow definition named "${workflowName}" was found.\n${available ? `Available workflows: ${available}` : "No workflow definitions available."}`,
      switchAgent: null,
    }
  }

  const action = WorkflowService.startWorkflow({
    definition: match.definition,
    definitionPath: match.path,
    goal,
    sessionId,
    directory,
  })

  info("Workflow started", {
    workflowName: match.definition.name,
    goal,
    agent: action.agent,
  })

  return {
    contextInjection: action.prompt ?? null,
    switchAgent: action.agent ?? null,
  }
}
