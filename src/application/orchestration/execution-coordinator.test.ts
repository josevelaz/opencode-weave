import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  getExecutionSnapshot,
  shouldAutoPauseForUserMessage,
  shouldCheckWorkContinuation,
  shouldCheckWorkflowContinuation,
  shouldFinalizeTodos,
  shouldHandleWorkflowCommand,
} from "./execution-coordinator"
import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"
import { createPlanFsRepository } from "../../infrastructure/fs/plan-fs-repository"
import { createExecutionLeaseState } from "../../domain/session/execution-lease"
import { PLANS_DIR } from "../../features/work-state/constants"

describe("execution coordinator", () => {
  const planRepository = createPlanFsRepository()
  const executionLeaseRepository = createExecutionLeaseFsStore()
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "weave-exec-coordinator-"))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("treats running plan ownership as the only auto-pause trigger", () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "plan.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")
    planRepository.writeWorkState(directory, planRepository.createWorkState(planPath, "sess-plan", "tapestry", directory))

    executionLeaseRepository.writeExecutionLease(
      directory,
      createExecutionLeaseState({
        ownerKind: "plan",
        ownerRef: planPath,
        status: "running",
        sessionId: "sess-plan",
        executorAgent: "tapestry",
      }),
    )

    expect(shouldAutoPauseForUserMessage({ directory, sessionId: "sess-plan", isBuiltinCommand: false, isContinuation: false })).toBe(true)
    expect(shouldAutoPauseForUserMessage({ directory, sessionId: "sess-other", isBuiltinCommand: false, isContinuation: false })).toBe(false)

    executionLeaseRepository.writeExecutionLease(
      directory,
      createExecutionLeaseState({
        ownerKind: "plan",
        ownerRef: planPath,
        status: "paused",
        sessionId: "sess-plan",
        executorAgent: "tapestry",
      }),
    )

    expect(shouldAutoPauseForUserMessage({ directory, sessionId: "sess-plan", isBuiltinCommand: false, isContinuation: false })).toBe(false)
  })

  it("uses owned running or paused workflow ownership for workflow commands and continuation", () => {
    executionLeaseRepository.writeExecutionLease(
      directory,
      createExecutionLeaseState({
        ownerKind: "workflow",
        ownerRef: "wf_123/build",
        status: "running",
        sessionId: "sess-wf",
        executorAgent: "warp",
      }),
    )

    expect(shouldHandleWorkflowCommand(directory, "sess-wf")).toBe(true)
    expect(shouldHandleWorkflowCommand(directory, "sess-other")).toBe(false)
    expect(
      shouldCheckWorkflowContinuation(
        {
          workflowContinuation: () => ({ continuationPrompt: null, switchAgent: null }),
          continuation: { idle: { workflow: true } },
        } as never,
        directory,
      ),
    ).toBe(true)

    executionLeaseRepository.writeExecutionLease(
      directory,
      createExecutionLeaseState({
        ownerKind: "workflow",
        ownerRef: "wf_123/build",
        status: "paused",
        sessionId: "sess-wf",
        executorAgent: "warp",
      }),
    )

    expect(shouldHandleWorkflowCommand(directory, "sess-wf")).toBe(true)
    expect(shouldHandleWorkflowCommand(directory, "sess-other")).toBe(false)

    expect(
      shouldCheckWorkflowContinuation(
        {
          workflowContinuation: () => ({ continuationPrompt: null, switchAgent: null }),
          continuation: { idle: { workflow: true } },
        } as never,
        directory,
      ),
    ).toBe(false)
    expect(
      shouldCheckWorkContinuation(
        {
          workContinuation: () => null,
          continuation: { idle: { work: true } },
        } as never,
        directory,
      ),
    ).toBe(false)
  })

  it("allows todo finalization only when no owner is active or paused", () => {
    expect(
      shouldFinalizeTodos(
        { todoContinuationEnforcerEnabled: true } as never,
        directory,
        false,
      ),
    ).toBe(true)

    executionLeaseRepository.writeExecutionLease(
      directory,
      createExecutionLeaseState({
        ownerKind: "workflow",
        ownerRef: "wf_123/review",
        status: "paused",
        sessionId: "sess-wf",
        executorAgent: "weft",
      }),
    )

    expect(
      shouldFinalizeTodos(
        { todoContinuationEnforcerEnabled: true } as never,
        directory,
        false,
      ),
    ).toBe(false)
  })

  it("exposes lease-backed snapshot details", () => {
    executionLeaseRepository.writeExecutionLease(
      directory,
      createExecutionLeaseState({
        ownerKind: "workflow",
        ownerRef: "wf_123/build",
        status: "running",
        sessionId: "sess-wf",
        executorAgent: "warp",
      }),
    )

    expect(getExecutionSnapshot(directory)).toEqual({
      owner: "workflow",
      ownerRef: "wf_123/build",
      status: "running",
      sessionId: "sess-wf",
      executorAgent: "warp",
      hasActivePlan: false,
      hasActiveWorkflow: false,
      activePlanPaused: false,
      activeWorkflowPaused: false,
    })
  })
})
