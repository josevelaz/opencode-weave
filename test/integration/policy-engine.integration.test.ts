import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createPolicyEngine } from "../../src/application/policy/policy-engine"
import { createAutoPauseChatPolicy, createCommandChatPolicy, createTodoFinalizationChatPolicy } from "../../src/application/policy/chat-policy"
import { createHookBackedToolPolicy } from "../../src/application/policy/tool-policy"
import { createHookBackedSessionPolicy } from "../../src/application/policy/session-policy"
import { createTodoDescriptionToolDefinitionPolicy } from "../../src/application/policy/tool-definition-policy"
import { DEFAULT_CONTINUATION_CONFIG } from "../../src/config/continuation"
import type { CreatedHooks } from "../../src/hooks/create-hooks"
import { createCompactionTodoPreserver } from "../../src/hooks/compaction-todo-preserver"
import { createPlanFsRepository } from "../../src/infrastructure/fs/plan-fs-repository"
import { PLANS_DIR } from "../../src/features/work-state/constants"

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

describe("policy engine integration", () => {
  let directory: string
  const planRepository = createPlanFsRepository()

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "weave-policy-int-"))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("auto-pauses active plans from repository-backed state", async () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "plan.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")
    planRepository.writeWorkState(directory, planRepository.createWorkState(planPath, "sess-1", "tapestry", directory))

    const engine = createPolicyEngine({
      chatPolicies: [createCommandChatPolicy(), createAutoPauseChatPolicy(), createTodoFinalizationChatPolicy()],
      toolPolicies: [createHookBackedToolPolicy()],
      toolDefinitionPolicies: [createTodoDescriptionToolDefinitionPolicy()],
      sessionPolicies: [createHookBackedSessionPolicy()],
    })

    const effects = await engine.onChatMessage({
      directory,
      sessionId: "sess-1",
      promptText: "hello there",
      parsedEnvelope: null,
      hooks: makeHooks(),
    })

    expect(effects).toContainEqual({
      type: "pauseExecution",
      target: "plan",
      reason: "Auto-paused: user message received during active plan",
    })
  })

  it("restores captured todos before compaction recovery prompts", async () => {
    const todos = new Map<string, Array<{ content: string; status: string; priority: string }>>([
      ["sess-compact", [{ content: "Task A", status: "in_progress", priority: "high" }]],
    ])
    const promptCalls: unknown[] = []
    const client = {
      session: {
        todo: async ({ path }: { path: { id: string } }) => ({
          data: todos.get(path.id) ?? [],
        }),
        promptAsync: async (input: unknown) => {
          promptCalls.push(input)
        },
      },
    }
    const compactionPreserver = createCompactionTodoPreserver(client as never)

    await compactionPreserver.capture("sess-compact")
    todos.set("sess-compact", [])

    const engine = createPolicyEngine({
      chatPolicies: [createCommandChatPolicy(), createAutoPauseChatPolicy(), createTodoFinalizationChatPolicy()],
      toolPolicies: [createHookBackedToolPolicy()],
      toolDefinitionPolicies: [createTodoDescriptionToolDefinitionPolicy()],
      sessionPolicies: [createHookBackedSessionPolicy({
        compactionPreserver,
      })],
    })

    const effects = await engine.onCompaction({
      directory,
      sessionId: "sess-compact",
      hooks: makeHooks({
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: false },
        },
        compactionRecovery: () => ({ continuationPrompt: "resume", switchAgent: null }),
      }),
    })

    expect(compactionPreserver.getSnapshot("sess-compact")).toBeUndefined()
    expect(effects).toEqual([
      { type: "injectPromptAsync", sessionId: "sess-compact", text: "resume", agent: null },
    ])
    expect(promptCalls).toEqual([])
  })
})
