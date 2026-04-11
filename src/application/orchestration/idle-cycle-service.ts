import type { CreatedHooks } from "../../hooks/create-hooks"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import { createWorkflowService } from "../../domain/workflows/workflow-service"
import {
  shouldCheckWorkContinuation,
  shouldCheckWorkflowContinuation,
  shouldFinalizeTodos,
} from "./execution-coordinator"

const WorkflowService = createWorkflowService()

export async function runIdleCycle(input: {
  sessionId: string
  directory: string
  hooks: CreatedHooks
  lastAssistantMessage?: string
  lastUserMessage?: string
  todoContinuationEnforcer: { checkAndFinalize: (sessionId: string) => Promise<void> } | null
}): Promise<RuntimeEffect[]> {
  const effects: RuntimeEffect[] = []
  const activeWorkflow = WorkflowService.getActiveWorkflowInstance(input.directory)

  if (shouldCheckWorkflowContinuation(input.hooks, input.directory) && activeWorkflow && input.hooks.workflowContinuation) {
    const result = input.hooks.workflowContinuation(input.sessionId, input.lastAssistantMessage, input.lastUserMessage)
    if (result.continuationPrompt) {
      effects.push({
        type: "injectPromptAsync",
        sessionId: input.sessionId,
        text: result.continuationPrompt,
        agent: result.switchAgent,
      })
      return effects
    }
  }

  let continuationFired = false
  if (shouldCheckWorkContinuation(input.hooks, input.directory) && input.hooks.workContinuation) {
    const result = input.hooks.workContinuation(input.sessionId)
    if (result.continuationPrompt) {
      effects.push({
        type: "injectPromptAsync",
        sessionId: input.sessionId,
        text: result.continuationPrompt,
        agent: result.switchAgent,
      })
      continuationFired = true
    }
  }

  if (shouldFinalizeTodos(input.hooks, input.directory, continuationFired) && input.todoContinuationEnforcer) {
    await input.todoContinuationEnforcer.checkAndFinalize(input.sessionId)
  }

  return effects
}
