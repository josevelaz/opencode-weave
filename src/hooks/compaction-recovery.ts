import { readWorkState, getPlanProgress } from "../features/work-state"
import { CONTINUATION_MARKER } from "./work-continuation"
import {
  getActiveWorkflowInstance,
  loadWorkflowDefinition,
  composeStepPrompt,
  WORKFLOW_CONTINUATION_MARKER,
} from "../features/workflow"

export interface CompactionRecoveryInput {
  sessionId: string
  directory: string
}

export interface CompactionRecoveryResult {
  continuationPrompt: string | null
  switchAgent: string | null
}

export function checkCompactionRecovery(input: CompactionRecoveryInput): CompactionRecoveryResult {
  const workflowRecovery = buildWorkflowRecoveryPrompt(input)
  if (workflowRecovery.continuationPrompt) {
    return workflowRecovery
  }

  return buildWorkRecoveryPrompt(input)
}

function buildWorkflowRecoveryPrompt(input: CompactionRecoveryInput): CompactionRecoveryResult {
  const instance = getActiveWorkflowInstance(input.directory)
  if (!instance || instance.status !== "running") {
    return { continuationPrompt: null, switchAgent: null }
  }

  if (instance.session_ids.length > 0 && !instance.session_ids.includes(input.sessionId)) {
    return { continuationPrompt: null, switchAgent: null }
  }

  const definition = loadWorkflowDefinition(instance.definition_path)
  if (!definition) {
    return { continuationPrompt: null, switchAgent: null }
  }

  const currentStep = definition.steps.find((step) => step.id === instance.current_step_id)
  if (!currentStep) {
    return { continuationPrompt: null, switchAgent: null }
  }

  return {
    continuationPrompt: [
      WORKFLOW_CONTINUATION_MARKER,
      "## Context Restored After Compaction",
      "Resume the active workflow from persisted state.",
      "",
      composeStepPrompt(currentStep, instance, definition),
    ].join("\n"),
    switchAgent: null,
  }
}

function buildWorkRecoveryPrompt(input: CompactionRecoveryInput): CompactionRecoveryResult {
  const state = readWorkState(input.directory)
  if (!state || state.paused) {
    return { continuationPrompt: null, switchAgent: null }
  }

  if (state.session_ids.length > 0 && !state.session_ids.includes(input.sessionId)) {
    return { continuationPrompt: null, switchAgent: null }
  }

  const progress = getPlanProgress(state.active_plan)
  if (progress.isComplete) {
    return { continuationPrompt: null, switchAgent: null }
  }

  const remaining = progress.total - progress.completed

  return {
    continuationPrompt: [
      CONTINUATION_MARKER,
      "## Context Restored After Compaction",
      "Resume your active work plan from persisted state.",
      "",
      `**Plan**: ${state.plan_name}`,
      `**File**: \`${state.active_plan}\``,
      `**Working directory**: \`${input.directory}\``,
      `**Progress**: ${progress.completed}/${progress.total} tasks completed (${remaining} remaining)`,
      "",
      "1. Read the plan file now and re-check the first unchecked task",
      "2. Restore sidebar todos from current plan progress",
      "3. Continue execution from persisted state without restarting the plan",
    ].join("\n"),
    switchAgent: null,
  }
}
