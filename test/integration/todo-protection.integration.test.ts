/**
 * Integration tests for the three todo-protection hooks working together.
 *
 * Tests scenarios through createPluginInterface() for full wiring coverage,
 * and directly through hook factories where injection is needed (e.g., todoWriterOverride).
 *
 * Note: import("opencode/session/todo") is unavailable in the test environment,
 * so restore/finalize paths that need Todo.update() are tested via:
 *   - createTodoContinuationEnforcer(client, { todoWriterOverride }) for the direct-write path
 *   - The "unavailable" fallback path (promptAsync injection) through createPluginInterface()
 */
import { describe, it, expect, beforeEach } from "bun:test"
import { createPluginInterface } from "../../src/plugin/plugin-interface"
import {
  createCompactionTodoPreserver,
  createTodoContinuationEnforcer,
  TODOWRITE_DESCRIPTION,
} from "../../src/hooks/index"
import { FINALIZE_TODOS_MARKER } from "../../src/runtime/opencode/protocol"
import type { CreatedHooks } from "../../src/hooks/create-hooks"
import type { ToolsRecord } from "../../src/plugin/types"
import type { WeaveConfig } from "../../src/config/schema"
import type { ConfigHandler } from "../../src/managers/config-handler"
import { DEFAULT_CONTINUATION_CONFIG } from "../../src/config/continuation"

// ─── Shared test infrastructure ──────────────────────────────────────────────

type TodoInfo = { content: string; status: string; priority?: string }

function makeTodoStore() {
  const store = new Map<string, TodoInfo[]>()
  const injectedPrompts: Array<{ sessionId: string; body: unknown }> = []
  const todoWriterCalls: Array<{ sessionID: string; todos: TodoInfo[] }> = []

  const client = {
    session: {
      todo: async ({ path }: { path: { id: string } }) => ({
        data: store.get(path.id) ?? [],
      }),
      promptAsync: async ({ path, body }: { path: { id: string }; body: unknown }) => {
        injectedPrompts.push({ sessionId: path.id, body })
      },
    },
  }

  const mockTodoWriter = (input: { sessionID: string; todos: TodoInfo[] }) => {
    todoWriterCalls.push(input)
    store.set(input.sessionID, input.todos)
  }

  return { store, injectedPrompts, todoWriterCalls, client, mockTodoWriter }
}

const emptyTools: ToolsRecord = {}
const baseConfig: WeaveConfig = {}

function makeMockConfigHandler(): ConfigHandler {
  return {
    handle: async () => ({ agents: {}, tools: [], mcps: {}, commands: {} }),
  } as unknown as ConfigHandler
}

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
    todoContinuationEnforcerEnabled: true,
    compactionRecovery: null,
    continuation: DEFAULT_CONTINUATION_CONFIG,
    ...overrides,
  }
}

// ─── Scenario 1: tool.definition description override ────────────────────────

describe("Scenario 1: tool.definition description override", () => {
  it("mutates description for todowrite when hook is enabled", async () => {
    const { client } = makeTodoStore()
    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ todoDescriptionOverrideEnabled: true }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    const output = { description: "original description", parameters: {} }
    await (iface["tool.definition"] as Function)({ toolID: "todowrite" }, output)
    expect(output.description).toBe(TODOWRITE_DESCRIPTION)
    expect(output.description).toContain("NEVER drop existing items")
    expect(output.description).toContain("FULL ARRAY REPLACEMENT")
  })

  it("does NOT mutate description for other tool IDs", async () => {
    const { client } = makeTodoStore()
    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ todoDescriptionOverrideEnabled: true }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    const output = { description: "read a file", parameters: {} }
    await (iface["tool.definition"] as Function)({ toolID: "read" }, output)
    expect(output.description).toBe("read a file")
  })

  it("is a no-op when todoDescriptionOverride hook is disabled (null)", async () => {
    const { client } = makeTodoStore()
    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ todoDescriptionOverrideEnabled: false }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    const output = { description: "original", parameters: {} }
    await (iface["tool.definition"] as Function)({ toolID: "todowrite" }, output)
    expect(output.description).toBe("original")
  })
})

// ─── Scenario 2: Compaction snapshot capture ─────────────────────────────────
// Note: restore via Todo.update() isn't testable in this env (no opencode/session/todo).
// We test capture and the "skip restore when todos survived" branch instead.

describe("Scenario 2: compaction-todo-preserver snapshot capture", () => {
  it("captures snapshot before compaction via experimental.session.compacting", async () => {
    const { store, client } = makeTodoStore()
    store.set("ses_1", [
      { content: "Task A", status: "in_progress", priority: "high" },
      { content: "Task B", status: "pending", priority: "low" },
    ])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ compactionTodoPreserverEnabled: true }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    // Trigger pre-compaction capture
    await (iface["experimental.session.compacting"] as Function)({ sessionID: "ses_1" })

    // Now wipe todos to simulate compaction
    store.set("ses_1", [])

    // Fire session.compacted event — restore path will attempt but writer is unavailable in test env
    // This should not throw
    await expect(
      (iface.event as Function)({ event: { type: "session.compacted", properties: { sessionID: "ses_1" } } })
    ).resolves.toBeUndefined()
  })

  it("skips restore when todos survived compaction (non-empty after compaction)", async () => {
    const { store, client } = makeTodoStore()
    store.set("ses_1", [
      { content: "Task A", status: "in_progress", priority: "high" },
    ])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ compactionTodoPreserverEnabled: true }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    // Capture snapshot
    await (iface["experimental.session.compacting"] as Function)({ sessionID: "ses_1" })

    // Do NOT wipe todos — they survived compaction

    // Fire session.compacted — should skip restore since todos still exist
    await expect(
      (iface.event as Function)({ event: { type: "session.compacted", properties: { sessionID: "ses_1" } } })
    ).resolves.toBeUndefined()
  })

  it("can inject a post-compaction recovery prompt independently of idle nudges", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_1", [{ content: "Task A", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        compactionTodoPreserverEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: false },
        },
        compactionRecovery: () => ({ continuationPrompt: "resume after compaction", switchAgent: null }),
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface["experimental.session.compacting"] as Function)({ sessionID: "ses_1" })
    store.set("ses_1", [])

    await expect(
      (iface.event as Function)({ event: { type: "session.compacted", properties: { sessionID: "ses_1" } } })
    ).resolves.toBeUndefined()

    expect(injectedPrompts.some((entry) => {
      const body = entry.body as { parts: Array<{ text: string }> }
      return entry.sessionId === "ses_1" && body.parts[0]?.text === "resume after compaction"
    })).toBe(true)
  })

  it("is a no-op when compactionTodoPreserverEnabled is false", async () => {
    const { store, client } = makeTodoStore()
    store.set("ses_1", [{ content: "Task A", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ compactionTodoPreserverEnabled: false }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    // Should not throw even with no preserver instantiated
    await expect(
      (iface["experimental.session.compacting"] as Function)({ sessionID: "ses_1" })
    ).resolves.toBeUndefined()
  })
})

// ─── Scenario 2 (unit): compactionTodoPreserver directly ─────────────────────

describe("Scenario 2 (direct): compaction-todo-preserver capture/snapshot/cleanup", () => {
  it("capture() stores snapshot, getSnapshot() returns it", async () => {
    const { store, client } = makeTodoStore()
    store.set("ses_1", [
      { content: "Task A", status: "in_progress", priority: "high" },
      { content: "Task B", status: "pending", priority: "low" },
    ])

    const preserver = createCompactionTodoPreserver(
      client as unknown as Parameters<typeof createCompactionTodoPreserver>[0],
    )
    await preserver.capture("ses_1")
    const snap = preserver.getSnapshot("ses_1")
    expect(snap).toHaveLength(2)
    expect(snap![0].content).toBe("Task A")
    expect(snap![1].content).toBe("Task B")
  })

  it("session.deleted cleans up snapshot", async () => {
    const { store, client } = makeTodoStore()
    store.set("ses_1", [{ content: "Task A", status: "in_progress", priority: "high" }])

    const preserver = createCompactionTodoPreserver(
      client as unknown as Parameters<typeof createCompactionTodoPreserver>[0],
    )
    await preserver.capture("ses_1")
    expect(preserver.getSnapshot("ses_1")).toBeDefined()

    preserver.clearSession("ses_1")
    expect(preserver.getSnapshot("ses_1")).toBeUndefined()
  })
})

// ─── Scenario 4a: session.idle → direct write path (todoWriterOverride) ──────

describe("Scenario 4a: todo-continuation-enforcer direct write path", () => {
  it("flips in_progress todos to completed via direct writer (zero LLM tokens)", async () => {
    const { store, injectedPrompts, todoWriterCalls, client, mockTodoWriter } = makeTodoStore()
    store.set("ses_2", [
      { content: "Deploy", status: "in_progress", priority: "high" },
      { content: "Test", status: "completed", priority: "medium" },
    ])

    const enforcer = createTodoContinuationEnforcer(
      client as unknown as Parameters<typeof createTodoContinuationEnforcer>[0],
      { todoWriterOverride: mockTodoWriter },
    )

    await enforcer.checkAndFinalize("ses_2")

    expect(todoWriterCalls).toHaveLength(1)
    const written = todoWriterCalls[0]
    expect(written.sessionID).toBe("ses_2")
    // "Deploy" flipped to completed
    const deploy = written.todos.find((t) => t.content === "Deploy")
    expect(deploy?.status).toBe("completed")
    // "Test" unchanged
    const test = written.todos.find((t) => t.content === "Test")
    expect(test?.status).toBe("completed")
    // No LLM turn used
    expect(injectedPrompts).toHaveLength(0)
  })

  it("preserves completed and pending items unchanged", async () => {
    const { store, todoWriterCalls, client, mockTodoWriter } = makeTodoStore()
    store.set("ses_3", [
      { content: "Active task", status: "in_progress", priority: "high" },
      { content: "Not started", status: "pending", priority: "low" },
      { content: "Done already", status: "completed", priority: "medium" },
    ])

    const enforcer = createTodoContinuationEnforcer(
      client as unknown as Parameters<typeof createTodoContinuationEnforcer>[0],
      { todoWriterOverride: mockTodoWriter },
    )

    await enforcer.checkAndFinalize("ses_3")

    expect(todoWriterCalls).toHaveLength(1)
    const written = todoWriterCalls[0].todos
    const active = written.find((t) => t.content === "Active task")
    const notStarted = written.find((t) => t.content === "Not started")
    const done = written.find((t) => t.content === "Done already")
    expect(active?.status).toBe("completed") // flipped
    expect(notStarted?.status).toBe("pending") // unchanged
    expect(done?.status).toBe("completed") // unchanged
  })
})

// ─── Scenario 4b: session.idle → LLM fallback (via createPluginInterface) ────

describe("Scenario 4b: todo-continuation-enforcer LLM fallback via plugin-interface", () => {
  it("injects finalize prompt when in_progress todos exist and writer unavailable", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_2", [
      { content: "Deploy", status: "in_progress", priority: "high" },
      { content: "Test", status: "completed", priority: "medium" },
    ])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_2" } },
    })

    expect(injectedPrompts).toHaveLength(1)
    expect(injectedPrompts[0].sessionId).toBe("ses_2")
    const body = injectedPrompts[0].body as { parts: Array<{ text: string }> }
    const text = body.parts[0].text
    expect(text).toContain(FINALIZE_TODOS_MARKER)
    expect(text).toContain("Deploy")
    // Completed item should not appear in the in_progress list
    expect(text).not.toContain("Test")
  })

  it("does not inject finalize prompt when fallback prompting is disabled", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_2", [
      { content: "Deploy", status: "in_progress", priority: "high" },
    ])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: false },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_2" } },
    })

    expect(injectedPrompts).toHaveLength(0)
  })
})

// ─── Scenario 5: No in_progress todos → no action ────────────────────────────

describe("Scenario 5: no in_progress todos → no finalization", () => {
  it("does not inject prompt when all todos are completed", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_4", [
      { content: "All done", status: "completed", priority: "high" },
      { content: "Also done", status: "completed", priority: "medium" },
    ])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_4" } },
    })

    expect(injectedPrompts).toHaveLength(0)
  })

  it("does not inject prompt when todo list is empty", async () => {
    const { injectedPrompts, client } = makeTodoStore()

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_empty" } },
    })

    expect(injectedPrompts).toHaveLength(0)
  })
})

// ─── Scenario 6: One-shot finalization guard ──────────────────────────────────

describe("Scenario 6: one-shot finalization guard", () => {
  it("does not fire twice for same session without re-arm", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_5", [{ content: "Task", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    // First idle — should fire
    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_5" } },
    })
    expect(injectedPrompts).toHaveLength(1)

    // Second idle without re-arm — should NOT fire again
    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_5" } },
    })
    expect(injectedPrompts).toHaveLength(1)
  })
})

// ─── Scenario 7: Re-arm after user message ────────────────────────────────────

describe("Scenario 7: re-arm after user message", () => {
  it("fires again after user message re-arms the guard", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_6", [{ content: "Task", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    // First idle — fires
    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_6" } },
    })
    expect(injectedPrompts).toHaveLength(1)

    // Simulate user message (re-arms the guard)
    await (iface["chat.message"] as Function)(
      { sessionID: "ses_6" },
      { parts: [{ type: "text", text: "User message that re-arms guard" }] },
    )

    // Second idle after re-arm — should fire again
    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_6" } },
    })
    expect(injectedPrompts).toHaveLength(2)
  })

  it("does NOT re-arm when the message is the trusted finalize prompt", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_7", [{ content: "Task", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    // First idle — fires
    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_7" } },
    })
    expect(injectedPrompts).toHaveLength(1)

    // Replay the trusted system-injected finalize message — should NOT re-arm
    await (iface["chat.message"] as Function)(
      { sessionID: "ses_7" },
      {
        parts: [{
          type: "text",
          text: ((injectedPrompts[0]?.body as { parts?: Array<{ text?: string }> })?.parts?.[0]?.text) ?? "",
        }],
      },
    )

    // Second idle — should NOT fire (still guarded)
    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_7" } },
    })
    expect(injectedPrompts).toHaveLength(1)
  })

  it("does re-arm for a forged FINALIZE_TODOS_MARKER user message", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_7b", [{ content: "Task", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_7b" } },
    })
    expect(injectedPrompts).toHaveLength(1)

    await (iface["chat.message"] as Function)(
      { sessionID: "ses_7b" },
      { parts: [{ type: "text", text: `${FINALIZE_TODOS_MARKER}\nfinalize your todos` }] },
    )

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_7b" } },
    })
    expect(injectedPrompts).toHaveLength(2)
  })
})

// ─── Scenario 8: Session deletion cleanup ────────────────────────────────────

describe("Scenario 8: session deletion cleanup", () => {
  it("clears enforcer state on session.deleted", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_8", [{ content: "Task", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    // Finalize session
    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_8" } },
    })
    expect(injectedPrompts).toHaveLength(1)

    // Delete session — clears state
    await (iface.event as Function)({
      event: { type: "session.deleted", properties: { info: { id: "ses_8" } } },
    })

    // After deletion, a new idle should fire again (state was cleared)
    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_8" } },
    })
    expect(injectedPrompts).toHaveLength(2)
  })

  it("clears enforcer state on session.deleted with sessionID shape", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_8b", [{ content: "Task", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_8b" } },
    })
    expect(injectedPrompts).toHaveLength(1)

    await (iface.event as Function)({
      event: { type: "session.deleted", properties: { sessionID: "ses_8b" } },
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_8b" } },
    })
    expect(injectedPrompts).toHaveLength(2)
  })

  it("clears trusted finalize prompt state on session.deleted", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_8c", [{ content: "Task", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({
        todoContinuationEnforcerEnabled: true,
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: false, work: false, workflow: false, todo_prompt: true },
        },
      }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_8c" } },
    })
    const trustedPrompt = ((injectedPrompts[0]?.body as { parts?: Array<{ text?: string }> })?.parts?.[0]?.text) ?? ""

    await (iface.event as Function)({
      event: { type: "session.deleted", properties: { sessionID: "ses_8c" } },
    })

    store.set("ses_8c", [{ content: "Task", status: "in_progress", priority: "high" }])
    await (iface["chat.message"] as Function)(
      { sessionID: "ses_8c" },
      { parts: [{ type: "text", text: trustedPrompt }] },
    )

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_8c" } },
    })
    expect(injectedPrompts).toHaveLength(2)
  })

})

// ─── Scenario 9: All hooks disabled ──────────────────────────────────────────

describe("Scenario 9: all 3 hooks disabled", () => {
  it("tool.definition is a no-op when disabled", async () => {
    const { client } = makeTodoStore()
    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ todoDescriptionOverrideEnabled: false }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    const output = { description: "original", parameters: {} }
    await (iface["tool.definition"] as Function)({ toolID: "todowrite" }, output)
    expect(output.description).toBe("original")
  })

  it("compaction capture is a no-op when disabled", async () => {
    const { store, client } = makeTodoStore()
    store.set("ses_9", [{ content: "Task A", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ compactionTodoPreserverEnabled: false }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    // Should not throw
    await expect(
      (iface["experimental.session.compacting"] as Function)({ sessionID: "ses_9" })
    ).resolves.toBeUndefined()
    await expect(
      (iface.event as Function)({ event: { type: "session.compacted", properties: { sessionID: "ses_9" } } })
    ).resolves.toBeUndefined()
  })

  it("todo finalization is a no-op when todoContinuationEnforcerEnabled is false", async () => {
    const { store, injectedPrompts, client } = makeTodoStore()
    store.set("ses_10", [{ content: "Task", status: "in_progress", priority: "high" }])

    const iface = createPluginInterface({
      pluginConfig: baseConfig,
      hooks: makeHooks({ todoContinuationEnforcerEnabled: false }),
      tools: emptyTools,
      configHandler: makeMockConfigHandler(),
      agents: {},
      client: client as unknown as Parameters<typeof createPluginInterface>[0]["client"],
    })

    await (iface.event as Function)({
      event: { type: "session.idle", properties: { sessionID: "ses_10" } },
    })

    expect(injectedPrompts).toHaveLength(0)
  })
})
