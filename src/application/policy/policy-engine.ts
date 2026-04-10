import { mergePolicyResults } from "../../domain/policy/policy-result"
import type {
  RuntimeAssistantMessageInput,
  RuntimeAfterToolInput,
  RuntimeBeforeToolInput,
  RuntimeChatMessageInput,
  RuntimeCompactionInput,
  RuntimeSessionDeletedInput,
  RuntimeSessionIdleInput,
  RuntimeLifecyclePolicySurface,
} from "./runtime-policy"
import type { ChatPolicy } from "./chat-policy"
import type { SessionPolicy } from "./session-policy"
import type { ToolPolicy } from "./tool-policy"

export function createPolicyEngine(args: {
  chatPolicies: ChatPolicy[]
  toolPolicies: ToolPolicy[]
  sessionPolicies: SessionPolicy[]
}): RuntimeLifecyclePolicySurface {
  const { chatPolicies, toolPolicies, sessionPolicies } = args

  return {
    onChatMessage(input: RuntimeChatMessageInput) {
      return mergePolicyResults(chatPolicies.map((policy) => policy.onChatMessage(input)))
    },
    beforeTool(input: RuntimeBeforeToolInput) {
      return mergePolicyResults(toolPolicies.map((policy) => policy.beforeTool(input)))
    },
    afterTool(input: RuntimeAfterToolInput) {
      return mergePolicyResults(toolPolicies.map((policy) => policy.afterTool(input)))
    },
    onAssistantMessage(input: RuntimeAssistantMessageInput) {
      return mergePolicyResults(sessionPolicies.map((policy) => policy.onAssistantMessage(input)))
    },
    onSessionIdle(input: RuntimeSessionIdleInput) {
      return mergePolicyResults(sessionPolicies.map((policy) => policy.onSessionIdle(input)))
    },
    onSessionDeleted(input: RuntimeSessionDeletedInput) {
      return mergePolicyResults(sessionPolicies.map((policy) => policy.onSessionDeleted(input)))
    },
    onCompaction(input: RuntimeCompactionInput) {
      return mergePolicyResults(sessionPolicies.map((policy) => policy.onCompaction(input)))
    },
  }
}
