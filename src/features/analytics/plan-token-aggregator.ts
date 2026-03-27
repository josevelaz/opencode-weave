import type { MetricsTokenUsage, SessionTokenBreakdown } from "./types"
import { zeroTokenUsage } from "./types"
import { readSessionSummaries } from "./storage"

/**
 * Aggregate token usage for a plan by summing across matching session summaries.
 *
 * Reads all session summaries, filters to those whose `sessionId` is in `sessionIds`,
 * and sums their `tokenUsage` fields. Sessions without `tokenUsage` contribute zeros
 * (backward compatibility).
 *
 * Maps from session TokenUsage (inputTokens/outputTokens) to MetricsTokenUsage (input/output).
 */
export function aggregateTokensForPlan(directory: string, sessionIds: string[]): MetricsTokenUsage {
  const summaries = readSessionSummaries(directory)
  const sessionIdSet = new Set(sessionIds)
  const total = zeroTokenUsage()

  for (const summary of summaries) {
    if (!sessionIdSet.has(summary.sessionId)) continue

    if (summary.tokenUsage) {
      total.input += summary.tokenUsage.inputTokens
      total.output += summary.tokenUsage.outputTokens
      total.reasoning += summary.tokenUsage.reasoningTokens
      total.cacheRead += summary.tokenUsage.cacheReadTokens
      total.cacheWrite += summary.tokenUsage.cacheWriteTokens
    }
  }

  return total
}

/** Result of detailed token aggregation across sessions for a plan */
export interface DetailedTokenAggregation {
  /** Total token usage across all sessions */
  total: MetricsTokenUsage
  /** Total dollar cost across all sessions */
  totalCost: number
  /** Per-session breakdowns */
  sessions: SessionTokenBreakdown[]
  /** Per-model aggregation (grouped by model ID, "(unknown)" for sessions without model) */
  modelBreakdown: Array<{
    model: string
    tokens: MetricsTokenUsage
    cost: number
    sessionCount: number
  }>
}

/**
 * Aggregate token usage for a plan with per-session and per-model detail.
 *
 * The existing `aggregateTokensForPlan()` is unchanged for backward compatibility.
 * This function adds per-session breakdowns and model attribution.
 */
export function aggregateTokensDetailed(
  directory: string,
  sessionIds: string[],
): DetailedTokenAggregation {
  const summaries = readSessionSummaries(directory)
  const sessionIdSet = new Set(sessionIds)

  const total = zeroTokenUsage()
  let totalCost = 0
  const sessions: SessionTokenBreakdown[] = []
  const modelMap = new Map<string, { tokens: MetricsTokenUsage; cost: number; sessionCount: number }>()

  for (const summary of summaries) {
    if (!sessionIdSet.has(summary.sessionId)) continue

    const sessionTokens: MetricsTokenUsage = zeroTokenUsage()
    if (summary.tokenUsage) {
      sessionTokens.input = summary.tokenUsage.inputTokens
      sessionTokens.output = summary.tokenUsage.outputTokens
      sessionTokens.reasoning = summary.tokenUsage.reasoningTokens
      sessionTokens.cacheRead = summary.tokenUsage.cacheReadTokens
      sessionTokens.cacheWrite = summary.tokenUsage.cacheWriteTokens

      total.input += sessionTokens.input
      total.output += sessionTokens.output
      total.reasoning += sessionTokens.reasoning
      total.cacheRead += sessionTokens.cacheRead
      total.cacheWrite += sessionTokens.cacheWrite
    }

    const sessionCost = summary.totalCost ?? 0
    totalCost += sessionCost

    sessions.push({
      sessionId: summary.sessionId,
      model: summary.model,
      agentName: summary.agentName,
      tokens: sessionTokens,
      cost: sessionCost > 0 ? sessionCost : undefined,
      durationMs: summary.durationMs,
    })

    // Accumulate per-model
    const modelKey = summary.model ?? "(unknown)"
    const existing = modelMap.get(modelKey)
    if (existing) {
      existing.tokens.input += sessionTokens.input
      existing.tokens.output += sessionTokens.output
      existing.tokens.reasoning += sessionTokens.reasoning
      existing.tokens.cacheRead += sessionTokens.cacheRead
      existing.tokens.cacheWrite += sessionTokens.cacheWrite
      existing.cost += sessionCost
      existing.sessionCount += 1
    } else {
      modelMap.set(modelKey, {
        tokens: { ...sessionTokens },
        cost: sessionCost,
        sessionCount: 1,
      })
    }
  }

  const modelBreakdown = Array.from(modelMap.entries()).map(([model, data]) => ({
    model,
    tokens: data.tokens,
    cost: data.cost,
    sessionCount: data.sessionCount,
  }))

  return { total, totalCost, sessions, modelBreakdown }
}

