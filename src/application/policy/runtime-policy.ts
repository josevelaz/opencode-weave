import type { CreatedHooks } from "../../hooks/create-hooks"
import type { ParsedCommandEnvelope } from "../../runtime/opencode/command-envelope"
import type { RuntimeEffect } from "../../runtime/opencode/effects"

export interface RuntimeChatMessageInput {
  directory: string
  sessionId: string
  promptText: string
  parsedEnvelope: ParsedCommandEnvelope | null
  hooks: CreatedHooks
}

export interface RuntimeBeforeToolInput {
  directory: string
  sessionId: string
  tool: string
  callId: string
  hooks: CreatedHooks
  agent?: string
  toolArgs?: Record<string, unknown> | null
}

export interface RuntimeAfterToolInput {
  directory: string
  sessionId: string
  tool: string
  callId: string
  hooks: CreatedHooks
  agent?: string
  toolArgs?: Record<string, unknown> | null
}

export interface RuntimeSessionIdleInput {
  directory: string
  sessionId: string
  hooks: CreatedHooks
  lastAssistantMessage?: string
  lastUserMessage?: string
  todoContinuationEnforcer: { checkAndFinalize: (sessionId: string) => Promise<void> } | null
}

export interface RuntimeSessionDeletedInput {
  directory: string
  sessionId: string
  hooks: CreatedHooks
  todoContinuationEnforcer: { clearSession: (sessionId: string) => void } | null
}

export interface RuntimeCompactionInput {
  directory: string
  sessionId: string
  hooks: CreatedHooks
  enabledAgents?: ReadonlySet<string>
}

export interface RuntimeAssistantMessageInput {
  sessionId: string
  hooks: CreatedHooks
  inputTokens: number
}

export interface RuntimeLifecyclePolicySurface {
  onChatMessage(input: RuntimeChatMessageInput): RuntimeEffect[] | Promise<RuntimeEffect[]>
  beforeTool(input: RuntimeBeforeToolInput): RuntimeEffect[] | Promise<RuntimeEffect[]>
  afterTool(input: RuntimeAfterToolInput): RuntimeEffect[] | Promise<RuntimeEffect[]>
  onAssistantMessage(input: RuntimeAssistantMessageInput): RuntimeEffect[] | Promise<RuntimeEffect[]>
  onSessionIdle(input: RuntimeSessionIdleInput): RuntimeEffect[] | Promise<RuntimeEffect[]>
  onSessionDeleted(input: RuntimeSessionDeletedInput): RuntimeEffect[] | Promise<RuntimeEffect[]>
  onCompaction(input: RuntimeCompactionInput): RuntimeEffect[] | Promise<RuntimeEffect[]>
}
