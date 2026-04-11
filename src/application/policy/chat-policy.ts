import { readWorkState } from "../../features/work-state"
import type { ParsedCommandEnvelope } from "../../runtime/opencode/command-envelope"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import { executeRunWorkflowCommand } from "../commands/run-workflow-command"
import { executeStartWorkCommand } from "../commands/start-work-command"
import {
  shouldAutoPauseForUserMessage,
  shouldHandleWorkflowCommand,
} from "../orchestration/execution-coordinator"
import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { CreatedHooks } from "../../hooks/create-hooks"

export interface ChatPolicyInput {
  directory: string
  hooks: CreatedHooks
  parsedEnvelope: ParsedCommandEnvelope | null
  promptText: string
  sessionId: string
}

export interface ChatPolicy {
  onChatMessage(input: ChatPolicyInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
}

export function createCommandChatPolicy(): ChatPolicy {
  return {
    onChatMessage(input) {
      const isRunWorkflowCommand =
        input.parsedEnvelope?.kind === "builtin-command" && input.parsedEnvelope.command === "run-workflow"

      const effects: RuntimeEffect[] = [
        ...executeStartWorkCommand({
          hooks: input.hooks,
          promptText: input.promptText,
          sessionId: input.sessionId,
          isWorkflowCommand: isRunWorkflowCommand,
        }),
        ...executeRunWorkflowCommand({
          hooks: input.hooks,
          promptText: input.promptText,
          sessionId: input.sessionId,
          isRunWorkflowCommand,
        }),
      ]

      if (input.hooks.workflowCommand && input.promptText && shouldHandleWorkflowCommand(input.directory, input.sessionId)) {
        const result = input.hooks.workflowCommand(input.promptText, input.sessionId)
        if (result.handled) {
          if (result.switchAgent) {
            effects.push({ type: "switchAgent", agent: result.switchAgent })
          }
          if (result.contextInjection) {
            effects.push({ type: "appendPromptText", text: result.contextInjection })
          }
        }
      }

      return createPolicyResult(effects)
    },
  }
}

export function createAutoPauseChatPolicy(): ChatPolicy {
  return {
    onChatMessage(input) {
      if (!input.directory) {
        return createPolicyResult<RuntimeEffect>()
      }

      const isBuiltinCommand = input.parsedEnvelope?.kind === "builtin-command"
      const isContinuation = input.parsedEnvelope?.kind === "continuation"

      if (!shouldAutoPauseForUserMessage({
        directory: input.directory,
        sessionId: input.sessionId,
        isBuiltinCommand: !!isBuiltinCommand,
        isContinuation: !!isContinuation,
      })) {
        return createPolicyResult<RuntimeEffect>()
      }

      const state = readWorkState(input.directory)
      if (!state || state.paused) {
        return createPolicyResult<RuntimeEffect>()
      }

      return createPolicyResult<RuntimeEffect>([
        {
          type: "pauseExecution",
          target: "plan",
          reason: "Auto-paused: user message received during active plan",
        },
      ])
    },
  }
}
