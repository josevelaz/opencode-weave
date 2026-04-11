import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  createExecutionLeaseState,
  createSessionRuntimeState,
} from "../../src/domain/session/execution-lease"
import { createExecutionLeaseFsStore } from "../../src/infrastructure/fs/execution-lease-fs-store"
import { createPlanFsRepository } from "../../src/infrastructure/fs/plan-fs-repository"
import { createWorkflowFsRepository } from "../../src/infrastructure/fs/workflow-fs-repository"
import { ACTIVE_EXECUTION_PATH, PLANS_DIR, SESSION_RUNTIME_DIR } from "../../src/features/work-state/constants"
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
      ownerRef: planPath,
      status: "running",
      sessionId: "sess-plan",
      executorAgent: "tapestry",
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

  it("persists repo-scoped execution leases under the runtime directory", () => {
    const lease = createExecutionLeaseState({
      ownerKind: "plan",
      ownerRef: ".weave/plans/alpha.md",
      status: "running",
      sessionId: "sess-runtime-plan",
      executorAgent: "tapestry",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    })

    expect(executionLease.writeExecutionLease(directory, lease)).toBe(true)
    expect(existsSync(join(directory, ACTIVE_EXECUTION_PATH))).toBe(true)
    expect(executionLease.readExecutionLease(directory)).toEqual(lease)
    expect(executionLease.getExecutionSnapshot(directory)).toEqual({
      owner: "plan",
      ownerRef: ".weave/plans/alpha.md",
      status: "running",
      sessionId: "sess-runtime-plan",
      executorAgent: "tapestry",
      hasActivePlan: false,
      hasActiveWorkflow: false,
      activePlanPaused: false,
      activeWorkflowPaused: false,
    })
  })

  it("persists workflow-owned runtime state with current-step agent identity", () => {
    const lease = createExecutionLeaseState({
      ownerKind: "workflow",
      ownerRef: "wf_deadbeef/build",
      status: "running",
      sessionId: "sess-runtime-workflow",
      executorAgent: "warp",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
    })
    const sessionRuntime = createSessionRuntimeState({
      sessionId: "sess-runtime-workflow",
      foregroundAgent: "warp",
      mode: "workflow",
      executionRef: "wf_deadbeef/build",
      status: "running",
      updatedAt: "2026-01-01T00:00:02.000Z",
    })

    expect(executionLease.writeExecutionLease(directory, lease)).toBe(true)
    expect(executionLease.writeSessionRuntime(directory, sessionRuntime)).toBe(true)
    expect(existsSync(join(directory, SESSION_RUNTIME_DIR, `${Buffer.from("sess-runtime-workflow", "utf-8").toString("base64url")}.json`))).toBe(true)
    expect(executionLease.readSessionRuntime(directory, "sess-runtime-workflow")).toEqual(sessionRuntime)
    expect(executionLease.getExecutionSnapshot(directory).owner).toBe("workflow")
    expect(executionLease.getExecutionSnapshot(directory).executorAgent).toBe("warp")
  })

  it("persists ad-hoc session runtime without inventing execution ownership", () => {
    const sessionRuntime = createSessionRuntimeState({
      sessionId: "sess-runtime-ad-hoc",
      foregroundAgent: "loom",
      mode: "ad_hoc",
      status: "idle",
      updatedAt: "2026-01-01T00:00:03.000Z",
    })

    expect(executionLease.writeSessionRuntime(directory, sessionRuntime)).toBe(true)
    expect(executionLease.readSessionRuntime(directory, "sess-runtime-ad-hoc")).toEqual(sessionRuntime)
    expect(executionLease.getExecutionSnapshot(directory).owner).toBe("none")
    expect(executionLease.getExecutionSnapshot(directory).executorAgent).toBeNull()
  })

  it("uses collision-safe filenames for distinct session ids", () => {
    const first = createSessionRuntimeState({
      sessionId: "sess/a",
      foregroundAgent: "loom",
      mode: "ad_hoc",
      status: "idle",
    })
    const second = createSessionRuntimeState({
      sessionId: "sess_a",
      foregroundAgent: "warp",
      mode: "ad_hoc",
      status: "idle",
    })

    expect(executionLease.writeSessionRuntime(directory, first)).toBe(true)
    expect(executionLease.writeSessionRuntime(directory, second)).toBe(true)
    expect(executionLease.readSessionRuntime(directory, "sess/a")?.foreground_agent).toBe("loom")
    expect(executionLease.readSessionRuntime(directory, "sess_a")?.foreground_agent).toBe("warp")
  })

  it("rejects persisted session runtime files whose embedded session_id mismatches the requested session", () => {
    const requestedSessionId = "sess-safe"
    const encoded = Buffer.from(requestedSessionId, "utf-8").toString("base64url")
    mkdirSync(join(directory, SESSION_RUNTIME_DIR), { recursive: true })
    writeFileSync(
      join(directory, SESSION_RUNTIME_DIR, `${encoded}.json`),
      JSON.stringify({
        session_id: "sess-other",
        foreground_agent: "warp",
        mode: "ad_hoc",
        execution_ref: null,
        status: "idle",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      "utf-8",
    )

    expect(executionLease.readSessionRuntime(directory, requestedSessionId)).toBeNull()
  })

  it("derives legacy plan lease and session runtime from state.json when runtime files are missing", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "legacy-plan.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")

    const state = planRepository.createWorkState(planPath, "sess-legacy-plan", "tapestry", directory)
    planRepository.writeWorkState(directory, state)

    expect(executionLease.readExecutionLease(directory)).toBeNull()
    expect(executionLease.getExecutionSnapshot(directory)).toEqual({
      owner: "plan",
      ownerRef: planPath,
      status: "running",
      sessionId: "sess-legacy-plan",
      executorAgent: "tapestry",
      hasActivePlan: true,
      hasActiveWorkflow: false,
      activePlanPaused: false,
      activeWorkflowPaused: false,
    })
    expect(executionLease.readSessionRuntime(directory, "sess-legacy-plan")).toEqual({
      session_id: "sess-legacy-plan",
      foreground_agent: "tapestry",
      mode: "plan",
      execution_ref: planPath,
      status: "running",
      updated_at: state.started_at,
    })
  })

  it("does not derive legacy plan ownership from completed work-state", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "completed-legacy-plan.md")
    writeFileSync(planPath, "# Plan\n- [x] Task\n", "utf-8")

    const state = planRepository.createWorkState(planPath, "sess-complete", "tapestry", directory)
    planRepository.writeWorkState(directory, state)

    expect(executionLease.readExecutionLease(directory)).toBeNull()
    expect(executionLease.getExecutionSnapshot(directory)).toEqual({
      owner: "none",
      ownerRef: null,
      status: "completed",
      sessionId: null,
      executorAgent: null,
      hasActivePlan: false,
      hasActiveWorkflow: false,
      activePlanPaused: false,
      activeWorkflowPaused: false,
    })
    expect(executionLease.readSessionRuntime(directory, "sess-complete")).toBeNull()
  })

  it("derives legacy workflow lease and session runtime from active workflow files when runtime files are missing", () => {
    const workflowDir = join(directory, WORKFLOWS_DIR_PROJECT)
    mkdirSync(workflowDir, { recursive: true })
    const definitionPath = join(workflowDir, "workflow.json")
    writeFileSync(definitionPath, JSON.stringify({
      name: "workflow",
      version: 1,
      steps: [{ id: "step-1", name: "Step 1", type: "autonomous", agent: "warp", prompt: "Go", completion: { method: "agent_signal" } }],
    }), "utf-8")

    const instance = workflowRepository.createWorkflowInstance({
      name: "workflow",
      version: 1,
      steps: [{ id: "step-1", name: "Step 1", type: "autonomous", agent: "warp", prompt: "Go", completion: { method: "agent_signal" } }],
    }, definitionPath, "goal", "sess-legacy-workflow")
    workflowRepository.writeWorkflowInstance(directory, instance)
    workflowRepository.setActiveInstance(directory, instance.instance_id)

    expect(executionLease.readExecutionLease(directory)).toBeNull()
    expect(executionLease.getExecutionSnapshot(directory)).toEqual({
      owner: "workflow",
      ownerRef: `${instance.instance_id}/${instance.current_step_id}`,
      status: "running",
      sessionId: "sess-legacy-workflow",
      executorAgent: "warp",
      hasActivePlan: false,
      hasActiveWorkflow: true,
      activePlanPaused: false,
      activeWorkflowPaused: false,
    })
    expect(executionLease.readSessionRuntime(directory, "sess-legacy-workflow")).toEqual({
      session_id: "sess-legacy-workflow",
      foreground_agent: "warp",
      mode: "workflow",
      execution_ref: `${instance.instance_id}/${instance.current_step_id}`,
      status: "running",
      updated_at: instance.started_at,
    })
  })
})
