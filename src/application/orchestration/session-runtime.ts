export type {
  RuntimeAssistantMessageInput,
  RuntimeAfterToolInput,
  RuntimeBeforeToolInput,
  RuntimeChatMessageInput,
  RuntimeCompactionInput,
  RuntimeSessionDeletedInput,
  RuntimeSessionIdleInput,
  RuntimeLifecyclePolicySurface,
} from "../policy/runtime-policy"
import { createPolicyEngine } from "../policy/policy-engine"
import { createAutoPauseChatPolicy, createCommandChatPolicy } from "../policy/chat-policy"
import { createHookBackedSessionPolicy } from "../policy/session-policy"
import { createHookBackedToolPolicy } from "../policy/tool-policy"

export function createRuntimeLifecyclePolicySurface(
): import("../policy/runtime-policy").RuntimeLifecyclePolicySurface {
  return createPolicyEngine({
    chatPolicies: [createCommandChatPolicy(), createAutoPauseChatPolicy()],
    toolPolicies: [createHookBackedToolPolicy()],
    sessionPolicies: [createHookBackedSessionPolicy()],
  })
}
