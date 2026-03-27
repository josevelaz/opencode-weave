import { describe, it, expect, beforeEach } from "bun:test"
import { createCompactionTodoPreserver } from "./compaction-todo-preserver"
import type { TodoSnapshot } from "./compaction-todo-preserver"

const SESSION_ID = "ses_test_123"

function makeMockClient(initialTodos: TodoSnapshot[] = []) {
  let currentTodos: TodoSnapshot[] = [...initialTodos]

  return {
    session: {
      todo: async ({ path }: { path: { id: string } }) => ({
        data: path.id === SESSION_ID ? [...currentTodos] : [],
      }),
    },
    setTodos(todos: TodoSnapshot[]) {
      currentTodos = [...todos]
    },
    clearTodos() {
      currentTodos = []
    },
  }
}

describe("createCompactionTodoPreserver", () => {
  describe("capture()", () => {
    it("stores snapshot when todos exist", async () => {
      const todos: TodoSnapshot[] = [
        { content: "Task A", status: "in_progress", priority: "high" },
        { content: "Task B", status: "pending", priority: "medium" },
      ]
      const mockClient = makeMockClient(todos)
      const preserver = createCompactionTodoPreserver(mockClient as never)

      await preserver.capture(SESSION_ID)

      const snapshot = preserver.getSnapshot(SESSION_ID)
      expect(snapshot).toBeDefined()
      expect(snapshot?.length).toBe(2)
      expect(snapshot?.[0].content).toBe("Task A")
    })

    it("does NOT store snapshot when todos are empty", async () => {
      const mockClient = makeMockClient([])
      const preserver = createCompactionTodoPreserver(mockClient as never)

      await preserver.capture(SESSION_ID)

      expect(preserver.getSnapshot(SESSION_ID)).toBeUndefined()
    })

    it("handles API errors gracefully (no throw)", async () => {
      const errorClient = {
        session: {
          todo: async () => {
            throw new Error("API error")
          },
        },
      }
      const preserver = createCompactionTodoPreserver(errorClient as never)

      // Should NOT throw
      await expect(preserver.capture(SESSION_ID)).resolves.toBeUndefined()
      expect(preserver.getSnapshot(SESSION_ID)).toBeUndefined()
    })
  })

  describe("handleEvent() with session.compacted", () => {
    it("with empty current todos triggers restore attempt", async () => {
      const todos: TodoSnapshot[] = [
        { content: "Task A", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)
      const preserver = createCompactionTodoPreserver(mockClient as never)

      // Capture snapshot
      await preserver.capture(SESSION_ID)
      expect(preserver.getSnapshot(SESSION_ID)).toBeDefined()

      // Simulate compaction wiping todos
      mockClient.clearTodos()

      // Fire session.compacted event
      await preserver.handleEvent({
        type: "session.compacted",
        properties: { sessionID: SESSION_ID },
      })

      // Snapshot should be cleared after restore attempt
      // (restore will fail since opencode/session/todo is unavailable in test env,
      //  but it should not throw and should clean up)
      expect(preserver.getSnapshot(SESSION_ID)).toBeUndefined()
    })

    it("with non-empty current todos skips restore", async () => {
      const todos: TodoSnapshot[] = [
        { content: "Task A", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)
      const preserver = createCompactionTodoPreserver(mockClient as never)

      // Capture snapshot
      await preserver.capture(SESSION_ID)

      // Do NOT clear todos — they survived compaction
      // Fire session.compacted event
      await preserver.handleEvent({
        type: "session.compacted",
        properties: { sessionID: SESSION_ID },
      })

      // Snapshot cleaned up (restore skipped since todos were present)
      expect(preserver.getSnapshot(SESSION_ID)).toBeUndefined()
    })

    it("handles sessionID from properties.info.id pattern", async () => {
      const todos: TodoSnapshot[] = [
        { content: "Task X", status: "pending", priority: "low" },
      ]
      const mockClient = makeMockClient([])
      const preserver = createCompactionTodoPreserver(mockClient as never)
      // Manually pre-fill to simulate a captured snapshot
      await preserver.capture(SESSION_ID)
      // No snapshot captured since client returns empty — just test event handling doesn't throw
      await expect(
        preserver.handleEvent({
          type: "session.compacted",
          properties: { info: { id: SESSION_ID } },
        })
      ).resolves.toBeUndefined()
    })
  })

  describe("handleEvent() with session.deleted", () => {
    it("cleans up snapshot on session delete", async () => {
      const todos: TodoSnapshot[] = [
        { content: "Task A", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)
      const preserver = createCompactionTodoPreserver(mockClient as never)

      await preserver.capture(SESSION_ID)
      expect(preserver.getSnapshot(SESSION_ID)).toBeDefined()

      await preserver.handleEvent({
        type: "session.deleted",
        properties: { info: { id: SESSION_ID } },
      })

      expect(preserver.getSnapshot(SESSION_ID)).toBeUndefined()
    })

    it("handles session.deleted with sessionID pattern", async () => {
      const todos: TodoSnapshot[] = [{ content: "T", status: "pending", priority: "low" }]
      const mockClient = makeMockClient(todos)
      const preserver = createCompactionTodoPreserver(mockClient as never)

      await preserver.capture(SESSION_ID)

      await preserver.handleEvent({
        type: "session.deleted",
        properties: { sessionID: SESSION_ID },
      })

      expect(preserver.getSnapshot(SESSION_ID)).toBeUndefined()
    })
  })

  describe("handleEvent() with unrelated events", () => {
    it("ignores unrelated events (no-op)", async () => {
      const todos: TodoSnapshot[] = [
        { content: "Task A", status: "in_progress", priority: "high" },
      ]
      const mockClient = makeMockClient(todos)
      const preserver = createCompactionTodoPreserver(mockClient as never)

      await preserver.capture(SESSION_ID)

      // Fire an unrelated event
      await preserver.handleEvent({
        type: "message.updated",
        properties: { sessionID: SESSION_ID },
      })

      // Snapshot should remain untouched
      expect(preserver.getSnapshot(SESSION_ID)).toBeDefined()
    })
  })

  describe("snapshot lifecycle", () => {
    it("multiple sessions are tracked independently", async () => {
      const client1Todos: TodoSnapshot[] = [{ content: "Session 1 Task", status: "pending", priority: "high" }]
      const client2Todos: TodoSnapshot[] = [{ content: "Session 2 Task", status: "in_progress", priority: "low" }]

      const allTodos = new Map([
        ["ses_1", client1Todos],
        ["ses_2", client2Todos],
      ])

      const multiClient = {
        session: {
          todo: async ({ path }: { path: { id: string } }) => ({
            data: allTodos.get(path.id) ?? [],
          }),
        },
      }

      const preserver = createCompactionTodoPreserver(multiClient as never)

      await preserver.capture("ses_1")
      await preserver.capture("ses_2")

      expect(preserver.getSnapshot("ses_1")).toBeDefined()
      expect(preserver.getSnapshot("ses_2")).toBeDefined()

      // Delete session 1 only
      await preserver.handleEvent({
        type: "session.deleted",
        properties: { sessionID: "ses_1" },
      })

      expect(preserver.getSnapshot("ses_1")).toBeUndefined()
      expect(preserver.getSnapshot("ses_2")).toBeDefined()
    })
  })
})
