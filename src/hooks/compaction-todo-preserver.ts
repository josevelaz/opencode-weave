/**
 * compaction-todo-preserver hook
 *
 * Snapshots todos before compaction, restores them if wiped by compaction.
 * Defense-in-depth against OpenCode's context compaction clearing the todo list.
 */
import type { PluginContext } from "../plugin/types"
import { debug, warn } from "../shared/log"
import { resolveTodoWriter } from "./todo-writer"

export type TodoSnapshot = {
  content: string
  status: string
  priority: string
}

export function createCompactionTodoPreserver(client: PluginContext["client"]) {
  const snapshots = new Map<string, TodoSnapshot[]>()

  async function capture(sessionID: string): Promise<void> {
    try {
      const response = await client.session.todo({ path: { id: sessionID } })
      const todos = (response.data ?? []) as TodoSnapshot[]
      if (todos.length > 0) {
        snapshots.set(sessionID, todos)
        debug("[compaction-todo-preserver] Captured snapshot", {
          sessionID,
          count: todos.length,
        })
      }
    } catch (err) {
      warn("[compaction-todo-preserver] Failed to capture snapshot (non-fatal)", {
        sessionID,
        error: String(err),
      })
    }
  }

  async function restore(sessionID: string): Promise<void> {
    const snapshot = snapshots.get(sessionID)
    if (!snapshot || snapshot.length === 0) {
      return
    }

    try {
      // Check if todos survived compaction
      const response = await client.session.todo({ path: { id: sessionID } })
      const currentTodos = (response.data ?? []) as TodoSnapshot[]
      if (currentTodos.length > 0) {
        debug("[compaction-todo-preserver] Todos survived compaction, skipping restore", {
          sessionID,
          currentCount: currentTodos.length,
        })
        snapshots.delete(sessionID)
        return
      }

      // Todos were wiped — attempt restore via direct write
      const todoWriter = await resolveTodoWriter()
      if (todoWriter) {
        todoWriter({ sessionID, todos: snapshot })
        debug("[compaction-todo-preserver] Restored todos via direct write", {
          sessionID,
          count: snapshot.length,
        })
      } else {
        warn("[compaction-todo-preserver] Direct write unavailable — todos cannot be restored", {
          sessionID,
          count: snapshot.length,
        })
      }
    } catch (err) {
      warn("[compaction-todo-preserver] Failed to restore todos (non-fatal)", {
        sessionID,
        error: String(err),
      })
    } finally {
      snapshots.delete(sessionID)
    }
  }

  async function handleEvent(event: { type: string; properties?: unknown }): Promise<void> {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.compacted") {
      const sessionID =
        (props?.sessionID as string | undefined) ??
        ((props?.info as Record<string, unknown> | undefined)?.id as string | undefined) ??
        ""
      if (sessionID) {
        await restore(sessionID)
      }
      return
    }

    if (event.type === "session.deleted") {
      const sessionID =
        (props?.sessionID as string | undefined) ??
        ((props?.info as Record<string, unknown> | undefined)?.id as string | undefined) ??
        ""
      if (sessionID) {
        snapshots.delete(sessionID)
        debug("[compaction-todo-preserver] Cleaned up snapshot on session delete", { sessionID })
      }
      return
    }
  }

  function getSnapshot(sessionID: string): TodoSnapshot[] | undefined {
    return snapshots.get(sessionID)
  }

  return { capture, handleEvent, getSnapshot }
}
