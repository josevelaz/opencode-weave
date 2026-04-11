import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createPlanServiceWithExecutionLease } from "./plan-service"
import { createPlanFsRepository } from "../../infrastructure/fs/plan-fs-repository"
import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"
import { PLANS_DIR } from "../../features/work-state/constants"

describe("plan service ownership transitions", () => {
  const planRepository = createPlanFsRepository()
  const executionLeaseRepository = createExecutionLeaseFsStore()
  const planService = createPlanServiceWithExecutionLease(planRepository, executionLeaseRepository)
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "weave-plan-service-"))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("writes plan ownership and session runtime on createExecution", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "alpha.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")

    const state = planService.createExecution(directory, planPath, "sess-plan", "tapestry")
    const lease = executionLeaseRepository.readExecutionLease(directory)
    const sessionRuntime = executionLeaseRepository.readSessionRuntime(directory, "sess-plan")

    expect(state.plan_name).toBe("alpha")
    expect(lease).not.toBeNull()
    expect(sessionRuntime).not.toBeNull()
    expect(lease).toEqual({
      owner_kind: "plan",
      owner_ref: planPath,
      status: "running",
      session_id: "sess-plan",
      executor_agent: "tapestry",
      started_at: lease!.started_at,
      updated_at: lease!.updated_at,
    })
    expect(sessionRuntime).toEqual({
      session_id: "sess-plan",
      foreground_agent: "tapestry",
      mode: "plan",
      execution_ref: planPath,
      status: "running",
      updated_at: sessionRuntime!.updated_at,
    })
  })

  it("rebinds plan ownership to the resuming session", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "beta.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")

    planService.createExecution(directory, planPath, "sess-plan-1", "tapestry")
    const resumed = planService.resumeExecution(directory, "sess-plan-2")

    expect(resumed?.session_ids).toEqual(["sess-plan-1", "sess-plan-2"])
    expect(executionLeaseRepository.readExecutionLease(directory)?.session_id).toBe("sess-plan-2")
    expect(executionLeaseRepository.readSessionRuntime(directory, "sess-plan-2")?.mode).toBe("plan")
    expect(executionLeaseRepository.readSessionRuntime(directory, "sess-plan-2")?.foreground_agent).toBe("tapestry")
  })
})
