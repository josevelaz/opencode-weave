import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"
import { FakeOpencodeHost } from "../testkit/host/fake-opencode-host"

describe("E2E: pattern write guard", () => {
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-e2e-pattern-guard-")
  })

  afterEach(() => {
    fixture.cleanup()
  })

  it("blocks Pattern from writing non-markdown files outside .weave", async () => {
    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await expect(
      host.executeTool({
        sessionID: "sess-pattern",
        tool: "write",
        callID: "call-pattern-1",
        agent: "pattern",
        args: { file_path: `${fixture.directory}/src/app.ts` },
      }),
    ).rejects.toThrow("Pattern agent can only write to .weave/ directory")
  })

  it("allows Pattern to write markdown files inside .weave", async () => {
    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await expect(
      host.executeTool({
        sessionID: "sess-pattern-ok",
        tool: "write",
        callID: "call-pattern-2",
        agent: "pattern",
        args: { file_path: `${fixture.directory}/.weave/plans/notes.md` },
      }),
    ).resolves.toBeUndefined()
  })
})
