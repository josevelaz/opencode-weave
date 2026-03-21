import { existsSync, readFileSync } from "fs"
import type {
  BaselineComparison,
  BaselineComparisonOptions,
  DeterministicBaseline,
  DeterministicBaselineCase,
  EvalCaseResult,
  EvalRunResult,
} from "./types"

const DEFAULT_SCORE_DROP_TOLERANCE = 0.01

function roundScore(value: number): number {
  return Math.round(value * 10000) / 10000
}

function toBaselineCase(result: EvalCaseResult): DeterministicBaselineCase {
  return {
    caseId: result.caseId,
    status: result.status,
    normalizedScore: roundScore(result.normalizedScore),
    assertionPassed: result.assertionResults.filter((assertion) => assertion.passed).length,
    assertionFailed: result.assertionResults.filter((assertion) => !assertion.passed).length,
    errorCount: result.errors.length,
  }
}

export function deriveDeterministicBaseline(run: EvalRunResult): DeterministicBaseline {
  return {
    version: 1,
    suiteId: run.suiteId,
    phase: run.phase,
    generatedAt: new Date().toISOString(),
    normalizedScore: roundScore(run.summary.normalizedScore),
    cases: run.caseResults.map(toBaselineCase).sort((left, right) => left.caseId.localeCompare(right.caseId)),
  }
}

export function readDeterministicBaseline(filePath: string): DeterministicBaseline {
  if (!existsSync(filePath)) {
    throw new Error(`Baseline file not found: ${filePath}`)
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as DeterministicBaseline
  if (parsed.version !== 1) {
    throw new Error(`Unsupported baseline version in ${filePath}: ${String(parsed.version)}`)
  }
  return parsed
}

export function compareDeterministicBaseline(
  baseline: DeterministicBaseline,
  run: EvalRunResult,
  options: BaselineComparisonOptions = {},
): BaselineComparison {
  const scoreDropTolerance = options.scoreDropTolerance ?? DEFAULT_SCORE_DROP_TOLERANCE
  const current = deriveDeterministicBaseline(run)
  const regressions: string[] = []
  const informational: string[] = []

  if (baseline.suiteId !== current.suiteId) {
    regressions.push(`Suite mismatch: baseline=${baseline.suiteId}, run=${current.suiteId}`)
  }

  if (baseline.phase !== current.phase) {
    informational.push(`Phase changed: baseline=${baseline.phase}, run=${current.phase}`)
  }

  if (baseline.normalizedScore - current.normalizedScore > scoreDropTolerance) {
    regressions.push(
      `Normalized score regressed from ${baseline.normalizedScore.toFixed(4)} to ${current.normalizedScore.toFixed(4)}`,
    )
  }

  const baselineCases = new Map(baseline.cases.map((entry) => [entry.caseId, entry]))
  const currentCases = new Map(current.cases.map((entry) => [entry.caseId, entry]))

  for (const [caseId, baselineCase] of baselineCases) {
    const currentCase = currentCases.get(caseId)
    if (!currentCase) {
      regressions.push(`Missing case in current run: ${caseId}`)
      continue
    }

    if (baselineCase.status === "passed" && currentCase.status !== "passed") {
      regressions.push(`Case regressed: ${caseId} (${baselineCase.status} -> ${currentCase.status})`)
    } else if (baselineCase.status !== currentCase.status) {
      informational.push(`Case status changed: ${caseId} (${baselineCase.status} -> ${currentCase.status})`)
    }

    if (baselineCase.assertionPassed !== currentCase.assertionPassed) {
      informational.push(
        `Assertion pass count changed for ${caseId}: ${baselineCase.assertionPassed} -> ${currentCase.assertionPassed}`,
      )
    }

    if (baselineCase.assertionFailed !== currentCase.assertionFailed) {
      informational.push(
        `Assertion fail count changed for ${caseId}: ${baselineCase.assertionFailed} -> ${currentCase.assertionFailed}`,
      )
    }
  }

  for (const caseId of currentCases.keys()) {
    if (!baselineCases.has(caseId)) {
      informational.push(`New case in current run: ${caseId}`)
    }
  }

  const outcome: BaselineComparison["outcome"] = regressions.length > 0
    ? "regression"
    : informational.length > 0
      ? "informational-diff"
      : "no-regression"

  return { outcome, regressions, informational }
}
