import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"
import { FakeOpencodeHost } from "../testkit/host/fake-opencode-host"
import { readWorkState } from "../../src/features/work-state"
import { CONTINUATION_MARKER } from "../../src/hooks/work-continuation"

describe("E2E: execution ownership", () => {
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-e2e-execution-ownership-")
  })

  afterEach(() => {
    fixture.cleanup()
  })

  it("restarting the same plan from another session reassigns idle ownership to that session", async () => {
    fixture.writePlan(
      "collision-plan",
      [
        "# Plan",
        "",
        "## TL;DR",
        "> **Summary**: Verify second explicit /start-work behavior.",
        "> **Estimated Effort**: Quick",
        "",
        "## TODOs",
        "- [ ] 1. First task",
        "  **What**: Do the first thing",
        "  **Files**: src/collision.ts (new)",
        "  **Acceptance**: It works",
        "",
        "## Verification",
        "- [ ] All done",
      ].join("\n"),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    const firstStart = await host.sendStartWork({
      sessionID: "sess-owner-1",
      planName: "collision-plan",
      timestamp: "2026-01-01T00:00:00.000Z",
    })

    expect(firstStart.parts[0].text).toContain("Starting Plan: collision-plan")

    host.client.clearEffects()

    const secondStart = await host.sendStartWork({
      sessionID: "sess-owner-2",
      planName: "collision-plan",
      timestamp: "2026-01-01T00:01:00.000Z",
    })

    expect(secondStart.parts[0].text).toContain("Starting Plan: collision-plan")

    const state = readWorkState(fixture.directory)
    expect(state).not.toBeNull()
    expect(state!.plan_name).toBe("collision-plan")
    expect(state!.session_ids).toEqual(["sess-owner-2"])

    await host.emitSessionIdle("sess-owner-1")
    expect(host.client.promptAsyncCalls).toHaveLength(0)

    await host.emitSessionIdle("sess-owner-2")
    expect(host.client.promptAsyncCalls).toHaveLength(1)
    expect(host.client.lastPromptAsyncCall?.path.id).toBe("sess-owner-2")
    expect(host.client.lastPromptAsyncCall?.body.parts[0].text).toContain(CONTINUATION_MARKER)
    expect(host.client.lastPromptAsyncCall?.body.parts[0].text).toContain("collision-plan")
  })

  it("resumes the active plan across sessions when /start-work has no plan argument", async () => {
    fixture.writePlan(
      "resume-plan",
      [
        "# Plan",
        "",
        "## TL;DR",
        "> **Summary**: Verify cross-session resume behavior.",
        "> **Estimated Effort**: Quick",
        "",
        "## TODOs",
        "- [x] 1. Finished task",
        "  **What**: Already done",
        "  **Files**: src/resume.ts",
        "  **Acceptance**: It works",
        "- [ ] 2. Remaining task",
        "  **What**: Continue the plan",
        "  **Files**: src/resume.ts",
        "  **Acceptance**: It still works",
        "",
        "## Verification",
        "- [ ] All done",
      ].join("\n"),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.sendStartWork({
      sessionID: "sess-resume-1",
      planName: "resume-plan",
      timestamp: "2026-01-01T00:00:00.000Z",
    })

    const resumed = await host.sendStartWork({
      sessionID: "sess-resume-2",
      timestamp: "2026-01-01T00:05:00.000Z",
    })

    expect(resumed.parts[0].text).toContain("Resuming Plan: resume-plan")
    expect(resumed.parts[0].text).toContain("Status**: RESUMING")
    expect(resumed.parts[0].text).toContain("1/3 tasks completed")
    expect(resumed.parts[0].text).toContain("SIDEBAR TODOS")

    const state = readWorkState(fixture.directory)
    expect(state).not.toBeNull()
    expect(state!.plan_name).toBe("resume-plan")
    expect(state!.paused).toBe(false)
    expect(state!.session_ids).toEqual(["sess-resume-1", "sess-resume-2"])

    host.client.clearEffects()

    await host.emitSessionIdle("sess-resume-1")
    await host.emitSessionIdle("sess-resume-2")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].path.id).toBe("sess-resume-1")
    expect(host.client.promptAsyncCalls[1].path.id).toBe("sess-resume-2")
    expect(host.client.promptAsyncCalls[0].body.parts[0].text).toContain(CONTINUATION_MARKER)
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain(CONTINUATION_MARKER)
  })

  it("keeps state consistent and shows a user-visible warning when a second start-work selects a different missing plan", async () => {
    fixture.writePlan(
      "active-plan",
      [
        "# Plan",
        "",
        "## TL;DR",
        "> **Summary**: Verify explicit-plan collision messaging.",
        "> **Estimated Effort**: Quick",
        "",
        "## TODOs",
        "- [ ] 1. Active task",
        "  **What**: Stay active",
        "  **Files**: src/active.ts (new)",
        "  **Acceptance**: It works",
        "",
        "## Verification",
        "- [ ] All done",
      ].join("\n"),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.sendStartWork({
      sessionID: "sess-active-1",
      planName: "active-plan",
      timestamp: "2026-01-01T00:00:00.000Z",
    })

    const missingPlanAttempt = await host.sendStartWork({
      sessionID: "sess-active-2",
      planName: "missing-plan",
      timestamp: "2026-01-01T00:01:00.000Z",
    })

    expect(missingPlanAttempt.parts[0].text).toContain("Plan Not Found")
    expect(missingPlanAttempt.parts[0].text).toContain("missing-plan")
    expect(missingPlanAttempt.parts[0].text).toContain("active-plan")

    const state = readWorkState(fixture.directory)
    expect(state).not.toBeNull()
    expect(state!.plan_name).toBe("active-plan")
    expect(state!.session_ids).toEqual(["sess-active-1"])

    host.client.clearEffects()

    await host.emitSessionIdle("sess-active-2")
    expect(host.client.promptAsyncCalls).toHaveLength(0)

    await host.emitSessionIdle("sess-active-1")
    expect(host.client.promptAsyncCalls).toHaveLength(1)
    expect(host.client.lastPromptAsyncCall?.path.id).toBe("sess-active-1")
  })
})
