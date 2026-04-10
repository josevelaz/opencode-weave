import { describe, expect, it } from "bun:test"
import { createPolicyEngine } from "./policy-engine"
import { createAutoPauseChatPolicy, createCommandChatPolicy } from "./chat-policy"
import { createHookBackedSessionPolicy } from "./session-policy"
import { createHookBackedToolPolicy } from "./tool-policy"
import type { CreatedHooks } from "../../hooks/create-hooks"
import { DEFAULT_CONTINUATION_CONFIG } from "../../config/continuation"
import { writeWorkState, createWorkState } from "../../features/work-state/storage"
import { mkdtempSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { renderBuiltinCommandEnvelope } from "../../runtime/opencode/protocol"
import { setContextLimit } from "../../hooks"

function makeHooks(overrides?: Partial<CreatedHooks>): CreatedHooks {
  return {
    checkContextWindow: null,
    writeGuard: null,
    shouldInjectRules: null,
    getRulesForFile: null,
    firstMessageVariant: null,
    processMessageForKeywords: null,
    patternMdOnly: null,
    startWork: null,
    workContinuation: null,
    workflowStart: null,
    workflowContinuation: null,
    workflowCommand: null,
    verificationReminder: null,
    analyticsEnabled: false,
    todoDescriptionOverride: null,
    compactionTodoPreserverEnabled: false,
    todoContinuationEnforcerEnabled: false,
    compactionRecovery: null,
    continuation: DEFAULT_CONTINUATION_CONFIG,
    ...overrides,
  }
}

describe("createPolicyEngine", () => {
  it("routes chat command handling through composed chat policies", async () => {
    const engine = createPolicyEngine({
      chatPolicies: [createCommandChatPolicy(), createAutoPauseChatPolicy()],
      toolPolicies: [createHookBackedToolPolicy()],
      sessionPolicies: [createHookBackedSessionPolicy()],
    })

    const hooks = makeHooks({
      startWork: () => ({ contextInjection: "plan context", switchAgent: "tapestry" }),
    })

    const effects = await engine.onChatMessage({
      directory: "",
      sessionId: "sess-1",
      promptText: renderBuiltinCommandEnvelope({ command: "start-work", arguments: "", sessionId: "sess-1" }),
      parsedEnvelope: {
        kind: "builtin-command",
        source: "envelope",
        command: "start-work",
        arguments: "",
        sessionId: "sess-1",
        timestamp: null,
      },
      hooks,
    })

    expect(effects).toEqual([
      { type: "switchAgent", agent: "tapestry" },
      { type: "appendPromptText", text: "plan context" },
    ])
  })

  it("routes plan auto-pause through the chat policy engine", async () => {
    const directory = mkdtempSync(join(tmpdir(), "weave-policy-engine-"))
    mkdirSync(join(directory, ".weave"), { recursive: true })
    writeWorkState(directory, createWorkState("plan.md", "2026-01-01T00:00:00.000Z"))

    try {
      const engine = createPolicyEngine({
        chatPolicies: [createCommandChatPolicy(), createAutoPauseChatPolicy()],
        toolPolicies: [createHookBackedToolPolicy()],
        sessionPolicies: [createHookBackedSessionPolicy()],
      })

      const effects = await engine.onChatMessage({
        directory,
        sessionId: "sess-2",
        promptText: "normal user message",
        parsedEnvelope: null,
        hooks: makeHooks(),
      })

      expect(effects).toContainEqual({
        type: "pauseExecution",
        target: "plan",
        reason: "Auto-paused: user message received during active plan",
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("routes tool guard hooks through the policy engine", async () => {
    const tracked: string[] = []
    const engine = createPolicyEngine({
      chatPolicies: [createCommandChatPolicy(), createAutoPauseChatPolicy()],
      toolPolicies: [createHookBackedToolPolicy()],
      sessionPolicies: [createHookBackedSessionPolicy()],
    })

    await engine.beforeTool({
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

  it("routes assistant context-window checks through the policy engine", async () => {
    let receivedUsedTokens = 0
    setContextLimit("sess-ctx", 100_000)
    const engine = createPolicyEngine({
      chatPolicies: [createCommandChatPolicy(), createAutoPauseChatPolicy()],
      toolPolicies: [createHookBackedToolPolicy()],
      sessionPolicies: [createHookBackedSessionPolicy()],
    })

    await engine.onAssistantMessage({
      sessionId: "sess-ctx",
      hooks: makeHooks({
        checkContextWindow: (state) => {
          receivedUsedTokens = state.usedTokens
          return { action: "none", usagePct: 0 }
        },
      }),
      inputTokens: 50_000,
    })

    expect(receivedUsedTokens).toBe(50_000)
  })
})
