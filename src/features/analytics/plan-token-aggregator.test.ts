import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { aggregateTokensForPlan, aggregateTokensDetailed } from "./plan-token-aggregator"
import { appendSessionSummary } from "./storage"
import type { SessionSummary, TokenUsage } from "./types"

let tempDir: string

function makeTokenUsage(vals: {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}): TokenUsage {
  return {
    inputTokens: vals.input,
    outputTokens: vals.output,
    reasoningTokens: vals.reasoning,
    cacheReadTokens: vals.cacheRead,
    cacheWriteTokens: vals.cacheWrite,
    totalMessages: 1,
  }
}

function makeSummary(
  sessionId: string,
  tokenUsage?: TokenUsage,
): SessionSummary {
  return {
    sessionId,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:05:00.000Z",
    durationMs: 300_000,
    toolUsage: [],
    delegations: [],
    totalToolCalls: 0,
    totalDelegations: 0,
    tokenUsage,
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "weave-token-agg-test-"))
})

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe("aggregateTokensDetailed", () => {
  it("returns zero totals and empty arrays for empty session list", () => {
    const result = aggregateTokensDetailed(tempDir, [])
    expect(result.total.input).toBe(0)
    expect(result.total.output).toBe(0)
    expect(result.total.reasoning).toBe(0)
    expect(result.totalCost).toBe(0)
    expect(result.sessions).toEqual([])
    expect(result.modelBreakdown).toEqual([])
  })

  it("total matches aggregateTokensForPlan for same input", () => {
    appendSessionSummary(
      tempDir,
      makeSummary("s1", makeTokenUsage({ input: 100, output: 50, reasoning: 10, cacheRead: 5, cacheWrite: 2 })),
    )
    appendSessionSummary(
      tempDir,
      makeSummary("s2", makeTokenUsage({ input: 200, output: 100, reasoning: 20, cacheRead: 10, cacheWrite: 4 })),
    )

    const simple = aggregateTokensForPlan(tempDir, ["s1", "s2"])
    const detailed = aggregateTokensDetailed(tempDir, ["s1", "s2"])

    expect(detailed.total.input).toBe(simple.input)
    expect(detailed.total.output).toBe(simple.output)
    expect(detailed.total.reasoning).toBe(simple.reasoning)
    expect(detailed.total.cacheRead).toBe(simple.cacheRead)
    expect(detailed.total.cacheWrite).toBe(simple.cacheWrite)
  })

  it("per-session breakdown has correct model, agent, tokens, duration", () => {
    const summary: SessionSummary = {
      ...makeSummary("s1", makeTokenUsage({ input: 100, output: 50, reasoning: 10, cacheRead: 5, cacheWrite: 2 })),
      model: "claude-opus-4",
      agentName: "Loom",
      durationMs: 120_000,
    }
    appendSessionSummary(tempDir, summary)

    const result = aggregateTokensDetailed(tempDir, ["s1"])
    expect(result.sessions).toHaveLength(1)

    const session = result.sessions[0]
    expect(session.sessionId).toBe("s1")
    expect(session.model).toBe("claude-opus-4")
    expect(session.agentName).toBe("Loom")
    expect(session.tokens.input).toBe(100)
    expect(session.tokens.output).toBe(50)
    expect(session.tokens.reasoning).toBe(10)
    expect(session.durationMs).toBe(120_000)
  })

  it("model breakdown groups sessions by model", () => {
    const s1: SessionSummary = {
      ...makeSummary("s1", makeTokenUsage({ input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 })),
      model: "claude-opus-4",
    }
    const s2: SessionSummary = {
      ...makeSummary("s2", makeTokenUsage({ input: 200, output: 100, reasoning: 0, cacheRead: 0, cacheWrite: 0 })),
      model: "claude-opus-4",
    }
    const s3: SessionSummary = {
      ...makeSummary("s3", makeTokenUsage({ input: 50, output: 25, reasoning: 0, cacheRead: 0, cacheWrite: 0 })),
      model: "gpt-4o",
    }
    appendSessionSummary(tempDir, s1)
    appendSessionSummary(tempDir, s2)
    appendSessionSummary(tempDir, s3)

    const result = aggregateTokensDetailed(tempDir, ["s1", "s2", "s3"])
    expect(result.modelBreakdown).toHaveLength(2)

    const claude = result.modelBreakdown.find(m => m.model === "claude-opus-4")!
    expect(claude).toBeDefined()
    expect(claude.sessionCount).toBe(2)
    expect(claude.tokens.input).toBe(300)

    const gpt = result.modelBreakdown.find(m => m.model === "gpt-4o")!
    expect(gpt).toBeDefined()
    expect(gpt.sessionCount).toBe(1)
    expect(gpt.tokens.input).toBe(50)
  })

  it("sessions without model are grouped under '(unknown)'", () => {
    appendSessionSummary(
      tempDir,
      makeSummary("s1", makeTokenUsage({ input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 })),
    )

    const result = aggregateTokensDetailed(tempDir, ["s1"])
    expect(result.modelBreakdown).toHaveLength(1)
    expect(result.modelBreakdown[0].model).toBe("(unknown)")
    expect(result.modelBreakdown[0].sessionCount).toBe(1)
  })

  it("excludes sessions not in the requested sessionIds", () => {
    appendSessionSummary(
      tempDir,
      makeSummary("s1", makeTokenUsage({ input: 100, output: 50, reasoning: 0, cacheRead: 0, cacheWrite: 0 })),
    )
    appendSessionSummary(
      tempDir,
      makeSummary("s2", makeTokenUsage({ input: 999, output: 999, reasoning: 999, cacheRead: 999, cacheWrite: 999 })),
    )

    const result = aggregateTokensDetailed(tempDir, ["s1"])
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].sessionId).toBe("s1")
    expect(result.total.input).toBe(100)
  })

  it("handles sessions without tokenUsage (backward compat)", () => {
    appendSessionSummary(tempDir, makeSummary("s1")) // no tokenUsage

    const result = aggregateTokensDetailed(tempDir, ["s1"])
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].tokens.input).toBe(0)
    expect(result.sessions[0].tokens.output).toBe(0)
    expect(result.total.input).toBe(0)
  })

  it("returns zero totals and empty arrays when no summaries file exists", () => {
    const result = aggregateTokensDetailed(tempDir, ["s1"])
    expect(result.total.input).toBe(0)
    expect(result.sessions).toHaveLength(0)
    expect(result.modelBreakdown).toHaveLength(0)
  })
})

describe("aggregateTokensForPlan", () => {
  it("sums token usage for matching session IDs", () => {
    appendSessionSummary(
      tempDir,
      makeSummary("s1", makeTokenUsage({ input: 100, output: 50, reasoning: 10, cacheRead: 5, cacheWrite: 2 })),
    )
    appendSessionSummary(
      tempDir,
      makeSummary("s2", makeTokenUsage({ input: 200, output: 100, reasoning: 20, cacheRead: 10, cacheWrite: 4 })),
    )
    appendSessionSummary(
      tempDir,
      makeSummary("s3", makeTokenUsage({ input: 999, output: 999, reasoning: 999, cacheRead: 999, cacheWrite: 999 })),
    )

    const result = aggregateTokensForPlan(tempDir, ["s1", "s2"])
    expect(result.input).toBe(300)
    expect(result.output).toBe(150)
    expect(result.reasoning).toBe(30)
    expect(result.cacheRead).toBe(15)
    expect(result.cacheWrite).toBe(6)
  })

  it("returns zeros when no sessions match", () => {
    appendSessionSummary(
      tempDir,
      makeSummary("s1", makeTokenUsage({ input: 100, output: 50, reasoning: 10, cacheRead: 5, cacheWrite: 2 })),
    )

    const result = aggregateTokensForPlan(tempDir, ["nonexistent"])
    expect(result.input).toBe(0)
    expect(result.output).toBe(0)
    expect(result.reasoning).toBe(0)
    expect(result.cacheRead).toBe(0)
    expect(result.cacheWrite).toBe(0)
  })

  it("returns zeros for sessions without tokenUsage (backward compat)", () => {
    appendSessionSummary(tempDir, makeSummary("s1"))
    appendSessionSummary(tempDir, makeSummary("s2"))

    const result = aggregateTokensForPlan(tempDir, ["s1", "s2"])
    expect(result.input).toBe(0)
    expect(result.output).toBe(0)
  })

  it("handles mix of sessions with and without tokenUsage", () => {
    appendSessionSummary(
      tempDir,
      makeSummary("s1", makeTokenUsage({ input: 100, output: 50, reasoning: 10, cacheRead: 5, cacheWrite: 2 })),
    )
    appendSessionSummary(tempDir, makeSummary("s2")) // no tokenUsage

    const result = aggregateTokensForPlan(tempDir, ["s1", "s2"])
    expect(result.input).toBe(100)
    expect(result.output).toBe(50)
  })

  it("returns zeros when no summaries file exists", () => {
    const result = aggregateTokensForPlan(tempDir, ["s1"])
    expect(result.input).toBe(0)
    expect(result.output).toBe(0)
  })
})
