import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import { checkPatternWrite } from "../../hooks/pattern-md-only"
import type { RuntimeBeforeToolInput } from "./runtime-policy"

export interface PatternToolPolicy {
  beforeTool(input: RuntimeBeforeToolInput): PolicyResult<RuntimeEffect>
}

export function createPatternToolPolicy(): PatternToolPolicy {
  return {
    beforeTool(input) {
      const filePath =
        (input.toolArgs?.file_path as string | undefined) ??
        (input.toolArgs?.path as string | undefined) ??
        ""

      if (filePath && input.agent && input.hooks.patternMdOnlyEnabled) {
        const check = checkPatternWrite(input.agent, input.tool, filePath)
        if (!check.allowed) {
          throw new Error(check.reason ?? "Pattern agent is restricted to .md files in .weave/")
        }
      }

      return createPolicyResult<RuntimeEffect>()
    },
  }
}
