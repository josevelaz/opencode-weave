import type { CreatedHooks } from "../../hooks/create-hooks"
import { shouldAutoPauseForUserMessage, shouldHandleWorkflowCommand } from "./execution-coordinator"
import type { RuntimeEffect } from "../../runtime/opencode/effects"

export interface RuntimeLifecyclePolicySurface {
  onChatMessage(input: { directory: string; sessionId: string; promptText: string }): RuntimeEffect[] | Promise<RuntimeEffect[]>
  beforeTool(input: { directory: string; sessionId: string; tool: string; callId: string }): RuntimeEffect[] | Promise<RuntimeEffect[]>
  afterTool(input: { directory: string; sessionId: string; tool: string; callId: string }): RuntimeEffect[] | Promise<RuntimeEffect[]>
  onSessionIdle(input: { directory: string; sessionId: string }): RuntimeEffect[] | Promise<RuntimeEffect[]>
  onSessionDeleted(input: { directory: string; sessionId: string }): RuntimeEffect[] | Promise<RuntimeEffect[]>
  onCompaction(input: { directory: string; sessionId: string }): RuntimeEffect[] | Promise<RuntimeEffect[]>
}

export function createRuntimeLifecyclePolicySurface(
  overrides?: Partial<RuntimeLifecyclePolicySurface>,
): RuntimeLifecyclePolicySurface {
  return {
    onChatMessage: async () => [],
    beforeTool: async () => [],
    afterTool: async () => [],
    onSessionIdle: async () => [],
    onSessionDeleted: async () => [],
    onCompaction: async () => [],
    ...overrides,
  }
}

export function shouldPausePlanForMessage(input: {
  directory: string
  isBuiltinCommand: boolean
  isContinuation: boolean
}): boolean {
  return shouldAutoPauseForUserMessage(input)
}

export function shouldRunWorkflowCommand(directory: string, hooks: CreatedHooks): boolean {
  return !!hooks.workflowCommand && shouldHandleWorkflowCommand(directory)
}
