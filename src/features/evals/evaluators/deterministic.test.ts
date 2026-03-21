import { describe, expect, it } from "bun:test"
import { runDeterministicEvaluator } from "./deterministic"

describe("runDeterministicEvaluator", () => {
  const artifacts = {
    renderedPrompt: "<Role>Alpha</Role>\n<Review>Beta</Review>",
    toolPolicy: { write: false },
  }

  it("checks contains-all patterns", () => {
    const results = runDeterministicEvaluator({ kind: "contains-all", patterns: ["Alpha", "Beta"] }, artifacts)
    expect(results.every((result) => result.passed)).toBe(true)
  })

  it("checks ordered-contains", () => {
    const results = runDeterministicEvaluator({ kind: "ordered-contains", patterns: ["<Role>", "<Review>"] }, artifacts)
    expect(results.every((result) => result.passed)).toBe(true)
  })

  it("checks section-contains-all within a section", () => {
    const results = runDeterministicEvaluator(
      { kind: "section-contains-all", section: "Role", patterns: ["Alpha"] },
      artifacts,
    )
    expect(results.every((result) => result.passed)).toBe(true)
  })

  it("fails section-contains-all when pattern is outside section", () => {
    const results = runDeterministicEvaluator(
      { kind: "section-contains-all", section: "Role", patterns: ["Beta"] },
      artifacts,
    )
    expect(results.some((result) => !result.passed)).toBe(true)
  })

  it("fails section-contains-all when section is missing", () => {
    const results = runDeterministicEvaluator(
      { kind: "section-contains-all", section: "Plan", patterns: ["Alpha"] },
      artifacts,
    )
    expect(results.every((result) => !result.passed)).toBe(true)
  })

  it("checks tool policy", () => {
    const results = runDeterministicEvaluator({ kind: "tool-policy", expectations: { write: false } }, artifacts)
    expect(results[0].passed).toBe(true)
  })
})
