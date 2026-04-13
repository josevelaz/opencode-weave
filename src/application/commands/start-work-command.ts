import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { RuntimeChatMessageInput } from "../policy/runtime-policy"

export function executeStartWorkCommand(input: {
  hooks: RuntimeChatMessageInput["hooks"]
  promptText: string
  sessionId: string
  parsedEnvelope: RuntimeChatMessageInput["parsedEnvelope"]
  isWorkflowCommand: boolean
}): RuntimeEffect[] {
  if (
    !input.hooks.startWork
    || input.isWorkflowCommand
    || input.parsedEnvelope?.kind !== "builtin-command"
    || input.parsedEnvelope.command !== "start-work"
  ) {
    return []
  }

  const result = input.hooks.startWork(input.promptText, input.sessionId)
  return commandResultToEffects(result, input.sessionId)
}

function commandResultToEffects(
  result: { contextInjection: string | null; switchAgent: string | null },
  sessionId: string,
): RuntimeEffect[] {
  const effects: RuntimeEffect[] = []
  if (result.switchAgent) {
    effects.push({ type: "switchAgent", agent: result.switchAgent })
    effects.push({ type: "restoreAgent", sessionId, agent: result.switchAgent })
  }
  if (result.contextInjection) {
    effects.push({ type: "appendPromptText", text: result.contextInjection })
  }
  return effects
}
