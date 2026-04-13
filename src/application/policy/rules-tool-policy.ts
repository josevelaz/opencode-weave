import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import { getRulesForFile, shouldInjectRules } from "../../hooks/rules-injector"
import type { RuntimeBeforeToolInput } from "./runtime-policy"

export interface RulesToolPolicy {
  beforeTool(input: RuntimeBeforeToolInput): PolicyResult<RuntimeEffect>
}

export function createRulesToolPolicy(): RulesToolPolicy {
  return {
    beforeTool(input) {
      const filePath =
        (input.toolArgs?.file_path as string | undefined) ??
        (input.toolArgs?.path as string | undefined) ??
        ""

      if (filePath && input.hooks.rulesInjectorEnabled && shouldInjectRules(input.tool)) {
        getRulesForFile(filePath)
      }

      return createPolicyResult<RuntimeEffect>()
    },
  }
}
