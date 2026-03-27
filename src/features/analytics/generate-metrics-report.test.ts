import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { generateMetricsReport } from "./generate-metrics-report"
import { appendSessionSummary, readMetricsReports } from "./storage"
import type { WorkState } from "../work-state/types"
import type { SessionSummary } from "./types"

let tempDir: string

function makeSummary(sessionId: string, durationMs: number = 300_000): SessionSummary {
  return {
    sessionId,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:05:00.000Z",
    durationMs,
    toolUsage: [],
    delegations: [],
    totalToolCalls: 0,
    totalDelegations: 0,
    tokenUsage: {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningTokens: 200,
      cacheReadTokens: 100,
      cacheWriteTokens: 50,
      totalMessages: 3,
    },
  }
}

function makeSummaryWithModel(sessionId: string, model: string, durationMs = 300_000): SessionSummary {
  return {
    ...makeSummary(sessionId, durationMs),
    model,
    totalCost: 0.05,
  }
}

function createPlanFile(dir: string, content: string): string {
  const plansDir = join(dir, ".weave", "plans")
  mkdirSync(plansDir, { recursive: true })
  const planPath = join(plansDir, "test-plan.md")
  writeFileSync(planPath, content, "utf-8")
  return planPath
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "weave-gen-metrics-test-"))
})

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe("generateMetricsReport", () => {
  it("generates a report with adherence and token data", () => {
    const planPath = createPlanFile(tempDir, `# Test Plan

## TODOs

- [ ] 1. **Task one**
  **What**: Do something
  **Files**: src/a.ts, src/b.ts
`)
    // Add session summaries
    appendSessionSummary(tempDir, makeSummary("s1", 120_000))
    appendSessionSummary(tempDir, makeSummary("s2", 180_000))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1", "s2"],
      plan_name: "test-plan",
      // No start_sha — will result in empty actual files
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.planName).toBe("test-plan")
    expect(report!.sessionCount).toBe(2)
    expect(report!.sessionIds).toEqual(["s1", "s2"])
    expect(report!.tokenUsage.input).toBe(2000) // 1000 * 2 sessions
    expect(report!.tokenUsage.output).toBe(1000)
    expect(report!.durationMs).toBe(300_000) // 120k + 180k
    expect(report!.quality).toBeDefined()
  })

  it("calculates adherence with vacuous coverage when no start_sha", () => {
    const planPath = createPlanFile(tempDir, `# Plan

## TODOs

- [ ] 1. **Task**
  **Files**: src/x.ts
`)
    appendSessionSummary(tempDir, makeSummary("s1"))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1"],
      plan_name: "test-plan",
      // No start_sha → no actual files → coverage = 0, precision = 1
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.adherence.coverage).toBe(0)
    expect(report!.adherence.precision).toBe(1)
    expect(report!.adherence.missedFiles).toEqual(["src/x.ts"])
  })

  it("writes report to storage and can be read back", () => {
    const planPath = createPlanFile(tempDir, `# Plan

## TODOs

- [ ] 1. **Task**
  **Files**: src/a.ts
`)
    appendSessionSummary(tempDir, makeSummary("s1"))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1"],
      plan_name: "test-plan",
    }

    generateMetricsReport(tempDir, state)

    const reports = readMetricsReports(tempDir)
    expect(reports.length).toBe(1)
    expect(reports[0].planName).toBe("test-plan")
  })

  it("handles missing plan file gracefully", () => {
    appendSessionSummary(tempDir, makeSummary("s1"))

    const state: WorkState = {
      active_plan: "/nonexistent/plan.md",
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1"],
      plan_name: "missing-plan",
    }

    // Should still generate a report (empty planned files)
    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.adherence.totalPlannedFiles).toBe(0)
    expect(report!.adherence.coverage).toBe(1) // vacuously complete
  })

  it("includes startSha in report when present", () => {
    const planPath = createPlanFile(tempDir, `# Plan

## TODOs

- [ ] 1. **Task**
  **Files**: src/a.ts
`)
    appendSessionSummary(tempDir, makeSummary("s1"))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1"],
      plan_name: "test-plan",
      start_sha: "abc123def456",
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.startSha).toBe("abc123def456")
  })

  it("sets generatedAt to current timestamp", () => {
    const planPath = createPlanFile(tempDir, `# Plan

## TODOs

- [ ] 1. **Task**
  **Files**: src/a.ts
`)
    appendSessionSummary(tempDir, makeSummary("s1"))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1"],
      plan_name: "test-plan",
    }

    const before = new Date().toISOString()
    const report = generateMetricsReport(tempDir, state)
    const after = new Date().toISOString()

    expect(report).not.toBeNull()
    expect(report!.generatedAt >= before).toBe(true)
    expect(report!.generatedAt <= after).toBe(true)
  })

  it("populates modelsUsed from session model fields", () => {
    const planPath = createPlanFile(tempDir, `# Plan\n\n## TODOs\n\n- [x] 1. **Task**\n  **Files**: src/a.ts\n`)
    appendSessionSummary(tempDir, makeSummaryWithModel("s1", "claude-opus-4"))
    appendSessionSummary(tempDir, makeSummaryWithModel("s2", "claude-sonnet-4-20250514"))
    appendSessionSummary(tempDir, makeSummaryWithModel("s3", "claude-opus-4")) // duplicate model

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1", "s2", "s3"],
      plan_name: "test-plan",
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.modelsUsed).toBeDefined()
    expect(report!.modelsUsed!.length).toBe(2)
    expect(report!.modelsUsed).toContain("claude-opus-4")
    expect(report!.modelsUsed).toContain("claude-sonnet-4-20250514")
  })

  it("omits modelsUsed when sessions have no model field", () => {
    const planPath = createPlanFile(tempDir, `# Plan\n\n## TODOs\n\n- [ ] 1. **Task**\n  **Files**: src/a.ts\n`)
    appendSessionSummary(tempDir, makeSummary("s1"))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1"],
      plan_name: "test-plan",
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.modelsUsed).toBeUndefined()
  })

  it("populates totalCost from session costs", () => {
    const planPath = createPlanFile(tempDir, `# Plan\n\n## TODOs\n\n- [ ] 1. **Task**\n  **Files**: src/a.ts\n`)
    appendSessionSummary(tempDir, makeSummaryWithModel("s1", "claude-opus-4"))
    appendSessionSummary(tempDir, makeSummaryWithModel("s2", "claude-sonnet-4-20250514"))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1", "s2"],
      plan_name: "test-plan",
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.totalCost).toBeCloseTo(0.10, 5)
  })

  it("populates sessionBreakdown with per-session detail", () => {
    const planPath = createPlanFile(tempDir, `# Plan\n\n## TODOs\n\n- [ ] 1. **Task**\n  **Files**: src/a.ts\n`)
    appendSessionSummary(tempDir, makeSummaryWithModel("s1", "claude-opus-4", 120_000))
    appendSessionSummary(tempDir, makeSummaryWithModel("s2", "claude-sonnet-4-20250514", 180_000))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1", "s2"],
      plan_name: "test-plan",
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.sessionBreakdown).toBeDefined()
    expect(report!.sessionBreakdown!.length).toBe(2)
    const s1 = report!.sessionBreakdown!.find((s) => s.sessionId === "s1")
    expect(s1).toBeDefined()
    expect(s1!.model).toBe("claude-opus-4")
    expect(s1!.durationMs).toBe(120_000)
  })

  it("populates quality with valid QualityReport structure for completed plan", () => {
    const planPath = createPlanFile(tempDir, `# Plan\n\n## TODOs\n\n- [x] 1. **Task one**\n  **Files**: src/a.ts\n- [x] 2. **Task two**\n  **Files**: src/b.ts\n`)
    appendSessionSummary(tempDir, makeSummary("s1"))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1"],
      plan_name: "test-plan",
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    expect(report!.quality).toBeDefined()
    expect(report!.quality!.composite).toBeGreaterThanOrEqual(0)
    expect(report!.quality!.composite).toBeLessThanOrEqual(1)
    expect(report!.quality!.components.adherenceCoverage).toBeGreaterThanOrEqual(0)
    expect(report!.quality!.components.taskCompletion).toBe(1) // all tasks done
    expect(report!.quality!.efficiencyData.totalTasks).toBe(2)
  })

  it("gaps field no longer exists on MetricsReport", () => {
    // Verify at compile time — if gaps existed on the type, this would need updating
    const planPath = createPlanFile(tempDir, `# Plan\n\n## TODOs\n\n- [ ] 1. **Task**\n  **Files**: src/a.ts\n`)
    appendSessionSummary(tempDir, makeSummary("s1"))

    const state: WorkState = {
      active_plan: planPath,
      started_at: "2026-01-01T00:00:00.000Z",
      session_ids: ["s1"],
      plan_name: "test-plan",
    }

    const report = generateMetricsReport(tempDir, state)
    expect(report).not.toBeNull()
    // TypeScript compilation will fail if 'gaps' property exists on MetricsReport — this confirms it was removed
    const keys = Object.keys(report!)
    expect(keys).not.toContain("gaps")
  })
})
