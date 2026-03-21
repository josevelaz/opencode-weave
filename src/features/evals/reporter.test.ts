import { describe, expect, it } from "bun:test"
import { formatEvalSummary } from "./reporter"
import fixture from "./__fixtures__/phase1-run-result.json"
import type { EvalRunResult } from "./types"

const typedFixture = fixture as unknown as EvalRunResult

describe("formatEvalSummary", () => {
  it("formats a concise suite summary", () => {
    const summary = formatEvalSummary(typedFixture)
    expect(summary).toContain("Suite phase1-core")
    expect(summary).toContain("Suite role: full deterministic")
    expect(summary).toContain("Cases: 1")
    expect(summary).toContain("Normalized score: 1.00")
    expect(summary).toContain("Score: 1.00/1.00")
  })

  it("labels pr-smoke runs as PR smoke", () => {
    const summary = formatEvalSummary({
      ...typedFixture,
      suiteId: "pr-smoke",
    })
    expect(summary).toContain("Suite role: PR smoke")
  })
})
