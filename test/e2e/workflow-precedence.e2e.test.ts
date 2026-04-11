import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"
import { FakeOpencodeHost } from "../testkit/host/fake-opencode-host"
import { WORKFLOW_CONTINUATION_MARKER } from "../../src/features/workflow/hook"
import { createExecutionLeaseFsStore } from "../../src/infrastructure/fs/execution-lease-fs-store"

describe("E2E: workflow precedence over plan idle loop", () => {
  const executionLeaseRepository = createExecutionLeaseFsStore()
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-e2e-workflow-precedence-")
    fixture.writeProjectConfig({
      continuation: {
        idle: {
          enabled: true,
          work: true,
          workflow: true,
        },
      },
    })
  })

  afterEach(() => {
    fixture.cleanup()
  })

  it("lets workflow continuation own session.idle when both plan and workflow are active", async () => {
    fixture.writePlan(
      "parallel-plan",
      [
        "# Plan",
        "",
        "## TODOs",
        "- [ ] 1. Keep plan active",
        "",
        "## Verification",
        "- [ ] done",
      ].join("\n"),
    )

    const workflowDir = join(fixture.directory, ".opencode", "workflows")
    mkdirSync(workflowDir, { recursive: true })
    writeFileSync(
      join(workflowDir, "test-workflow.json"),
      JSON.stringify({
        name: "test-workflow",
        description: "Test workflow",
        version: 1,
        steps: [
          {
            id: "build",
            name: "Build",
            type: "autonomous",
            agent: "tapestry",
            prompt: "Build {{instance.goal}}",
            completion: { method: "agent_signal" },
          },
          {
            id: "verify",
            name: "Verify",
            type: "interactive",
            agent: "loom",
            prompt: "Verify {{instance.goal}}",
            completion: { method: "user_confirm" },
          },
        ],
      }),
      "utf-8",
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })

    await host.sendStartWork({
      sessionID: "sess-precedence",
      planName: "parallel-plan",
      timestamp: "2026-01-01T00:00:00.000Z",
    })
    host.client.clearEffects()

    await host.sendRunWorkflow({
      sessionID: "sess-precedence",
      workflowArgs: 'test-workflow "Add OAuth2"',
      timestamp: "2026-01-01T00:01:00.000Z",
    })
    host.client.clearEffects()

    await host.emitMessagePartUpdated({
      sessionID: "sess-precedence",
      text: "done <!-- workflow:step-complete -->",
    })
    await host.emitSessionIdle("sess-precedence")

    expect(host.client.promptAsyncCalls).toHaveLength(1)
    const text = host.client.promptAsyncCalls[0].body.parts[0].text ?? ""
    expect(text).toContain(WORKFLOW_CONTINUATION_MARKER)
    expect(text).not.toContain("<!-- weave:continuation -->")
  })

  it("applies workflow precedence during compaction when both plan and workflow state are present", async () => {
    fixture.writeProjectConfig({
      continuation: {
        recovery: { compaction: true },
        idle: { enabled: true, work: true, workflow: true },
      },
    })

    fixture.writePlan(
      "parallel-plan",
      ["# Plan", "", "## TODOs", "- [ ] 1. Keep plan active", "", "## Verification", "- [ ] done"].join("\n"),
    )

    const workflowDir = join(fixture.directory, ".opencode", "workflows")
    mkdirSync(workflowDir, { recursive: true })
    writeFileSync(
      join(workflowDir, "test-workflow.json"),
      JSON.stringify({
        name: "test-workflow",
        version: 1,
        steps: [
          { id: "build", name: "Build", type: "autonomous", agent: "tapestry", prompt: "Build {{instance.goal}}", completion: { method: "agent_signal" } },
          { id: "verify", name: "Verify", type: "interactive", agent: "loom", prompt: "Verify {{instance.goal}}", completion: { method: "user_confirm" } },
        ],
      }),
      "utf-8",
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.sendStartWork({ sessionID: "sess-precedence", planName: "parallel-plan" })
    await host.sendRunWorkflow({ sessionID: "sess-precedence", workflowArgs: 'test-workflow "Add OAuth2"' })
    await host.emitMessagePartUpdated({ sessionID: "sess-precedence", text: "done <!-- workflow:step-complete -->" })
    await host.emitSessionIdle("sess-precedence")

    host.client.clearEffects()
    await host.emitSessionCompacted("sess-precedence")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("Loom (Main Orchestrator)")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain(WORKFLOW_CONTINUATION_MARKER)
    expect(executionLeaseRepository.readExecutionLease(fixture.directory)).toMatchObject({ owner_kind: "workflow", executor_agent: "loom" })
  })
})
