import { describe, it, expect } from "bun:test"
import { formatMetricsMarkdown } from "./format-metrics"
import type { MetricsReport, SessionSummary } from "./types"

function makeReport(overrides: Partial<MetricsReport> = {}): MetricsReport {
  return {
    planName: "test-plan",
    generatedAt: "2026-03-05T12:00:00.000Z",
    adherence: {
      coverage: 0.85,
      precision: 0.92,
      plannedFilesChanged: ["src/a.ts", "src/b.ts"],
      unplannedChanges: [],
      missedFiles: [],
      totalPlannedFiles: 3,
      totalActualFiles: 2,
    },
    tokenUsage: { input: 45200, output: 12800, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    durationMs: 754000,
    sessionCount: 2,
    sessionIds: ["s1", "s2"],
    ...overrides,
  }
}

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "s1",
    startedAt: "2026-03-05T10:00:00.000Z",
    endedAt: "2026-03-05T10:15:00.000Z",
    durationMs: 900000,
    toolUsage: [
      { tool: "read", count: 50 },
      { tool: "write", count: 20 },
    ],
    delegations: [],
    totalToolCalls: 70,
    totalDelegations: 0,
    tokenUsage: { inputTokens: 10000, outputTokens: 5000, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalMessages: 5 },
    ...overrides,
  }
}

describe("formatMetricsMarkdown", () => {
  it("returns no-data message when both reports and summaries are empty", () => {
    const result = formatMetricsMarkdown([], [])
    expect(result).toContain("No metrics data yet")
    expect(result).toContain("weave.json")
    expect(result).toContain("analytics")
  })

  it("formats a single report with adherence scores", () => {
    const result = formatMetricsMarkdown([makeReport()], [])
    expect(result).toContain("## Weave Metrics Dashboard")
    expect(result).toContain("test-plan")
    expect(result).toContain("85%")
    expect(result).toContain("92%")
    expect(result).toContain("45,200")
    expect(result).toContain("12,800")
  })

  it("formats duration correctly", () => {
    const result = formatMetricsMarkdown([makeReport({ durationMs: 754000 })], [])
    expect(result).toContain("12m 34s")
  })

  it("shows unplanned changes when present", () => {
    const report = makeReport({
      adherence: {
        coverage: 0.8,
        precision: 0.7,
        plannedFilesChanged: ["src/a.ts"],
        unplannedChanges: ["src/extra.ts"],
        missedFiles: [],
        totalPlannedFiles: 2,
        totalActualFiles: 2,
      },
    })
    const result = formatMetricsMarkdown([report], [])
    expect(result).toContain("**Unplanned Changes**")
    expect(result).toContain("`src/extra.ts`")
  })

  it("shows missed files when present", () => {
    const report = makeReport({
      adherence: {
        coverage: 0.5,
        precision: 1.0,
        plannedFilesChanged: ["src/a.ts"],
        unplannedChanges: [],
        missedFiles: ["src/missed.ts"],
        totalPlannedFiles: 2,
        totalActualFiles: 1,
      },
    })
    const result = formatMetricsMarkdown([report], [])
    expect(result).toContain("**Missed Files**")
    expect(result).toContain("`src/missed.ts`")
  })

  it("shows reasoning tokens when non-zero", () => {
    const report = makeReport({
      tokenUsage: { input: 1000, output: 500, reasoning: 200, cacheRead: 0, cacheWrite: 0 },
    })
    const result = formatMetricsMarkdown([report], [])
    expect(result).toContain("Reasoning Tokens")
    expect(result).toContain("200")
  })

  it("shows cache tokens when non-zero", () => {
    const report = makeReport({
      tokenUsage: { input: 1000, output: 500, reasoning: 0, cacheRead: 300, cacheWrite: 100 },
    })
    const result = formatMetricsMarkdown([report], [])
    expect(result).toContain("Cache Read")
    expect(result).toContain("Cache Write")
  })

  it("does not show reasoning/cache tokens when zero", () => {
    const result = formatMetricsMarkdown([makeReport()], [])
    expect(result).not.toContain("Reasoning Tokens")
    expect(result).not.toContain("Cache Read")
  })

  it("formats aggregate session stats", () => {
    const result = formatMetricsMarkdown([], [makeSummary(), makeSummary({ sessionId: "s2" })])
    expect(result).toContain("### Aggregate Session Stats")
    expect(result).toContain("**Sessions tracked**: 2")
    expect(result).toContain("20,000")
    expect(result).toContain("10,000")
    expect(result).toContain("read (100)")
    expect(result).toContain("write (40)")
  })

  it("limits to last 5 reports by default", () => {
    const reports = Array.from({ length: 8 }, (_, i) =>
      makeReport({ planName: `plan-${i}` }),
    )
    const result = formatMetricsMarkdown(reports, [])
    // Should contain plans 3-7 (last 5), not plans 0-2
    expect(result).toContain("plan-3")
    expect(result).toContain("plan-7")
    expect(result).not.toContain("plan-2")
  })

  it("shows all reports when args is 'all'", () => {
    const reports = Array.from({ length: 8 }, (_, i) =>
      makeReport({ planName: `plan-${i}` }),
    )
    const result = formatMetricsMarkdown(reports, [], "all")
    expect(result).toContain("plan-0")
    expect(result).toContain("plan-7")
  })

  it("filters reports by plan name", () => {
    const reports = [
      makeReport({ planName: "auth-feature" }),
      makeReport({ planName: "dashboard-fix" }),
      makeReport({ planName: "auth-bug" }),
    ]
    const result = formatMetricsMarkdown(reports, [], "auth")
    expect(result).toContain("auth-feature")
    expect(result).toContain("auth-bug")
    expect(result).not.toContain("dashboard-fix")
  })

  it("shows no-match message when filter matches nothing", () => {
    const reports = [makeReport({ planName: "auth-feature" })]
    const result = formatMetricsMarkdown(reports, [], "nonexistent")
    expect(result).toContain('No reports found matching "nonexistent"')
  })

  it("handles summaries without tokenUsage gracefully", () => {
    const summary = makeSummary()
    delete (summary as unknown as Record<string, unknown>).tokenUsage
    const result = formatMetricsMarkdown([], [summary])
    expect(result).toContain("**Sessions tracked**: 1")
    expect(result).toContain("Total input tokens")
  })

  it("formats short durations as seconds", () => {
    const result = formatMetricsMarkdown([makeReport({ durationMs: 45000 })], [])
    expect(result).toContain("45s")
  })

  it("formats exact minute durations without seconds", () => {
    const result = formatMetricsMarkdown([makeReport({ durationMs: 120000 })], [])
    expect(result).toContain("2m")
    expect(result).not.toContain("2m 0s")
  })

  it("shows models row when modelsUsed is non-empty", () => {
    const result = formatMetricsMarkdown([makeReport({ modelsUsed: ["claude-opus-4", "gpt-4o"] })], [])
    expect(result).toContain("Models")
    expect(result).toContain("claude-opus-4")
    expect(result).toContain("gpt-4o")
  })

  it("omits models row when modelsUsed is absent", () => {
    const result = formatMetricsMarkdown([makeReport()], [])
    expect(result).not.toContain("| Models |")
  })

  it("shows total cost row when totalCost is defined and > 0", () => {
    const result = formatMetricsMarkdown([makeReport({ totalCost: 1.23 })], [])
    expect(result).toContain("Total Cost")
    expect(result).toContain("$1.23")
  })

  it("omits total cost row when totalCost is absent", () => {
    const result = formatMetricsMarkdown([makeReport()], [])
    expect(result).not.toContain("Total Cost")
  })

  it("shows quality score section when quality is present", () => {
    const quality = {
      composite: 0.78,
      components: {
        adherenceCoverage: 0.85,
        adherencePrecision: 0.90,
        taskCompletion: 0.75,
        efficiency: 0.62,
      },
      efficiencyData: { totalTokens: 100_000, totalTasks: 2, tokensPerTask: 50_000 },
    }
    const result = formatMetricsMarkdown([makeReport({ quality })], [])
    expect(result).toContain("Quality Score")
    expect(result).toContain("78%")
    expect(result).toContain("Adherence Coverage")
    expect(result).toContain("85%")
    expect(result).toContain("Adherence Precision")
    expect(result).toContain("90%")
    expect(result).toContain("Task Completion")
    expect(result).toContain("75%")
    expect(result).toContain("Efficiency")
    expect(result).toContain("62%")
  })

  it("omits quality section when quality is absent (backward compatible)", () => {
    const result = formatMetricsMarkdown([makeReport()], [])
    expect(result).not.toContain("Quality Score")
  })

  it("shows session breakdown when sessionBreakdown is present", () => {
    const sessionBreakdown = [
      {
        sessionId: "abc12345678",
        model: "claude-opus-4",
        agentName: "Loom",
        tokens: { input: 10_000, output: 5_000, reasoning: 2_000, cacheRead: 0, cacheWrite: 0 },
        cost: 0.55,
        durationMs: 330_000,
      },
    ]
    const result = formatMetricsMarkdown([makeReport({ sessionBreakdown })], [])
    expect(result).toContain("Session Breakdown")
    expect(result).toContain("abc12345")
    expect(result).toContain("Loom")
    expect(result).toContain("17,000") // 10k+5k+2k = 17k total tokens
    expect(result).toContain("claude-opus-4")
    expect(result).toContain("$0.55")
    expect(result).toContain("5m 30s")
  })

  it("omits session breakdown when sessionBreakdown is absent", () => {
    const result = formatMetricsMarkdown([makeReport()], [])
    expect(result).not.toContain("Session Breakdown")
  })

  it("shows model attribution when multiple models and sessionBreakdown present", () => {
    const sessionBreakdown = [
      {
        sessionId: "s1",
        model: "claude-opus-4",
        agentName: "Loom",
        tokens: { input: 30_000, output: 10_000, reasoning: 5_000, cacheRead: 0, cacheWrite: 0 },
        cost: 0.85,
        durationMs: 300_000,
      },
      {
        sessionId: "s2",
        model: "gpt-4o",
        agentName: "Tapestry",
        tokens: { input: 10_000, output: 2_000, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        cost: 0.23,
        durationMs: 200_000,
      },
    ]
    const result = formatMetricsMarkdown([makeReport({
      modelsUsed: ["claude-opus-4", "gpt-4o"],
      sessionBreakdown,
    })], [])
    expect(result).toContain("Model Attribution")
    expect(result).toContain("claude-opus-4")
    expect(result).toContain("gpt-4o")
  })

  it("omits model attribution for single-model plans", () => {
    const sessionBreakdown = [
      {
        sessionId: "s1",
        model: "claude-opus-4",
        agentName: "Loom",
        tokens: { input: 10_000, output: 5_000, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        cost: 0.55,
        durationMs: 300_000,
      },
    ]
    const result = formatMetricsMarkdown([makeReport({
      modelsUsed: ["claude-opus-4"],
      sessionBreakdown,
    })], [])
    expect(result).not.toContain("Model Attribution")
  })
})
