import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { RuntimeChatMessageInput } from "../policy/runtime-policy"

export function executeRunWorkflowCommand(input: {
  hooks: RuntimeChatMessageInput["hooks"]
  promptText: string
  sessionId: string
  parsedEnvelope: RuntimeChatMessageInput["parsedEnvelope"]
  isRunWorkflowCommand: boolean
}): RuntimeEffect[] {
  if (
    !input.hooks.workflowStart
    || !input.isRunWorkflowCommand
    || input.parsedEnvelope?.kind !== "builtin-command"
    || input.parsedEnvelope.command !== "run-workflow"
  ) {
    return []
  }

  const result = input.hooks.workflowStart(input.promptText, input.sessionId)
  const effects: RuntimeEffect[] = []
  if (result.switchAgent) {
    effects.push({ type: "switchAgent", agent: result.switchAgent })
    effects.push({ type: "restoreAgent", sessionId: input.sessionId, agent: result.switchAgent })
  }
  if (result.contextInjection) {
    effects.push({ type: "appendPromptText", text: result.contextInjection })
  }
  return effects
}
