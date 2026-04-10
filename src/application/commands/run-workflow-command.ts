import type { CreatedHooks } from "../../hooks/create-hooks"
import type { RuntimeEffect } from "../../runtime/opencode/effects"

export function executeRunWorkflowCommand(input: {
  hooks: CreatedHooks
  promptText: string
  sessionId: string
  isRunWorkflowCommand: boolean
}): RuntimeEffect[] {
  if (!input.hooks.workflowStart || !input.isRunWorkflowCommand) {
    return []
  }

  const result = input.hooks.workflowStart(input.promptText, input.sessionId)
  const effects: RuntimeEffect[] = []
  if (result.switchAgent) {
    effects.push({ type: "switchAgent", agent: result.switchAgent })
  }
  if (result.contextInjection) {
    effects.push({ type: "appendPromptText", text: result.contextInjection })
  }
  return effects
}
