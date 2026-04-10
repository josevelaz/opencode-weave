import { describe, expect, it } from "bun:test"
import { runLlmJudgeEvaluator } from "./llm-judge"

describe("runLlmJudgeEvaluator", () => {
  it("passes when expected phrases are present and forbidden are absent", () => {
    const results = runLlmJudgeEvaluator(
      {
        kind: "llm-judge",
        expectedContains: ["delegate to thread"],
        forbiddenContains: ["implement directly"],
      },
      { modelOutput: "I will delegate to thread for exploration." },
    )

    expect(results.every((result) => result.passed)).toBe(true)
  })

  it("fails when expected phrase is missing", () => {
    const results = runLlmJudgeEvaluator(
      {
        kind: "llm-judge",
        expectedContains: ["delegate to pattern"],
      },
      { modelOutput: "I will do this directly." },
    )

    expect(results.some((result) => !result.passed)).toBe(true)
  })

  it("uses presence check when no explicit phrase lists are provided", () => {
    const results = runLlmJudgeEvaluator(
      {
        kind: "llm-judge",
        rubricRef: "evals/rubrics/loom-routing-rubric.md",
      },
      { modelOutput: "non-empty" },
    )

    expect(results.length).toBe(1)
    expect(results[0].passed).toBe(true)
  })

  it("matches expected patterns case-insensitively", () => {
    const results = runLlmJudgeEvaluator(
      {
        kind: "llm-judge",
        expectedContains: ["thread"],
      },
      { modelOutput: "I will delegate to Thread for exploration." },
    )

    expect(results.length).toBe(1)
    expect(results[0].passed).toBe(true)
  })

  it("matches forbidden patterns case-insensitively", () => {
    const results = runLlmJudgeEvaluator(
      {
        kind: "llm-judge",
        forbiddenContains: ["I will implement this directly"],
      },
      { modelOutput: "I Will Implement This Directly on my own." },
    )

    expect(results.length).toBe(1)
    expect(results[0].passed).toBe(false)
  })

  it("passes when any expectedAnyOf phrase is present", () => {
    const results = runLlmJudgeEvaluator(
      {
        kind: "llm-judge",
        expectedAnyOf: ["delegate to pattern", "ask Pattern to plan"],
      },
      { modelOutput: "I will ask Pattern to plan this work." },
    )

    expect(results.length).toBe(1)
    expect(results[0].passed).toBe(true)
  })

  it("fails when no expectedAnyOf phrase is present", () => {
    const results = runLlmJudgeEvaluator(
      {
        kind: "llm-judge",
        expectedAnyOf: ["delegate to pattern", "ask Pattern to plan"],
      },
      { modelOutput: "I will implement this directly." },
    )

    expect(results.length).toBe(1)
    expect(results[0].passed).toBe(false)
  })

  it("splits weight across expected, any-of, and forbidden checks", () => {
    const results = runLlmJudgeEvaluator(
      {
        kind: "llm-judge",
        weight: 3,
        expectedContains: ["delegate"],
        expectedAnyOf: ["Pattern", "Shuttle"],
        forbiddenContains: ["implement directly"],
      },
      { modelOutput: "I will delegate to Pattern for this task." },
    )

    expect(results).toHaveLength(3)
    expect(results.every((result) => result.maxScore === 1)).toBe(true)
    expect(results.every((result) => result.passed)).toBe(true)
  })
})
