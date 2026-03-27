import { describe, it, expect } from "bun:test"
import { calculateQualityScore, BASELINE_TOKENS_PER_TASK } from "./quality-score"
import type { AdherenceReport } from "./types"

function makeAdherence(overrides: Partial<AdherenceReport> = {}): AdherenceReport {
  return {
    coverage: 1.0,
    precision: 1.0,
    plannedFilesChanged: [],
    unplannedChanges: [],
    missedFiles: [],
    totalPlannedFiles: 0,
    totalActualFiles: 0,
    ...overrides,
  }
}

describe("calculateQualityScore", () => {
  it("returns a perfect score for a perfect plan", () => {
    const result = calculateQualityScore({
      adherence: makeAdherence({ coverage: 1.0, precision: 1.0 }),
      totalTasks: 5,
      completedTasks: 5,
      totalTokens: 0, // zero tokens = perfect efficiency
    })

    expect(result.composite).toBeCloseTo(1.0, 5)
    expect(result.components.adherenceCoverage).toBe(1.0)
    expect(result.components.adherencePrecision).toBe(1.0)
    expect(result.components.taskCompletion).toBe(1.0)
    expect(result.components.efficiency).toBe(1.0)
  })

  it("composite is always in [0, 1]", () => {
    const cases = [
      { coverage: 0, precision: 0, tasks: 0, completed: 0, tokens: 1_000_000 },
      { coverage: 1, precision: 1, tasks: 10, completed: 10, tokens: 0 },
      { coverage: 0.5, precision: 0.5, tasks: 4, completed: 2, tokens: 200_000 },
    ]

    for (const c of cases) {
      const result = calculateQualityScore({
        adherence: makeAdherence({ coverage: c.coverage, precision: c.precision }),
        totalTasks: c.tasks,
        completedTasks: c.completed,
        totalTokens: c.tokens,
      })
      expect(result.composite).toBeGreaterThanOrEqual(0)
      expect(result.composite).toBeLessThanOrEqual(1)
    }
  })

  it("all component scores are in [0, 1]", () => {
    const result = calculateQualityScore({
      adherence: makeAdherence({ coverage: 0.7, precision: 0.8 }),
      totalTasks: 5,
      completedTasks: 3,
      totalTokens: 100_000,
    })

    expect(result.components.adherenceCoverage).toBeGreaterThanOrEqual(0)
    expect(result.components.adherenceCoverage).toBeLessThanOrEqual(1)
    expect(result.components.adherencePrecision).toBeGreaterThanOrEqual(0)
    expect(result.components.adherencePrecision).toBeLessThanOrEqual(1)
    expect(result.components.taskCompletion).toBeGreaterThanOrEqual(0)
    expect(result.components.taskCompletion).toBeLessThanOrEqual(1)
    expect(result.components.efficiency).toBeGreaterThanOrEqual(0)
    expect(result.components.efficiency).toBeLessThanOrEqual(1)
  })

  it("edge case: 0 total tasks → taskCompletion = 1", () => {
    const result = calculateQualityScore({
      adherence: makeAdherence(),
      totalTasks: 0,
      completedTasks: 0,
      totalTokens: 0,
    })

    expect(result.components.taskCompletion).toBe(1.0)
  })

  it("edge case: 0 total tokens → efficiency = 1.0", () => {
    const result = calculateQualityScore({
      adherence: makeAdherence(),
      totalTasks: 5,
      completedTasks: 5,
      totalTokens: 0,
    })

    expect(result.components.efficiency).toBe(1.0)
  })

  it("efficiency = 0.5 when tokensPerTask equals BASELINE_TOKENS_PER_TASK", () => {
    const totalTasks = 2
    const totalTokens = BASELINE_TOKENS_PER_TASK * totalTasks

    const result = calculateQualityScore({
      adherence: makeAdherence(),
      totalTasks,
      completedTasks: totalTasks,
      totalTokens,
    })

    expect(result.components.efficiency).toBeCloseTo(0.5, 5)
  })

  it("efficiency approaches 0 for very high token usage", () => {
    const result = calculateQualityScore({
      adherence: makeAdherence(),
      totalTasks: 1,
      completedTasks: 1,
      totalTokens: BASELINE_TOKENS_PER_TASK * 1000, // 1000x baseline
    })

    expect(result.components.efficiency).toBeLessThan(0.01)
  })

  it("component weights sum to 1.0", () => {
    const weights = [0.30, 0.25, 0.30, 0.15]
    const sum = weights.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it("composite matches weighted average of components", () => {
    const adherence = makeAdherence({ coverage: 0.8, precision: 0.9 })
    const totalTasks = 4
    const completedTasks = 3
    const totalTokens = BASELINE_TOKENS_PER_TASK * totalTasks // efficiency = 0.5

    const result = calculateQualityScore({ adherence, totalTasks, completedTasks, totalTokens })

    const expected =
      0.30 * result.components.adherenceCoverage +
      0.25 * result.components.adherencePrecision +
      0.30 * result.components.taskCompletion +
      0.15 * result.components.efficiency

    expect(result.composite).toBeCloseTo(expected, 10)
  })

  it("BASELINE_TOKENS_PER_TASK is exported and is a positive number", () => {
    expect(BASELINE_TOKENS_PER_TASK).toBeGreaterThan(0)
    expect(typeof BASELINE_TOKENS_PER_TASK).toBe("number")
  })

  it("populates efficiencyData with raw values", () => {
    const result = calculateQualityScore({
      adherence: makeAdherence(),
      totalTasks: 4,
      completedTasks: 4,
      totalTokens: 200_000,
    })

    expect(result.efficiencyData.totalTokens).toBe(200_000)
    expect(result.efficiencyData.totalTasks).toBe(4)
    expect(result.efficiencyData.tokensPerTask).toBe(50_000)
  })

  it("degraded quality (no adherence, partial tasks, high tokens) produces composite > 0", () => {
    const result = calculateQualityScore({
      adherence: makeAdherence({ coverage: 0, precision: 0 }),
      totalTasks: 10,
      completedTasks: 0,
      totalTokens: BASELINE_TOKENS_PER_TASK * 10 * 10, // very expensive
    })

    // All components near 0 except efficiency (small but positive)
    expect(result.composite).toBeGreaterThan(0)
    expect(result.composite).toBeLessThan(0.1)
  })
})
