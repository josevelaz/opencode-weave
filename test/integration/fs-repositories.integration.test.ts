import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createPlanFsRepository } from "../../src/infrastructure/fs/plan-fs-repository"
import { createWorkflowFsRepository } from "../../src/infrastructure/fs/workflow-fs-repository"
import { createAnalyticsFsStore } from "../../src/infrastructure/fs/analytics-fs-store"
import { createConfigFsLoader } from "../../src/infrastructure/fs/config-fs-loader"
import { PLANS_DIR } from "../../src/features/work-state/constants"
import { WORKFLOWS_DIR_PROJECT } from "../../src/features/workflow/constants"

describe("fs repositories integration", () => {
  const planRepository = createPlanFsRepository()
  const workflowRepository = createWorkflowFsRepository()
  const analyticsStore = createAnalyticsFsStore()
  const configLoader = createConfigFsLoader()
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "weave-fs-repos-"))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("persists and reads work-state plan records through the plan repository", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "alpha.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task 1\n- [x] Task 2\n", "utf-8")

    const state = planRepository.createWorkState(planPath, "sess-1", "tapestry", directory)
    expect(planRepository.writeWorkState(directory, state)).toBe(true)
    expect(planRepository.readWorkState(directory)?.plan_name).toBe("alpha")
    expect(planRepository.getPlanProgress(planPath)).toEqual({ total: 2, completed: 1, isComplete: false })
  })

  it("persists active workflow instances through the workflow repository", () => {
    const workflowDir = join(directory, WORKFLOWS_DIR_PROJECT)
    mkdirSync(workflowDir, { recursive: true })
    const definitionPath = join(workflowDir, "wf.json")
    const definition = {
      name: "wf",
      version: 1,
      steps: [{ id: "s1", name: "Step 1", type: "autonomous", agent: "tapestry", prompt: "Go", completion: { method: "agent_signal" } }],
    } as const
    writeFileSync(definitionPath, JSON.stringify(definition), "utf-8")

    const instance = workflowRepository.createWorkflowInstance(definition, definitionPath, "goal", "sess-wf")
    expect(workflowRepository.writeWorkflowInstance(directory, instance)).toBe(true)
    expect(workflowRepository.setActiveInstance(directory, instance.instance_id)).toBe(true)
    expect(workflowRepository.getActiveWorkflowInstance(directory)?.goal).toBe("goal")
  })

  it("stores analytics records through the analytics fs store", () => {
    analyticsStore.appendSessionSummary(directory, {
      sessionId: "sess-analytics",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
      durationMs: 60_000,
      toolUsage: [],
      delegations: [],
      totalToolCalls: 0,
      totalDelegations: 0,
    })

    expect(analyticsStore.readSessionSummaries(directory)).toHaveLength(1)
  })

  it("loads project config through the config fs loader", () => {
    mkdirSync(join(directory, ".opencode"), { recursive: true })
    writeFileSync(join(directory, ".opencode", "weave-opencode.json"), JSON.stringify({ analytics: { enabled: true } }), "utf-8")

    const config = configLoader.loadWeaveConfig(directory)
    expect(config.analytics?.enabled).toBe(true)
  })
})
