import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { RuntimeBeforeCompactionInput, RuntimeCompactionInput } from "./runtime-policy"

export interface CompactionSessionPolicy {
  beforeCompaction(input: RuntimeBeforeCompactionInput): void | Promise<void>
  onCompaction(input: RuntimeCompactionInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
  onSessionDeleted?(sessionId: string): void
}

export function createCompactionSessionPolicy(compactionPreserver?: {
  capture: (sessionId: string) => Promise<void>
  restore: (sessionId: string) => Promise<void>
  clearSession: (sessionId: string) => void
} | null): CompactionSessionPolicy {
  return {
    async beforeCompaction(input) {
      if (!compactionPreserver || !input.sessionId) {
        return
      }

      await compactionPreserver.capture(input.sessionId)
    },
    async onCompaction(input) {
      await compactionPreserver?.restore(input.sessionId)

      if (!input.hooks.continuation.recovery.compaction || !input.hooks.compactionRecovery) {
        return createPolicyResult<RuntimeEffect>()
      }

      const result = input.hooks.compactionRecovery(input.sessionId, input.enabledAgents)
      const effects: RuntimeEffect[] = []

      if (result.switchAgent) {
        effects.push({
          type: "restoreAgent",
          sessionId: input.sessionId,
          agent: result.switchAgent,
        })
      }
      if (result.continuationPrompt) {
        effects.push({
          type: "injectPromptAsync",
          sessionId: input.sessionId,
          text: result.continuationPrompt,
          agent: result.switchAgent,
        })
      }

      return createPolicyResult<RuntimeEffect>(effects)
    },
    onSessionDeleted(sessionId) {
      compactionPreserver?.clearSession(sessionId)
    },
  }
}
