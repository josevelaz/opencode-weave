import type { AdherenceReport, QualityReport } from "./types"

/**
 * Baseline tokens-per-task for efficiency scoring.
 * A plan consuming this many tokens per task gets an efficiency score of 0.5.
 * Plans below baseline score above 0.5; plans above baseline score below 0.5.
 * Exported for future configurability and test reference.
 */
export const BASELINE_TOKENS_PER_TASK = 50_000

/**
 * Calculate a composite quality score for a completed plan.
 *
 * Inputs:
 * - adherence: coverage and precision from the adherence report
 * - totalTasks / completedTasks: from getPlanProgress()
 * - totalTokens: sum of input + output + reasoning tokens across all sessions
 *
 * Component weights:
 * - adherenceCoverage (30%): fraction of planned files actually changed
 * - adherencePrecision (25%): fraction of actual changes that were planned
 * - taskCompletion (30%): fraction of tasks marked [x]
 * - efficiency (15%): inverse of normalized tokens-per-task (sigmoid-like)
 *
 * Pure function — no I/O.
 */
export function calculateQualityScore(params: {
  adherence: AdherenceReport
  totalTasks: number
  completedTasks: number
  totalTokens: number
}): QualityReport {
  const { adherence, totalTasks, completedTasks, totalTokens } = params

  // Clamp a value to [0, 1]
  const clamp = (v: number): number => Math.min(1, Math.max(0, v))

  // Component: adherence coverage (already 0-1)
  const adherenceCoverage = clamp(adherence.coverage)

  // Component: adherence precision (already 0-1)
  const adherencePrecision = clamp(adherence.precision)

  // Component: task completion
  const taskCompletion = totalTasks === 0 ? 1 : clamp(completedTasks / totalTasks)

  // Component: efficiency — sigmoid-like curve
  // efficiency = 1 / (1 + tokensPerTask / BASELINE)
  // - At 0 tokens/task: efficiency = 1.0
  // - At baseline tokens/task: efficiency = 0.5
  // - As tokens/task → ∞: efficiency → 0
  const safeTasks = Math.max(totalTasks, 1)
  const tokensPerTask = totalTokens / safeTasks
  const efficiency = clamp(1 / (1 + tokensPerTask / BASELINE_TOKENS_PER_TASK))

  // Composite: weighted average
  const composite = clamp(
    0.30 * adherenceCoverage +
    0.25 * adherencePrecision +
    0.30 * taskCompletion +
    0.15 * efficiency,
  )

  return {
    composite,
    components: {
      adherenceCoverage,
      adherencePrecision,
      taskCompletion,
      efficiency,
    },
    efficiencyData: {
      totalTokens,
      totalTasks,
      tokensPerTask,
    },
  }
}
