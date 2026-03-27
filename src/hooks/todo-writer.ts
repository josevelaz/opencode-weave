/**
 * Shared todo-writer resolution utility.
 *
 * Dynamically imports opencode/session/todo to get Todo.update().
 * Uses a variable for the module specifier to prevent bundler inlining.
 * Returns null if the module is unavailable (non-fatal).
 */

export type TodoItem = {
  content: string
  status: string
  priority?: string
}

export type TodoWriter = (input: { sessionID: string; todos: TodoItem[] }) => void

export async function resolveTodoWriter(): Promise<TodoWriter | null> {
  try {
    const loader = "opencode/session/todo"
    const mod = await import(loader)
    if (mod?.Todo?.update) {
      return (input: { sessionID: string; todos: TodoItem[] }) => {
        mod.Todo.update(input)
      }
    }
    return null
  } catch {
    return null
  }
}
