import type { RuntimeEffect } from "../../runtime/opencode/effects"
import { createWorkflowService } from "../../domain/workflows/workflow-service"
import type { RuntimeSessionIdleInput } from "../policy/runtime-policy"
import {
  shouldCheckWorkContinuation,
  shouldCheckWorkflowContinuation,
  shouldFinalizeTodos,
} from "./execution-coordinator"

const WorkflowService = createWorkflowService()

export interface IdleCycleInput {
  sessionId: string
  directory: string
  hooks: RuntimeSessionIdleInput["hooks"]
  lastAssistantMessage?: string
  lastUserMessage?: string
  todoContinuationEnforcer: { checkAndFinalize: (sessionId: string) => Promise<void> } | null
}

export interface IdleContinuationStepResult {
  effects: RuntimeEffect[]
  continuationFired: boolean
}

export function runWorkflowIdleStep(input: IdleCycleInput): RuntimeEffect[] {
  const activeWorkflow = WorkflowService.getActiveWorkflowInstance(input.directory)

  if (shouldCheckWorkflowContinuation(input.hooks, input.directory) && activeWorkflow && input.hooks.workflowContinuation) {
    const result = input.hooks.workflowContinuation(input.sessionId, input.lastAssistantMessage, input.lastUserMessage)
    if (result.continuationPrompt) {
      return [{
        type: "injectPromptAsync",
        sessionId: input.sessionId,
        text: result.continuationPrompt,
        agent: result.switchAgent,
      }]
    }
  }

  return []
}

export function runWorkIdleStep(input: IdleCycleInput): IdleContinuationStepResult {
  const effects: RuntimeEffect[] = []

  if (shouldCheckWorkContinuation(input.hooks, input.directory) && input.hooks.workContinuation) {
    const result = input.hooks.workContinuation(input.sessionId)
    if (result.continuationPrompt) {
      effects.push({
        type: "injectPromptAsync",
        sessionId: input.sessionId,
        text: result.continuationPrompt,
        agent: result.switchAgent,
      })
      return { effects, continuationFired: true }
    }
  }

  return { effects, continuationFired: false }
}

export async function runTodoFinalizationIdleStep(
  input: IdleCycleInput,
  continuationFired: boolean,
): Promise<void> {
  if (shouldFinalizeTodos(input.hooks, input.directory, continuationFired) && input.todoContinuationEnforcer) {
    await input.todoContinuationEnforcer.checkAndFinalize(input.sessionId)
  }
}

export function runVerificationIdleStep(_input: IdleCycleInput): RuntimeEffect[] {
  return []
}

export async function runIdleCycle(input: IdleCycleInput): Promise<RuntimeEffect[]> {
  const workflowEffects = runWorkflowIdleStep(input)
  if (workflowEffects.length > 0) {
    return workflowEffects
  }

  const workStep = runWorkIdleStep(input)
  await runTodoFinalizationIdleStep(input, workStep.continuationFired)
  const verificationEffects = runVerificationIdleStep(input)
  return [...workStep.effects, ...verificationEffects]
}
