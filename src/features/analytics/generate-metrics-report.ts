import type { WorkState } from "../work-state/types"
import { createPlanFsRepository } from "../../infrastructure/fs/plan-fs-repository"
import type { MetricsReport } from "./types"
import { extractPlannedFiles } from "./plan-parser"
import { getChangedFiles } from "./git-diff"
import { calculateAdherence } from "./adherence"
import { aggregateTokensDetailed } from "./plan-token-aggregator"
import { writeMetricsReport } from "./storage"
import { calculateQualityScore } from "./quality-score"
import { debug, warn } from "../../shared/log"

const PlanRepository = createPlanFsRepository()

/**
 * Generate a metrics report for a completed plan.
 *
 * Orchestrates:
 * 1. Extract planned files from the plan markdown
 * 2. Get actual changed files via git diff (startSha..HEAD)
 * 3. Calculate adherence (coverage, precision)
 * 4. Aggregate token usage (with per-session and model detail) across all sessions
 * 5. Compute total duration from session summaries
 * 6. Calculate quality score (composite of adherence, task completion, efficiency)
 * 7. Write the report to metrics-reports.jsonl
 *
 * Returns the report if successful, null on error.
 */
export function generateMetricsReport(
  directory: string,
  state: WorkState,
): MetricsReport | null {
  try {
    // 1. Extract planned files
    const plannedFiles = extractPlannedFiles(state.active_plan)

    // 2. Get actual changed files (requires start_sha)
    const actualFiles = state.start_sha
      ? getChangedFiles(directory, state.start_sha)
      : []

    // 3. Calculate adherence
    const adherence = calculateAdherence(plannedFiles, actualFiles)

    // 4. Aggregate token usage with per-session and model detail
    const detailed = aggregateTokensDetailed(directory, state.session_ids)

    // 5. Compute duration from session breakdowns
    const durationMs = detailed.sessions.reduce((sum, s) => sum + s.durationMs, 0)

    // 6. Calculate quality score
    let quality: MetricsReport["quality"]
    try {
      const progress = PlanRepository.getPlanProgress(state.active_plan)
      const totalTokens = detailed.total.input + detailed.total.output + detailed.total.reasoning
      quality = calculateQualityScore({
        adherence,
        totalTasks: progress.total,
        completedTasks: progress.completed,
        totalTokens,
      })
    } catch (qualityErr) {
      warn("[analytics] Failed to calculate quality score (non-fatal)", {
        error: String(qualityErr),
      })
    }

    // Derive modelsUsed from model breakdown (excluding "(unknown)")
    const modelsUsed = detailed.modelBreakdown
      .filter((m) => m.model !== "(unknown)")
      .map((m) => m.model)

    // 7. Build the report
    const report: MetricsReport = {
      planName: PlanRepository.getPlanName(state.active_plan),
      generatedAt: new Date().toISOString(),
      adherence,
      quality,
      tokenUsage: detailed.total,
      durationMs,
      sessionCount: state.session_ids.length,
      startSha: state.start_sha,
      sessionIds: [...state.session_ids],
      modelsUsed: modelsUsed.length > 0 ? modelsUsed : undefined,
      totalCost: detailed.totalCost > 0 ? detailed.totalCost : undefined,
      sessionBreakdown: detailed.sessions.length > 0 ? detailed.sessions : undefined,
    }

    // 8. Write to storage
    const written = writeMetricsReport(directory, report)
    if (!written) {
      warn("[analytics] Failed to write metrics report (non-fatal)")
      return null
    }

    debug("[analytics] Metrics report generated", {
      plan: report.planName,
      coverage: adherence.coverage,
      precision: adherence.precision,
      quality: quality?.composite,
    })

    return report
  } catch (err) {
    warn("[analytics] Failed to generate metrics report (non-fatal)", {
      error: String(err),
    })
    return null
  }
}
