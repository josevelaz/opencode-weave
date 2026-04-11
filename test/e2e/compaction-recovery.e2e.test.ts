import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"
import { FakeOpencodeHost } from "../testkit/host/fake-opencode-host"
import { createExecutionLeaseFsStore } from "../../src/infrastructure/fs/execution-lease-fs-store"
import {
  createExecutionLeaseState,
  createSessionRuntimeState,
} from "../../src/domain/session/execution-lease"
import { WORKFLOW_CONTINUATION_MARKER } from "../../src/features/workflow/hook"
import { CONTINUATION_MARKER } from "../../src/hooks/work-continuation"
import { WORKFLOWS_DIR_PROJECT } from "../../src/features/workflow/constants"

describe("compaction recovery ownership matrix", () => {
  const executionLeaseRepository = createExecutionLeaseFsStore()
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-e2e-compaction-recovery-")
    fixture.writeProjectConfig({
      continuation: {
        recovery: { compaction: true },
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

  it("restores Loom ad-hoc session after compaction when ownerKind is none", async () => {
    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-loom",
        foregroundAgent: "loom",
        mode: "ad_hoc",
        status: "idle",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.emitSessionCompacted("sess-loom")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("Loom (Main Orchestrator)")
    expect(host.client.promptAsyncCalls[0].body.parts).toEqual([])
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("Foreground agent restored: loom")
  })

  it("restores Tapestry plan execution after compaction when ownerKind is plan", async () => {
    const planPath = fixture.writePlan(
      "compaction-plan",
      [
        "# Plan",
        "",
        "## TODOs",
        "- [ ] 1. Resume work",
        "",
        "## Verification",
        "- [ ] done",
      ].join("\n"),
    )

    executionLeaseRepository.writeExecutionLease(
      fixture.directory,
      createExecutionLeaseState({
        ownerKind: "plan",
        ownerRef: planPath,
        status: "running",
        sessionId: "sess-plan",
        executorAgent: "tapestry",
      }),
    )
    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-plan",
        foregroundAgent: "tapestry",
        mode: "plan",
        executionRef: planPath,
        status: "running",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.sendStartWork({ sessionID: "sess-plan", planName: "compaction-plan" })
    host.client.clearEffects()
    await host.emitSessionCompacted("sess-plan")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("Tapestry (Execution Orchestrator)")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain(CONTINUATION_MARKER)
  })

  it("restores workflow step agent after compaction when ownerKind is workflow", async () => {
    const workflowDir = join(fixture.directory, WORKFLOWS_DIR_PROJECT)
    mkdirSync(workflowDir, { recursive: true })
    writeFileSync(
      join(workflowDir, "recovery.json"),
      JSON.stringify({
        name: "recovery",
        version: 1,
        steps: [
          { id: "review", name: "Review", type: "interactive", agent: "weft", prompt: "Review {{instance.goal}}", completion: { method: "user_confirm" } },
        ],
      }),
      "utf-8",
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.sendRunWorkflow({ sessionID: "sess-workflow", workflowArgs: 'recovery "Audit auth"' })
    host.client.clearEffects()
    await host.emitSessionCompacted("sess-workflow")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("weft")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain(WORKFLOW_CONTINUATION_MARKER)
  })

  it("clears stale plan ownership and avoids incorrect resume after compaction", async () => {
    const missingPlanPath = join(fixture.directory, ".weave", "plans", "missing.md")

    executionLeaseRepository.writeExecutionLease(
      fixture.directory,
      createExecutionLeaseState({
        ownerKind: "plan",
        ownerRef: missingPlanPath,
        status: "running",
        sessionId: "sess-stale-plan",
        executorAgent: "tapestry",
      }),
    )
    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-stale-plan",
        foregroundAgent: "loom",
        mode: "ad_hoc",
        status: "idle",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.emitSessionCompacted("sess-stale-plan")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("Loom (Main Orchestrator)")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("Foreground agent restored: loom")
    expect(executionLeaseRepository.readExecutionLease(fixture.directory)).toBeNull()
  })

  it("clears stale workflow ownership and avoids incorrect resume after compaction", async () => {
    executionLeaseRepository.writeExecutionLease(
      fixture.directory,
      createExecutionLeaseState({
        ownerKind: "workflow",
        ownerRef: "wf_missing/review",
        status: "running",
        sessionId: "sess-stale-workflow",
        executorAgent: "weft",
      }),
    )
    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-stale-workflow",
        foregroundAgent: "warp",
        mode: "ad_hoc",
        status: "idle",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.emitSessionCompacted("sess-stale-workflow")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("warp")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("Foreground agent restored: warp")
    expect(executionLeaseRepository.readExecutionLease(fixture.directory)).toBeNull()
  })

  it("does not let a historical plan session reclaim recovery after lease loss", async () => {
    const planPath = fixture.writePlan(
      "history-plan",
      ["# Plan", "", "## TODOs", "- [ ] 1. Resume work", "", "## Verification", "- [ ] done"].join("\n"),
    )

    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-old",
        foregroundAgent: "loom",
        mode: "ad_hoc",
        status: "idle",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.sendStartWork({ sessionID: "sess-old", planName: "history-plan" })
    await host.sendStartWork({ sessionID: "sess-new" })
    executionLeaseRepository.clearExecutionLease(fixture.directory)
    host.client.clearEffects()

    await host.emitSessionCompacted("sess-old")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("No running plan or workflow owns this session")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).not.toContain(CONTINUATION_MARKER)
    expect(executionLeaseRepository.readExecutionLease(fixture.directory)).toBeNull()
    expect(executionLeaseRepository.readSessionRuntime(fixture.directory, "sess-old")).toMatchObject({
      foreground_agent: "tapestry",
      mode: "plan",
    })
  })

  it("does not let a foreign compacted session clear another session's plan lease", async () => {
    const planPath = fixture.writePlan(
      "foreign-plan",
      ["# Plan", "", "## TODOs", "- [ ] 1. Resume work", "", "## Verification", "- [ ] done"].join("\n"),
    )

    executionLeaseRepository.writeExecutionLease(
      fixture.directory,
      createExecutionLeaseState({
        ownerKind: "plan",
        ownerRef: planPath,
        status: "running",
        sessionId: "sess-owner",
        executorAgent: "tapestry",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.emitSessionCompacted("sess-foreign")

    expect(executionLeaseRepository.readExecutionLease(fixture.directory)).toMatchObject({
      owner_kind: "plan",
      session_id: "sess-owner",
      owner_ref: planPath,
    })
  })

  it("clears stale foreground agent when persisted agent is disabled", async () => {
    fixture.writeProjectConfig({
      continuation: {
        recovery: { compaction: true },
        idle: { enabled: true, work: true, workflow: true },
      },
      disabled_agents: ["warp"],
    })

    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-disabled-agent",
        foregroundAgent: "warp",
        mode: "ad_hoc",
        status: "idle",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.emitSessionCompacted("sess-disabled-agent")

    expect(host.client.promptAsyncCalls).toHaveLength(0)
    expect(executionLeaseRepository.readSessionRuntime(fixture.directory, "sess-disabled-agent")?.foreground_agent).toBeNull()
  })

  it("does not auto-resume paused plan after compaction", async () => {
    const planPath = fixture.writePlan(
      "paused-plan",
      ["# Plan", "", "## TODOs", "- [ ] 1. Resume work", "", "## Verification", "- [ ] done"].join("\n"),
    )

    executionLeaseRepository.writeExecutionLease(
      fixture.directory,
      createExecutionLeaseState({
        ownerKind: "plan",
        ownerRef: planPath,
        status: "paused",
        sessionId: "sess-paused-plan",
        executorAgent: "tapestry",
      }),
    )
    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-paused-plan",
        foregroundAgent: "tapestry",
        mode: "plan",
        executionRef: planPath,
        status: "paused",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.sendStartWork({ sessionID: "sess-paused-plan", planName: "paused-plan" })
    await host.emitCommandExecute("session.interrupt", "sess-paused-plan")
    host.client.clearEffects()
    await host.emitSessionCompacted("sess-paused-plan")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("Tapestry (Execution Orchestrator)")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("Foreground agent restored: tapestry")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).not.toContain(CONTINUATION_MARKER)
  })

  it("does not auto-resume paused workflow after compaction", async () => {
    const workflowDir = join(fixture.directory, WORKFLOWS_DIR_PROJECT)
    mkdirSync(workflowDir, { recursive: true })
    writeFileSync(
      join(workflowDir, "paused-workflow.json"),
      JSON.stringify({
        name: "paused-workflow",
        version: 1,
        steps: [
          { id: "review", name: "Review", type: "interactive", agent: "weft", prompt: "Review {{instance.goal}}", completion: { method: "user_confirm" } },
        ],
      }),
      "utf-8",
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.sendRunWorkflow({ sessionID: "sess-paused-workflow", workflowArgs: 'paused-workflow "Audit auth"' })
    await host.emitCommandExecute("session.interrupt", "sess-paused-workflow")
    host.client.clearEffects()
    await host.emitSessionCompacted("sess-paused-workflow")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("weft")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("Foreground agent restored: weft")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("No running plan or workflow owns this session")
  })

  it("restores specialist ad-hoc agent after compaction when ownerKind is none", async () => {
    executionLeaseRepository.writeSessionRuntime(
      fixture.directory,
      createSessionRuntimeState({
        sessionId: "sess-specialist",
        foregroundAgent: "weft",
        mode: "ad_hoc",
        status: "idle",
      }),
    )

    const host = await FakeOpencodeHost.boot({ directory: fixture.directory })
    await host.emitSessionCompacted("sess-specialist")

    expect(host.client.promptAsyncCalls).toHaveLength(2)
    expect(host.client.promptAsyncCalls[0].body.agent).toBe("weft")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("Foreground agent restored: weft")
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).not.toContain(CONTINUATION_MARKER)
    expect(host.client.promptAsyncCalls[1].body.parts[0].text).toContain("No running plan or workflow owns this session")
  })
})
