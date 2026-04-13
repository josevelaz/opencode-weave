import { describe, expect, it } from "bun:test"
import { createHookBackedToolPolicy } from "./tool-policy"
import type { CreatedHooks } from "../../hooks/create-hooks"
import { DEFAULT_CONTINUATION_CONFIG } from "../../config/continuation"

function makeHooks(overrides?: Partial<CreatedHooks>): CreatedHooks {
  return {
    contextWindowThresholds: null,
    rulesInjectorEnabled: false,
    writeGuard: null,
    firstMessageVariant: null,
    processMessageForKeywords: null,
    patternMdOnlyEnabled: false,
    startWork: null,
    workContinuation: null,
    workflowStart: null,
    workflowContinuation: null,
    workflowCommand: null,
    verificationReminderEnabled: false,
    analyticsEnabled: false,
    todoDescriptionOverrideEnabled: false,
    compactionTodoPreserverEnabled: false,
    todoContinuationEnforcerEnabled: false,
    compactionRecovery: null,
    continuation: DEFAULT_CONTINUATION_CONFIG,
    ...overrides,
  }
}

describe("createHookBackedToolPolicy", () => {
  it("tracks file reads through the write guard policy unit", () => {
    const tracked: string[] = []
    const policy = createHookBackedToolPolicy()

    policy.beforeTool({
      directory: "",
      sessionId: "sess-tool",
      tool: "read",
      callId: "call-1",
      hooks: makeHooks({
        writeGuard: {
          trackRead: (filePath: string) => {
            tracked.push(filePath)
          },
          checkWrite: () => ({ allowed: true }),
        },
      }),
      toolArgs: { file_path: "/tmp/file.ts" },
    })

    expect(tracked).toEqual(["/tmp/file.ts"])
  })

  it("blocks non-markdown Pattern writes through the pattern policy unit", () => {
    const policy = createHookBackedToolPolicy()

    expect(() => policy.beforeTool({
      directory: "",
      sessionId: "sess-tool",
      tool: "write",
      callId: "call-1",
      hooks: makeHooks({ patternMdOnlyEnabled: true }),
      agent: "pattern",
      toolArgs: { file_path: "/tmp/file.ts" },
    })).toThrow("Pattern agent can only write to .weave/ directory")
  })

  it("invokes the rules policy unit for configured tools", () => {
    const policy = createHookBackedToolPolicy()

    expect(() => policy.beforeTool({
      directory: "",
      sessionId: "sess-tool",
      tool: "read",
      callId: "call-1",
      hooks: makeHooks({ rulesInjectorEnabled: true }),
      toolArgs: { file_path: "/tmp/file.ts" },
    })).not.toThrow()
  })

  it("returns no runtime effects when policy units only enforce locally", async () => {
    const policy = createHookBackedToolPolicy()

    const result = await policy.beforeTool({
      directory: "",
      sessionId: "sess-tool",
      tool: "read",
      callId: "call-2",
      hooks: makeHooks(),
      toolArgs: { file_path: "/tmp/file.ts" },
    })

    expect(result.effects).toEqual([])
  })
})
