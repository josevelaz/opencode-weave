import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { createSessionTracker } from "../../src/features/analytics/session-tracker"
import {
  appendSessionSummary,
  MAX_SESSION_ENTRIES,
  readSessionSummaries,
} from "../../src/features/analytics/storage"
import { ANALYTICS_DIR, SESSION_SUMMARIES_FILE } from "../../src/features/analytics/types"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"

describe("Integration: analytics storage", () => {
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-integration-analytics-")
  })

  afterEach(() => {
    fixture.cleanup()
  })

  it("endSession persists a summary to JSONL on disk", () => {
    const tracker = createSessionTracker(fixture.directory)
    tracker.startSession("persist-test-1")
    tracker.trackToolStart("persist-test-1", "read", "c1")
    tracker.trackToolEnd("persist-test-1", "read", "c1")
    tracker.trackToolStart("persist-test-1", "task", "c2", "thread")
    tracker.trackToolEnd("persist-test-1", "task", "c2", "thread")
    const summary = tracker.endSession("persist-test-1")

    expect(summary).not.toBeNull()
    expect(existsSync(join(fixture.directory, ANALYTICS_DIR, SESSION_SUMMARIES_FILE))).toBe(true)

    const content = readFileSync(join(fixture.directory, ANALYTICS_DIR, SESSION_SUMMARIES_FILE), "utf-8")
    const lines = content.split("\n").filter((line: string) => line.trim().length > 0)
    expect(lines).toHaveLength(1)

    const parsed = JSON.parse(lines[0])
    expect(parsed.sessionId).toBe("persist-test-1")
    expect(parsed.totalToolCalls).toBe(2)
    expect(parsed.totalDelegations).toBe(1)
  })

  it("readSessionSummaries reads back persisted data", () => {
    const tracker = createSessionTracker(fixture.directory)

    tracker.startSession("session-a")
    tracker.trackToolStart("session-a", "read", "a1")
    tracker.trackToolEnd("session-a", "read", "a1")
    tracker.trackToolStart("session-a", "write", "a2")
    tracker.trackToolEnd("session-a", "write", "a2")
    tracker.endSession("session-a")

    tracker.startSession("session-b")
    tracker.trackToolStart("session-b", "bash", "b1")
    tracker.trackToolEnd("session-b", "bash", "b1")
    tracker.endSession("session-b")

    const summaries = readSessionSummaries(fixture.directory)
    expect(summaries).toHaveLength(2)
    expect(summaries[0].sessionId).toBe("session-a")
    expect(summaries[0].totalToolCalls).toBe(2)
    expect(summaries[1].sessionId).toBe("session-b")
    expect(summaries[1].totalToolCalls).toBe(1)
  })

  it("accumulates multiple sessions in the same JSONL file", () => {
    const tracker = createSessionTracker(fixture.directory)

    for (let index = 0; index < 3; index++) {
      const sessionID = `multi-${index}`
      tracker.startSession(sessionID)
      tracker.trackToolStart(sessionID, "read", `c-${index}`)
      tracker.trackToolEnd(sessionID, "read", `c-${index}`)
      tracker.endSession(sessionID)
    }

    const content = readFileSync(join(fixture.directory, ANALYTICS_DIR, SESSION_SUMMARIES_FILE), "utf-8")
    const lines = content.split("\n").filter((line: string) => line.trim().length > 0)
    expect(lines).toHaveLength(3)

    const summaries = readSessionSummaries(fixture.directory)
    expect(summaries).toHaveLength(3)
    expect(summaries[0].sessionId).toBe("multi-0")
    expect(summaries[2].sessionId).toBe("multi-2")
  })

  it("rotates JSONL storage down to MAX_SESSION_ENTRIES", () => {
    for (let index = 0; index <= MAX_SESSION_ENTRIES; index++) {
      appendSessionSummary(fixture.directory, {
        sessionId: `s-${index}`,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 100,
        toolUsage: [],
        delegations: [],
        totalToolCalls: 0,
        totalDelegations: 0,
      })
    }

    const summaries = readSessionSummaries(fixture.directory)
    expect(summaries).toHaveLength(MAX_SESSION_ENTRIES)
    expect(summaries[0].sessionId).toBe("s-1")
    expect(summaries[summaries.length - 1].sessionId).toBe(`s-${MAX_SESSION_ENTRIES}`)
  })
})
