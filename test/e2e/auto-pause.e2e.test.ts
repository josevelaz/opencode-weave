import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { readWorkState } from "../../src/features/work-state"
import { CONTINUATION_MARKER } from "../../src/hooks/work-continuation"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"
import { FakeOpencodeHost } from "../testkit/host/fake-opencode-host"

describe("E2E: auto-pause on normal user message", () => {
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-e2e-auto-pause-")
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

  it("auto-pauses on a normal user message without treating it as continuation", async () => {
    fixture.writePlan(
      "auto-pause-plan",
      [
        "# Plan",
        "",
        "## TODOs",
        "- [ ] 1. Keep executing",
        "",
        "## Verification",
        "- [ ] done",
      ].join("\n"),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.sendStartWork({
      sessionID: "sess-auto-pause",
      planName: "auto-pause-plan",
      timestamp: "2026-01-01T00:00:00.000Z",
    })

    host.client.clearEffects()

    const output = await host.sendUserMessage({
      sessionID: "sess-auto-pause",
      text: "Can you also check the docs?",
    })

    expect(output.parts[0].text).toBe("Can you also check the docs?")
    expect(readWorkState(fixture.directory)?.paused).toBe(true)

    await host.emitSessionIdle("sess-auto-pause")

    expect(host.client.promptAsyncCalls).toHaveLength(0)
    expect(host.getTextParts("sess-auto-pause").join("\n")).not.toContain(CONTINUATION_MARKER)
  })
})
