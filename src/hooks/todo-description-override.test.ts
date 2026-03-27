import { describe, it, expect } from "bun:test"
import { applyTodoDescriptionOverride, TODOWRITE_DESCRIPTION } from "./todo-description-override"

describe("applyTodoDescriptionOverride", () => {
  it("mutates description when toolID is 'todowrite'", () => {
    const input = { toolID: "todowrite" }
    const output = { description: "original description", parameters: {} }

    applyTodoDescriptionOverride(input, output)

    expect(output.description).toBe(TODOWRITE_DESCRIPTION)
    expect(output.description).not.toBe("original description")
  })

  it("does NOT mutate description for other tool IDs", () => {
    const cases = ["read", "write", "bash", "edit", "glob", "task"]
    for (const toolID of cases) {
      const input = { toolID }
      const output = { description: "original description", parameters: {} }

      applyTodoDescriptionOverride(input, output)

      expect(output.description).toBe("original description")
    }
  })

  it("TODOWRITE_DESCRIPTION is non-empty and contains key phrases", () => {
    expect(TODOWRITE_DESCRIPTION.length).toBeGreaterThan(0)
    // Must emphasize destructive nature
    const lower = TODOWRITE_DESCRIPTION.toLowerCase()
    expect(lower).toContain("never")
    expect(lower).toContain("drop")
    // Must mention the destructive / replacement nature
    const hasDestructiveLanguage =
      lower.includes("replac") || lower.includes("destructive") || lower.includes("deletion") || lower.includes("deletes")
    expect(hasDestructiveLanguage).toBe(true)
  })

  it("preserves other output properties (parameters, etc.)", () => {
    const params = { type: "object", properties: { todos: { type: "array" } } }
    const input = { toolID: "todowrite" }
    const output = { description: "old", parameters: params }

    applyTodoDescriptionOverride(input, output)

    // description mutated, parameters preserved
    expect(output.description).toBe(TODOWRITE_DESCRIPTION)
    expect(output.parameters).toBe(params)
  })

  it("is idempotent — calling twice with same toolID gives same result", () => {
    const input = { toolID: "todowrite" }
    const output = { description: "original", parameters: {} }

    applyTodoDescriptionOverride(input, output)
    const afterFirst = output.description

    applyTodoDescriptionOverride(input, output)
    const afterSecond = output.description

    expect(afterFirst).toBe(afterSecond)
  })
})
