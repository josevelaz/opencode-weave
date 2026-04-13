import { getPlanProgress, readWorkState, writeWorkState } from "../../features/work-state"
import { buildVerificationReminder } from "../../hooks/verification-reminder"
import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { RuntimeSessionIdleInput } from "./runtime-policy"

export interface VerificationSessionPolicy {
  onSessionIdle(input: RuntimeSessionIdleInput): PolicyResult<RuntimeEffect>
}

export function createVerificationSessionPolicy(): VerificationSessionPolicy {
  return {
    onSessionIdle(input) {
      if (!input.hooks.verificationReminderEnabled || !input.directory) {
        return createPolicyResult<RuntimeEffect>()
      }

      const state = readWorkState(input.directory)
      if (!state || state.paused) {
        return createPolicyResult<RuntimeEffect>()
      }

      if (state.session_ids.length > 0 && state.session_ids.at(-1) !== input.sessionId) {
        return createPolicyResult<RuntimeEffect>()
      }

      const progress = getPlanProgress(state.active_plan)
      if (!progress.isComplete || state.verification_reminder_sent) {
        return createPolicyResult<RuntimeEffect>()
      }

      const result = buildVerificationReminder({
        planName: state.plan_name,
        progress,
      })

      if (!result.verificationPrompt) {
        return createPolicyResult<RuntimeEffect>()
      }

      writeWorkState(input.directory, {
        ...state,
        verification_reminder_sent: true,
      })

      return createPolicyResult<RuntimeEffect>([
        {
          type: "injectPromptAsync",
          sessionId: input.sessionId,
          text: result.verificationPrompt,
          agent: null,
        },
      ])
    }
  }
}
