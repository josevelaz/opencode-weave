/**
 * todo-description-override hook
 *
 * Overrides the TodoWrite tool description with stronger language emphasizing
 * that it is a destructive full-array replacement and items must NEVER be dropped.
 */

export const TODOWRITE_DESCRIPTION = `\
Manages the sidebar todo list. CRITICAL: This tool performs a FULL ARRAY REPLACEMENT — every call \
completely DELETES all existing todos and replaces them with whatever you send. \
NEVER drop existing items. ALWAYS include ALL current todos in EVERY call. \
If unsure what todos currently exist, call todoread BEFORE calling this tool. \
Rules: max 35 chars per item, encode WHERE + WHAT (e.g. "src/foo.ts: add error handler"). \
Status values: "pending", "in_progress", "completed", "cancelled". \
Priority values: "high", "medium", "low".`

/**
 * Applies the enhanced TodoWrite description override.
 * Mutates `output.description` when `input.toolID === "todowrite"`.
 * Pure function — no side effects, no async, no state.
 */
export function applyTodoDescriptionOverride(
  input: { toolID: string },
  output: { description: string; parameters?: unknown },
): void {
  if (input.toolID === "todowrite") {
    output.description = TODOWRITE_DESCRIPTION
  }
}
