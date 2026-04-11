import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { readWorkState } from "../../src/features/work-state/storage"
import { CONTINUATION_MARKER } from "../../src/hooks/work-continuation"
import { getAgentDisplayName } from "../../src/shared/agent-display-names"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"
import { FakeOpencodeHost } from "../testkit/host/fake-opencode-host"

describe("E2E: /start-work runtime flow", () => {
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-e2e-start-work-")
    fixture.writeProjectConfig({
      continuation: {
        idle: {
          enabled: true,
          work: true,
        },
      },
    })
  })

  afterEach(() => {
    fixture.cleanup()
  })

  it("routes through chat.message, switches to Tapestry, injects context, and creates work state", async () => {
    fixture.writePlan(
      "my-feature",
      [
        "# Plan",
        "",
        "## TL;DR",
        "> **Summary**: Test start-work end-to-end.",
        "> **Estimated Effort**: Quick",
        "",
        "## TODOs",
        "- [ ] 1. First task",
        "  **What**: Do the first thing",
        "  **Files**: src/example.ts (new)",
        "  **Acceptance**: It works",
        "",
        "## Verification",
        "- [ ] All done",
      ].join("\n"),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    const output = await host.sendStartWork({
      sessionID: "sess-start-1",
      planName: "my-feature",
      timestamp: "2026-01-01T00:00:00.000Z",
    })

    expect(host.getCurrentAgent("sess-start-1")).toBe(getAgentDisplayName("tapestry"))
    expect(host.getTextParts("sess-start-1")).toHaveLength(1)
    expect(output.parts[0].text).toContain("Starting Plan: my-feature")
    expect(output.parts[0].text).toContain("SIDEBAR TODOS")

    const state = readWorkState(fixture.directory)
    expect(state).not.toBeNull()
    expect(state!.plan_name).toBe("my-feature")
    expect(state!.agent).toBe("tapestry")
    expect(state!.session_ids).toContain("sess-start-1")
  })

  it("continues active work on session.idle via client.session.promptAsync", async () => {
    fixture.writePlan(
      "idle-plan",
      [
        "# Plan",
        "",
        "## TL;DR",
        "> **Summary**: Test idle continuation end-to-end.",
        "> **Estimated Effort**: Quick",
        "",
        "## TODOs",
        "- [ ] 1. Continue work",
        "  **What**: Do the next thing",
        "  **Files**: src/idle.ts (new)",
        "  **Acceptance**: It works",
        "",
        "## Verification",
        "- [ ] All done",
      ].join("\n"),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.sendStartWork({
      sessionID: "sess-idle-1",
      planName: "idle-plan",
      timestamp: "2026-01-01T00:00:00.000Z",
    })
    host.client.clearEffects()
    await host.emitSessionIdle("sess-idle-1")

    expect(host.client.promptAsyncCalls).toHaveLength(1)
    expect(host.client.promptAsyncCalls[0].path.id).toBe("sess-idle-1")
    expect(host.client.promptAsyncCalls[0].body.parts).toHaveLength(1)
    expect(host.client.promptAsyncCalls[0].body.parts[0].type).toBe("text")
    expect(host.client.promptAsyncCalls[0].body.parts[0].text).toContain(CONTINUATION_MARKER)
    expect(host.client.promptAsyncCalls[0].body.parts[0].text).toContain("idle-plan")
    expect(host.client.promptAsyncCalls[0].body.parts[0].text).toContain("0/2 tasks completed")
  })

  it("pauses active work on session.interrupt and suppresses later idle continuation", async () => {
    fixture.writePlan(
      "interrupt-plan",
      [
        "# Plan",
        "",
        "## TL;DR",
        "> **Summary**: Test interrupt pause end-to-end.",
        "> **Estimated Effort**: Quick",
        "",
        "## TODOs",
        "- [ ] 1. First task",
        "  **What**: Do the first thing",
        "  **Files**: src/interrupt.ts (new)",
        "  **Acceptance**: It works",
        "",
        "## Verification",
        "- [ ] All done",
      ].join("\n"),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.sendStartWork({
      sessionID: "sess-interrupt-1",
      planName: "interrupt-plan",
      timestamp: "2026-01-01T00:00:00.000Z",
    })
    host.client.clearEffects()
    await host.emitCommandExecute("session.interrupt", "sess-interrupt-1")

    const stateAfterInterrupt = readWorkState(fixture.directory)
    expect(stateAfterInterrupt).not.toBeNull()
    expect(stateAfterInterrupt!.paused).toBe(true)

    await host.emitSessionIdle("sess-interrupt-1")

    expect(host.client.promptAsyncCalls).toHaveLength(0)
  })
})
