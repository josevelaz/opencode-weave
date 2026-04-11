import { clearTokenSession, getState as getTokenState, updateUsage } from "../../hooks"
import { warn } from "../../shared/log"
import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import { runIdleCycle } from "../orchestration/idle-cycle-service"
import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"
import { projectExecutionTransition } from "../../domain/session/execution-lease"
import type {
  RuntimeAssistantMessageInput,
  RuntimeCompactionInput,
  RuntimeSessionDeletedInput,
  RuntimeSessionIdleInput,
} from "./runtime-policy"

export interface SessionPolicy {
  onAssistantMessage(input: RuntimeAssistantMessageInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
  onSessionIdle(input: RuntimeSessionIdleInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
  onSessionDeleted(input: RuntimeSessionDeletedInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
  onCompaction(input: RuntimeCompactionInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
}

export function createHookBackedSessionPolicy(): SessionPolicy {
  const executionLeaseRepository = createExecutionLeaseFsStore()

  return {
    onAssistantMessage(input) {
      if (input.hooks.checkContextWindow && input.inputTokens > 0) {
        updateUsage(input.sessionId, input.inputTokens)
        const tokenState = getTokenState(input.sessionId)
        if (tokenState && tokenState.maxTokens > 0) {
          const result = input.hooks.checkContextWindow({
            usedTokens: tokenState.usedTokens,
            maxTokens: tokenState.maxTokens,
            sessionId: input.sessionId,
          })
          if (result.action !== "none") {
            warn("[context-window] Threshold crossed", {
              sessionId: input.sessionId,
              action: result.action,
              usagePct: result.usagePct,
            })
          }
        }
      }

      return createPolicyResult<RuntimeEffect>()
    },
    async onSessionIdle(input) {
      return createPolicyResult(
        await runIdleCycle({
          sessionId: input.sessionId,
          directory: input.directory,
          hooks: input.hooks,
          lastAssistantMessage: input.lastAssistantMessage,
          lastUserMessage: input.lastUserMessage,
          todoContinuationEnforcer: input.todoContinuationEnforcer,
        }),
      )
    },
    onSessionDeleted(input) {
      clearTokenSession(input.sessionId)
      input.todoContinuationEnforcer?.clearSession(input.sessionId)

      if (input.directory) {
        const projection = projectExecutionTransition({
          event: "delete_session",
          sessionId: input.sessionId,
          currentLease: executionLeaseRepository.readExecutionLease(input.directory),
          currentSessionRuntime: executionLeaseRepository.readSessionRuntime(input.directory, input.sessionId),
        })

        if (projection.lease) {
          executionLeaseRepository.writeExecutionLease(input.directory, projection.lease)
        } else {
          executionLeaseRepository.clearExecutionLease(input.directory)
        }
        executionLeaseRepository.clearSessionRuntime(input.directory, input.sessionId)
      }

      return createPolicyResult<RuntimeEffect>()
    },
    onCompaction(input) {
      if (input.hooks.continuation.recovery.compaction && input.hooks.compactionRecovery) {
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
        if (effects.length > 0) {
          return createPolicyResult<RuntimeEffect>(effects)
        }
      }

      return createPolicyResult<RuntimeEffect>()
    },
  }
}
