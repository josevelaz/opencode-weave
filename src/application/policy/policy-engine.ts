import { mergePolicyResults, runPolicySteps } from "../../domain/policy/policy-result"
import type {
  RuntimeAssistantMessageInput,
  RuntimeAfterToolInput,
  RuntimeBeforeCompactionInput,
  RuntimeBeforeToolInput,
  RuntimeChatMessageInput,
  RuntimeCompactionInput,
  RuntimeSessionDeletedInput,
  RuntimeSessionIdleInput,
  RuntimeLifecyclePolicySurface,
  RuntimeToolDefinitionInput,
} from "./runtime-policy"
import type { ChatPolicy } from "./chat-policy"
import type { SessionPolicy } from "./session-policy"
import type { ToolDefinitionPolicy } from "./tool-definition-policy"
import type { ToolPolicy } from "./tool-policy"

export function createPolicyEngine(args: {
  chatPolicies: ChatPolicy[]
  toolPolicies: ToolPolicy[]
  toolDefinitionPolicies: ToolDefinitionPolicy[]
  sessionPolicies: SessionPolicy[]
}): RuntimeLifecyclePolicySurface {
  const { chatPolicies, toolPolicies, toolDefinitionPolicies, sessionPolicies } = args

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
    onToolDefinition(input: RuntimeToolDefinitionInput) {
      return runPolicySteps(
        toolDefinitionPolicies.map((policy) => policy.onToolDefinition(input)),
      )
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
    beforeCompaction(input: RuntimeBeforeCompactionInput) {
      return runPolicySteps(
        sessionPolicies
          .map((policy) => policy.beforeCompaction?.(input))
          .filter((step): step is void | Promise<void> => step !== undefined),
      )
    },
    onCompaction(input: RuntimeCompactionInput) {
      return mergePolicyResults(sessionPolicies.map((policy) => policy.onCompaction(input)))
    },
  }
}
