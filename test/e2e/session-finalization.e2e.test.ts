import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { readMetricsReports, readSessionSummaries } from "../../src/features/analytics"
import { readWorkState } from "../../src/features/work-state"
import { createExecutionLeaseFsStore } from "../../src/infrastructure/fs/execution-lease-fs-store"
import { createExecutionLeaseState, createSessionRuntimeState } from "../../src/domain/session/execution-lease"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"
import { FakeOpencodeHost } from "../testkit/host/fake-opencode-host"

describe("E2E: session finalization", () => {
  const executionLeaseRepository = createExecutionLeaseFsStore()
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-e2e-session-finalization-")
    fixture.writeProjectConfig({
      analytics: {
        enabled: true,
      },
    })
  })

  afterEach(() => {
    fixture.cleanup()
  })

  it("persists an analytics session summary when a tracked session is deleted", async () => {
    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.executeTool({
      sessionID: "sess-analytics-1",
      tool: "read",
      callID: "call-read-1",
    })
    await host.sendChatParams({
      sessionID: "sess-analytics-1",
      agent: "Loom (Main Orchestrator)",
      modelID: "claude-sonnet-4-20250514",
      contextLimit: 200_000,
    })
    await host.emitMessageUpdated({
      role: "assistant",
      sessionID: "sess-analytics-1",
      cost: 0.12,
      tokens: {
        input: 1200,
        output: 340,
        reasoning: 80,
        cache: { read: 25, write: 10 },
      },
    })

    await host.emitSessionDeleted("sess-analytics-1")

    const summaries = readSessionSummaries(fixture.directory)
    expect(summaries).toHaveLength(1)

    const summary = summaries[0]
    expect(summary.sessionId).toBe("sess-analytics-1")
    expect(summary.totalToolCalls).toBe(1)
    expect(summary.totalDelegations).toBe(0)
    expect(summary.toolUsage).toEqual([{ tool: "read", count: 1 }])
    expect(summary.agentName).toBe("Loom (Main Orchestrator)")
    expect(summary.model).toBe("claude-sonnet-4-20250514")
    expect(summary.totalCost).toBe(0.12)
    expect(summary.tokenUsage).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      reasoningTokens: 80,
      cacheReadTokens: 25,
      cacheWriteTokens: 10,
      totalMessages: 1,
    })
  })

  it("finalizes a completed plan session on deletion and keeps work state intact", async () => {
    fixture.writePlan(
      "finished-plan",
      [
        "# Plan",
        "",
        "## TL;DR",
        "> **Summary**: Verify session finalization for completed plan work.",
        "> **Estimated Effort**: Quick",
        "",
        "## TODOs",
        "- [ ] 1. Finished task",
        "  **What**: Complete the work before session deletion",
        "  **Files**: src/finished.ts",
        "  **Acceptance**: It works",
        "",
        "## Verification",
        "- [ ] All done",
      ].join("\n"),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.sendStartWork({
      sessionID: "sess-plan-1",
      planName: "finished-plan",
      timestamp: "2026-01-01T00:00:00.000Z",
    })
    await host.executeTool({
      sessionID: "sess-plan-1",
      tool: "read",
      callID: "call-plan-1",
    })
    await host.sendChatParams({
      sessionID: "sess-plan-1",
      agent: "Tapestry (Execution Orchestrator)",
      modelID: "claude-opus-4",
    })
    await host.emitMessageUpdated({
      role: "assistant",
      sessionID: "sess-plan-1",
      cost: 0.03,
      tokens: {
        input: 600,
        output: 150,
        reasoning: 40,
      },
    })

    fixture.writePlan(
      "finished-plan",
      [
        "# Plan",
        "",
        "## TL;DR",
        "> **Summary**: Verify session finalization for completed plan work.",
        "> **Estimated Effort**: Quick",
        "",
        "## TODOs",
        "- [x] 1. Finished task",
        "  **What**: Complete the work before session deletion",
        "  **Files**: src/finished.ts",
        "  **Acceptance**: It works",
        "",
        "## Verification",
        "- [x] All done",
      ].join("\n"),
    )

    await host.emitSessionDeleted("sess-plan-1")

    const state = readWorkState(fixture.directory)
    expect(state).not.toBeNull()
    expect(state!.plan_name).toBe("finished-plan")
    expect(state!.session_ids).toEqual(["sess-plan-1"])

    const summaries = readSessionSummaries(fixture.directory)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].sessionId).toBe("sess-plan-1")

    const reports = readMetricsReports(fixture.directory)
    expect(reports).toHaveLength(1)

    const report = reports[0]
    expect(report.planName).toBe("finished-plan")
    expect(report.sessionCount).toBe(1)
    expect(report.sessionIds).toEqual(["sess-plan-1"])
    expect(report.modelsUsed).toEqual(["claude-opus-4"])
    expect(report.totalCost).toBe(0.03)
    expect(report.tokenUsage).toEqual({
      input: 600,
      output: 150,
      reasoning: 40,
      cacheRead: 0,
      cacheWrite: 0,
    })
    expect(report.sessionBreakdown).toHaveLength(1)
    expect(report.sessionBreakdown?.[0].sessionId).toBe("sess-plan-1")
    expect(report.sessionBreakdown?.[0].agentName).toBe("Tapestry (Execution Orchestrator)")
  })

  it("treats deleting an unknown session as a safe no-op", async () => {
    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.emitSessionDeleted("sess-missing")

    expect(readSessionSummaries(fixture.directory)).toEqual([])
    expect(readMetricsReports(fixture.directory)).toEqual([])
    expect(readWorkState(fixture.directory)).toBeNull()
  })

  it("clears per-session runtime state on session deletion", async () => {
    executionLeaseRepository.writeExecutionLease(
      fixture.directory,
      createExecutionLeaseState({
        ownerKind: "plan",
        ownerRef: "/tmp/plan.md",
        status: "running",
        sessionId: "sess-runtime-delete",
        executorAgent: "tapestry",
      }),
    )
    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-runtime-delete",
        foregroundAgent: "tapestry",
        mode: "plan",
        executionRef: "/tmp/plan.md",
        status: "running",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.emitSessionDeleted("sess-runtime-delete")

    expect(executionLeaseRepository.readExecutionLease(fixture.directory)).toBeNull()
    expect(executionLeaseRepository.readSessionRuntime(fixture.directory, "sess-runtime-delete")).toBeNull()
  })
})
