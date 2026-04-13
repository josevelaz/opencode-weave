import { createPolicyResult, type PolicyResult } from "../../domain/policy/policy-result"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { RuntimeBeforeToolInput } from "./runtime-policy"

export interface WriteGuardToolPolicy {
  beforeTool(input: RuntimeBeforeToolInput): PolicyResult<RuntimeEffect>
}

export function createWriteGuardToolPolicy(): WriteGuardToolPolicy {
  return {
    beforeTool(input) {
      const filePath =
        (input.toolArgs?.file_path as string | undefined) ??
        (input.toolArgs?.path as string | undefined) ??
        ""

      if (filePath && input.hooks.writeGuard && input.tool === "read") {
        input.hooks.writeGuard.trackRead(filePath)
      }

      return createPolicyResult<RuntimeEffect>()
    },
  }
}
