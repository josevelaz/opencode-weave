import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { RuntimeSessionDeletedInput } from "./runtime-policy"

export interface TodoSessionPolicy {
  onSessionDeleted(input: RuntimeSessionDeletedInput): PolicyResult<RuntimeEffect>
}

export function createTodoSessionPolicy(todoContinuationEnforcer?: { clearSession: (sessionId: string) => void } | null): TodoSessionPolicy {
  return {
    onSessionDeleted(input) {
      todoContinuationEnforcer?.clearSession(input.sessionId)
      return createPolicyResult<RuntimeEffect>()
    },
  }
}
