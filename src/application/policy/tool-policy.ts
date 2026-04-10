import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { RuntimeAfterToolInput, RuntimeBeforeToolInput } from "./runtime-policy"

export interface ToolPolicy {
  beforeTool(input: RuntimeBeforeToolInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
  afterTool(input: RuntimeAfterToolInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
}

export function createHookBackedToolPolicy(): ToolPolicy {
  return {
    beforeTool(input) {
      const filePath =
        (input.toolArgs?.file_path as string | undefined) ??
        (input.toolArgs?.path as string | undefined) ??
        ""

      if (filePath && input.hooks.shouldInjectRules && input.hooks.getRulesForFile && input.hooks.shouldInjectRules(input.tool)) {
        input.hooks.getRulesForFile(filePath)
      }

      if (filePath && input.hooks.writeGuard && input.tool === "read") {
        input.hooks.writeGuard.trackRead(filePath)
      }

      if (filePath && input.hooks.patternMdOnly && input.agent) {
        const check = input.hooks.patternMdOnly(input.agent, input.tool, filePath)
        if (!check.allowed) {
          throw new Error(check.reason ?? "Pattern agent is restricted to .md files in .weave/")
        }
      }

      return createPolicyResult<RuntimeEffect>()
    },
    afterTool() {
      return createPolicyResult<RuntimeEffect>()
    },
  }
}
