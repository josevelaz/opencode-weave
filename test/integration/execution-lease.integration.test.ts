import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createExecutionLeaseFsStore } from "../../src/infrastructure/fs/execution-lease-fs-store"
import { createPlanFsRepository } from "../../src/infrastructure/fs/plan-fs-repository"
import { createWorkflowFsRepository } from "../../src/infrastructure/fs/workflow-fs-repository"
import { PLANS_DIR } from "../../src/features/work-state/constants"
import { WORKFLOWS_DIR_PROJECT } from "../../src/features/workflow/constants"

describe("execution lease repository", () => {
  const planRepository = createPlanFsRepository()
  const workflowRepository = createWorkflowFsRepository()
  const executionLease = createExecutionLeaseFsStore()
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "weave-exec-lease-"))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("derives plan ownership when only an active plan exists", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "plan.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")

    planRepository.writeWorkState(directory, planRepository.createWorkState(planPath, "sess-plan", "tapestry", directory))

    expect(executionLease.getExecutionSnapshot(directory)).toEqual({
      owner: "plan",
      hasActivePlan: true,
      hasActiveWorkflow: false,
      activePlanPaused: false,
      activeWorkflowPaused: false,
    })
  })

  it("prefers running workflow ownership over active plan ownership", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "plan.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")
    planRepository.writeWorkState(directory, planRepository.createWorkState(planPath, "sess-plan", "tapestry", directory))

    const workflowDir = join(directory, WORKFLOWS_DIR_PROJECT)
    mkdirSync(workflowDir, { recursive: true })
    const definitionPath = join(workflowDir, "workflow.json")
    writeFileSync(definitionPath, JSON.stringify({
      name: "workflow",
      version: 1,
      steps: [{ id: "step-1", name: "Step 1", type: "autonomous", agent: "tapestry", prompt: "Go", completion: { method: "agent_signal" } }],
    }), "utf-8")

    const instance = workflowRepository.createWorkflowInstance({
      name: "workflow",
      version: 1,
      steps: [{ id: "step-1", name: "Step 1", type: "autonomous", agent: "tapestry", prompt: "Go", completion: { method: "agent_signal" } }],
    }, definitionPath, "goal", "sess-workflow")
    workflowRepository.writeWorkflowInstance(directory, instance)
    workflowRepository.setActiveInstance(directory, instance.instance_id)

    expect(executionLease.getExecutionSnapshot(directory).owner).toBe("workflow")
  })

  it("returns none when plan is paused and workflow is absent", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "plan.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")
    const state = planRepository.createWorkState(planPath, "sess-plan", "tapestry", directory)
    state.paused = true
    planRepository.writeWorkState(directory, state)

    expect(executionLease.getExecutionSnapshot(directory).owner).toBe("none")
  })
})
