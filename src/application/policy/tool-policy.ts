import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { RuntimeAfterToolInput, RuntimeBeforeToolInput } from "./runtime-policy"
import { createPatternToolPolicy } from "./pattern-tool-policy"
import { createRulesToolPolicy } from "./rules-tool-policy"
import { createWriteGuardToolPolicy } from "./write-guard-tool-policy"

export interface ToolPolicy {
  beforeTool(input: RuntimeBeforeToolInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
  afterTool(input: RuntimeAfterToolInput): PolicyResult<RuntimeEffect> | Promise<PolicyResult<RuntimeEffect>>
}

export function createHookBackedToolPolicy(): ToolPolicy {
  const patternPolicy = createPatternToolPolicy()
  const rulesPolicy = createRulesToolPolicy()
  const writeGuardPolicy = createWriteGuardToolPolicy()

  return {
    beforeTool(input) {
      const effects: RuntimeEffect[] = []
      patternPolicy.beforeTool(input)
      rulesPolicy.beforeTool(input)
      writeGuardPolicy.beforeTool(input)
      return createPolicyResult<RuntimeEffect>(effects)
    },
    afterTool() {
      return createPolicyResult<RuntimeEffect>()
    },
  }
}
