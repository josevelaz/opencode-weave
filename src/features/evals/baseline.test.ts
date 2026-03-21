import { describe, expect, it } from "bun:test"
import { compareDeterministicBaseline, deriveDeterministicBaseline } from "./baseline"
import type { EvalRunResult } from "./types"

function makeRun(overrides: Partial<EvalRunResult> = {}): EvalRunResult {
  return {
    runId: "eval_test",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    suiteId: "phase1-core",
    phase: "phase1",
    summary: {
      totalCases: 2,
      passedCases: 2,
      failedCases: 0,
      errorCases: 0,
      totalScore: 2,
      normalizedScore: 1,
      maxScore: 2,
    },
    caseResults: [
      {
        caseId: "a",
        status: "passed",
        score: 1,
        normalizedScore: 1,
        maxScore: 1,
        durationMs: 10,
        artifacts: { renderedPrompt: "<Role>a</Role>" },
        assertionResults: [{ evaluatorKind: "contains-all", passed: true, score: 1, maxScore: 1, message: "ok" }],
        errors: [],
      },
      {
        caseId: "b",
        status: "passed",
        score: 1,
        normalizedScore: 1,
        maxScore: 1,
        durationMs: 20,
        artifacts: { renderedPrompt: "<Role>b</Role>" },
        assertionResults: [{ evaluatorKind: "contains-all", passed: true, score: 1, maxScore: 1, message: "ok" }],
        errors: [],
      },
    ],
    ...overrides,
  }
}

describe("deterministic baseline", () => {
  it("ignores volatile run fields", () => {
    const baseline = deriveDeterministicBaseline(makeRun())
    const comparison = compareDeterministicBaseline(
      baseline,
      makeRun({ runId: "eval_other", startedAt: "2027-02-01T00:00:00.000Z", finishedAt: "2027-02-01T00:01:00.000Z" }),
    )
    expect(comparison.outcome).toBe("no-regression")
  })

  it("flags regression when passing case becomes failed", () => {
    const baseline = deriveDeterministicBaseline(makeRun())
    const comparison = compareDeterministicBaseline(
      baseline,
      makeRun({
        summary: {
          totalCases: 2,
          passedCases: 1,
          failedCases: 1,
          errorCases: 0,
          totalScore: 1,
          normalizedScore: 0.5,
          maxScore: 2,
        },
        caseResults: [
          {
            ...makeRun().caseResults[0],
          },
          {
            ...makeRun().caseResults[1],
            status: "failed",
            normalizedScore: 0,
            score: 0,
            assertionResults: [
              { evaluatorKind: "contains-all", passed: false, score: 0, maxScore: 1, message: "missing" },
            ],
          },
        ],
      }),
    )
    expect(comparison.outcome).toBe("regression")
    expect(comparison.regressions.some((entry) => entry.includes("Case regressed: b"))).toBe(true)
  })

  it("reports informational diff for new case", () => {
    const baseline = deriveDeterministicBaseline(makeRun())
    const run = makeRun({
      summary: {
        totalCases: 3,
        passedCases: 3,
        failedCases: 0,
        errorCases: 0,
        totalScore: 3,
        normalizedScore: 1,
        maxScore: 3,
      },
      caseResults: [
        ...makeRun().caseResults,
        {
          caseId: "c",
          status: "passed",
          score: 1,
          normalizedScore: 1,
          maxScore: 1,
          durationMs: 10,
          artifacts: { renderedPrompt: "<Role>c</Role>" },
          assertionResults: [{ evaluatorKind: "contains-all", passed: true, score: 1, maxScore: 1, message: "ok" }],
          errors: [],
        },
      ],
    })
    const comparison = compareDeterministicBaseline(baseline, run)
    expect(comparison.outcome).toBe("informational-diff")
    expect(comparison.informational.some((entry) => entry.includes("New case in current run: c"))).toBe(true)
  })

  it("tolerates small normalized score drift", () => {
    const baseline = deriveDeterministicBaseline(makeRun())
    const run = makeRun({
      summary: {
        totalCases: 2,
        passedCases: 2,
        failedCases: 0,
        errorCases: 0,
        totalScore: 1.98,
        normalizedScore: 0.99,
        maxScore: 2,
      },
      caseResults: [
        {
          ...makeRun().caseResults[0],
          score: 0.99,
          normalizedScore: 0.99,
        },
        {
          ...makeRun().caseResults[1],
          score: 0.99,
          normalizedScore: 0.99,
        },
      ],
    })
    const comparison = compareDeterministicBaseline(baseline, run, { scoreDropTolerance: 0.02 })
    expect(comparison.outcome).toBe("no-regression")
  })

  it("flags missing case IDs as regressions", () => {
    const baseline = deriveDeterministicBaseline(makeRun())
    const run = makeRun({
      summary: {
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        errorCases: 0,
        totalScore: 1,
        normalizedScore: 1,
        maxScore: 1,
      },
      caseResults: [makeRun().caseResults[0]],
    })
    const comparison = compareDeterministicBaseline(baseline, run)
    expect(comparison.outcome).toBe("regression")
    expect(comparison.regressions.some((entry) => entry.includes("Missing case in current run: b"))).toBe(true)
  })

  it("reports assertion outcome changes as informational diffs", () => {
    const baseline = deriveDeterministicBaseline(makeRun())
    const run = makeRun({
      caseResults: [
        {
          ...makeRun().caseResults[0],
          assertionResults: [
            { evaluatorKind: "contains-all", passed: true, score: 0.5, maxScore: 1, message: "partial" },
            { evaluatorKind: "contains-all", passed: false, score: 0, maxScore: 0, message: "missing" },
          ],
        },
        makeRun().caseResults[1],
      ],
    })
    const comparison = compareDeterministicBaseline(baseline, run)
    expect(comparison.outcome).toBe("informational-diff")
    expect(comparison.informational.some((entry) => entry.includes("Assertion fail count changed for a"))).toBe(true)
  })
})
