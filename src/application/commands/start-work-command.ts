import type { CreatedHooks } from "../../hooks/create-hooks"
import type { RuntimeEffect } from "../../runtime/opencode/effects"

export function executeStartWorkCommand(input: {
  hooks: CreatedHooks
  promptText: string
  sessionId: string
  isWorkflowCommand: boolean
}): RuntimeEffect[] {
  if (!input.hooks.startWork || input.isWorkflowCommand) {
    return []
  }

  const result = input.hooks.startWork(input.promptText, input.sessionId)
  return commandResultToEffects(result)
}

function commandResultToEffects(result: { contextInjection: string | null; switchAgent: string | null }): RuntimeEffect[] {
  const effects: RuntimeEffect[] = []
  if (result.switchAgent) {
    effects.push({ type: "switchAgent", agent: result.switchAgent })
  }
  if (result.contextInjection) {
    effects.push({ type: "appendPromptText", text: result.contextInjection })
  }
  return effects
}
