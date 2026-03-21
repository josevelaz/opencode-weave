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
})
