import { describe, it, expect, beforeEach } from "bun:test"
import { createTodoContinuationEnforcer, FINALIZE_TODOS_MARKER } from "./todo-continuation-enforcer"

const SESSION_ID = "ses_enforcer_test"

type TodoInfo = { content: string; status: string; priority?: string }

function makeMockClient(todos: TodoInfo[] = []) {
  const store: TodoInfo[] = [...todos]
  const promptAsyncCalls: Array<{ path: { id: string }; body: unknown }> = []

  return {
    session: {
      todo: async ({ path }: { path: { id: string } }) => ({
        data: path.id === SESSION_ID ? [...store] : [],
      }),
      promptAsync: async (opts: { path: { id: string }; body: unknown }) => {
        promptAsyncCalls.push(opts)
      },
    },
    store,
    promptAsyncCalls,
  }
}

describe("createTodoContinuationEnforcer", () => {
  describe("direct-write path (todoWriter available)", () => {
    it("calls todoWriter with in_progress items flipped to completed", async () => {
      const todos: TodoInfo[] = [
        { content: "Deploy app", status: "in_progress", priority: "high" },
        { content: "Write tests", status: "completed", priority: "medium" },
        { content: "Review PR", status: "pending", priority: "low" },
      ]
      const mockClient = makeMockClient(todos)
      const writtenTodos: Array<{ sessionID: string; todos: TodoInfo[] }> = []

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: (input) => {
          writtenTodos.push(input)
        },
      })

      await enforcer.checkAndFinalize(SESSION_ID)

      expect(writtenTodos.length).toBe(1)
      const written = writtenTodos[0]
      expect(written.sessionID).toBe(SESSION_ID)
      // "Deploy app" should be flipped to completed
      const deployTodo = written.todos.find((t) => t.content === "Deploy app")
      expect(deployTodo?.status).toBe("completed")
    })

    it("preserves all other todos (pending, completed) unchanged", async () => {
      const todos: TodoInfo[] = [
        { content: "Deploy app", status: "in_progress", priority: "high" },
        { content: "Write tests", status: "completed", priority: "medium" },
        { content: "Review PR", status: "pending", priority: "low" },
      ]
      const mockClient = makeMockClient(todos)
      const writtenTodos: Array<{ sessionID: string; todos: TodoInfo[] }> = []

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: (input) => {
          writtenTodos.push(input)
        },
      })

      await enforcer.checkAndFinalize(SESSION_ID)

      const written = writtenTodos[0].todos
      const completedTodo = written.find((t) => t.content === "Write tests")
      const pendingTodo = written.find((t) => t.content === "Review PR")
      expect(completedTodo?.status).toBe("completed")
      expect(pendingTodo?.status).toBe("pending")
    })

    it("does NOT call promptAsync when direct write succeeds", async () => {
      const todos: TodoInfo[] = [
        { content: "In progress task", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: () => {}, // no-op writer
      })

      await enforcer.checkAndFinalize(SESSION_ID)

      expect(mockClient.promptAsyncCalls.length).toBe(0)
    })

    it("handles direct write failure gracefully (logs error, does not throw)", async () => {
      const todos: TodoInfo[] = [
        { content: "Task", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: () => {
          throw new Error("Write failed")
        },
      })

      // Should NOT throw
      await expect(enforcer.checkAndFinalize(SESSION_ID)).resolves.toBeUndefined()
    })
  })

  describe("fallback path (no todoWriter / null)", () => {
    it("injects finalize prompt when in_progress todos exist and no direct writer", async () => {
      const todos: TodoInfo[] = [
        { content: "Deploy app", status: "in_progress", priority: "high" },
        { content: "Write tests", status: "completed", priority: "medium" },
      ]
      const mockClient = makeMockClient(todos)

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: null,
      })

      await enforcer.checkAndFinalize(SESSION_ID)

      expect(mockClient.promptAsyncCalls.length).toBe(1)
    })

    it("finalize prompt does not include FINALIZE_TODOS_MARKER", async () => {
      const todos: TodoInfo[] = [
        { content: "Deploy app", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: null,
      })

      await enforcer.checkAndFinalize(SESSION_ID)

      const call = mockClient.promptAsyncCalls[0]
      const body = call.body as { parts: Array<{ type: string; text: string }> }
      const text = body.parts[0].text
      expect(text).not.toContain(FINALIZE_TODOS_MARKER)
    })

    it("finalize prompt lists the specific in_progress items", async () => {
      const todos: TodoInfo[] = [
        { content: "Deploy app", status: "in_progress", priority: "high" },
        { content: "Write tests", status: "completed", priority: "medium" },
      ]
      const mockClient = makeMockClient(todos)

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: null,
      })

      await enforcer.checkAndFinalize(SESSION_ID)

      const call = mockClient.promptAsyncCalls[0]
      const body = call.body as { parts: Array<{ type: string; text: string }> }
      const text = body.parts[0].text
      expect(text).toContain("Deploy app")
      // Completed todos should NOT be mentioned
      expect(text).not.toContain("Write tests")
    })
  })

  describe("shared behavior", () => {
    it("does NOT finalize when all todos are completed/pending (no in_progress)", async () => {
      const todos: TodoInfo[] = [
        { content: "Task 1", status: "completed", priority: "high" },
        { content: "Task 2", status: "pending", priority: "medium" },
      ]
      const mockClient = makeMockClient(todos)
      const writtenTodos: unknown[] = []

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: (input) => writtenTodos.push(input),
      })

      await enforcer.checkAndFinalize(SESSION_ID)

      expect(writtenTodos.length).toBe(0)
      expect(mockClient.promptAsyncCalls.length).toBe(0)
    })

    it("does NOT finalize when session already finalized (one-shot guard)", async () => {
      const todos: TodoInfo[] = [
        { content: "Task", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)
      const writtenTodos: unknown[] = []

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: (input) => writtenTodos.push(input),
      })

      // First finalize
      await enforcer.checkAndFinalize(SESSION_ID)
      expect(writtenTodos.length).toBe(1)

      // Second call should be no-op
      await enforcer.checkAndFinalize(SESSION_ID)
      expect(writtenTodos.length).toBe(1) // still 1
    })

    it("re-arms after clearFinalized() is called", async () => {
      const todos: TodoInfo[] = [
        { content: "Task", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)
      const writtenTodos: unknown[] = []

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: (input) => writtenTodos.push(input),
      })

      await enforcer.checkAndFinalize(SESSION_ID)
      expect(writtenTodos.length).toBe(1)

      // Re-arm
      enforcer.clearFinalized(SESSION_ID)

      // Should fire again
      await enforcer.checkAndFinalize(SESSION_ID)
      expect(writtenTodos.length).toBe(2)
    })

    it("clearSession() removes finalization tracking", async () => {
      const todos: TodoInfo[] = [
        { content: "Task", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)
      const writtenTodos: unknown[] = []

      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: (input) => writtenTodos.push(input),
      })

      await enforcer.checkAndFinalize(SESSION_ID)
      expect(enforcer.isFinalized(SESSION_ID)).toBe(true)

      enforcer.clearSession(SESSION_ID)
      expect(enforcer.isFinalized(SESSION_ID)).toBe(false)
    })

    it("handles API errors gracefully (no throw)", async () => {
      const errorClient = {
        session: {
          todo: async () => {
            throw new Error("API error")
          },
          promptAsync: async () => {},
        },
        promptAsyncCalls: [],
      }

      const enforcer = createTodoContinuationEnforcer(errorClient as never, {
        todoWriterOverride: null,
      })

      // Should NOT throw
      await expect(enforcer.checkAndFinalize(SESSION_ID)).resolves.toBeUndefined()
    })

    it("markFinalized/isFinalized track state correctly", () => {
      const mockClient = makeMockClient([])
      const enforcer = createTodoContinuationEnforcer(mockClient as never, {
        todoWriterOverride: null,
      })

      expect(enforcer.isFinalized(SESSION_ID)).toBe(false)
      enforcer.markFinalized(SESSION_ID)
      expect(enforcer.isFinalized(SESSION_ID)).toBe(true)
      enforcer.clearFinalized(SESSION_ID)
      expect(enforcer.isFinalized(SESSION_ID)).toBe(false)
    })
  })

  describe("FINALIZE_TODOS_MARKER", () => {
    it("is a non-empty string", () => {
      expect(FINALIZE_TODOS_MARKER).toBeTruthy()
      expect(typeof FINALIZE_TODOS_MARKER).toBe("string")
    })
  })
})
