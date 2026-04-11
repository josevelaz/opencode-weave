import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createPluginAdapter } from "./plugin-adapter"
import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"

describe("plugin adapter runtime state", () => {
  const executionLeaseRepository = createExecutionLeaseFsStore()
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "weave-plugin-runtime-state-"))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("captures ad-hoc foreground agent from chat.params without creating ownership", async () => {
    const adapter = createPluginAdapter({
      pluginConfig: {},
      hooks: {
        analyticsEnabled: false,
        compactionTodoPreserverEnabled: false,
        todoContinuationEnforcerEnabled: false,
        continuation: { recovery: { compaction: true }, idle: { enabled: true, work: true, workflow: true, todo_prompt: false } },
      } as never,
      tools: {},
      configHandler: { handle: async () => ({ agents: {}, commands: {}, defaultAgent: undefined }) } as never,
      agents: {},
      directory,
    })

    await adapter.handleChatParams({ sessionID: "sess-ad-hoc", agent: "Loom (Main Orchestrator)" })
    const sessionRuntime = executionLeaseRepository.readSessionRuntime(directory, "sess-ad-hoc")

    expect(executionLeaseRepository.readExecutionLease(directory)).toBeNull()
    expect(sessionRuntime).not.toBeNull()
    expect(sessionRuntime).toEqual({
      session_id: "sess-ad-hoc",
      foreground_agent: "loom",
      mode: "ad_hoc",
      execution_ref: null,
      status: "running",
      updated_at: sessionRuntime!.updated_at,
    })
  })
})
