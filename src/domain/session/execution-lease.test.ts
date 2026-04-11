import { describe, expect, it } from "bun:test"
import {
  ExecutionStateTransitions,
  createExecutionLeaseState,
  createSessionRuntimeState,
  getExecutionStateTransition,
  isExecutionOwnerActive,
  isExecutionOwnerPaused,
  projectExecutionTransition,
} from "./execution-lease"

describe("execution lease state machine", () => {
  it("defines explicit transitions for all ownership lifecycle events", () => {
    expect(ExecutionStateTransitions.map((transition) => transition.event)).toEqual([
      "observe_ad_hoc_agent",
      "start_plan",
      "resume_plan",
      "start_workflow",
      "resume_workflow",
      "advance_workflow_step",
      "pause_owner",
      "complete_owner",
      "clear_owner",
      "delete_session",
    ])
    expect(getExecutionStateTransition("start_workflow").ownerKind).toBe("workflow")
    expect(getExecutionStateTransition("complete_owner").leaseAction).toBe("clear")
  })

  it("projects ad-hoc foreground observation without claiming execution ownership", () => {
    const projection = projectExecutionTransition({
      event: "observe_ad_hoc_agent",
      sessionId: "sess-loom",
      foregroundAgent: "loom",
    })

    expect(projection.lease).toBeNull()
    expect(projection.sessionRuntime).not.toBeNull()
    expect(projection.sessionRuntime).toEqual({
      session_id: "sess-loom",
      foreground_agent: "loom",
      mode: "ad_hoc",
      execution_ref: null,
      status: "running",
      updated_at: projection.sessionRuntime!.updated_at,
    })
  })

  it("projects workflow precedence over plan ownership with step agent identity", () => {
    const currentLease = createExecutionLeaseState({
      ownerKind: "plan",
      ownerRef: ".weave/plans/my-plan.md",
      status: "running",
      sessionId: "sess-plan",
      executorAgent: "tapestry",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })

    const projection = projectExecutionTransition({
      event: "start_workflow",
      sessionId: "sess-wf",
      ownerRef: "wf_123/review",
      executionRef: "wf_123/review",
      executorAgent: "weft",
      currentLease,
      currentSessionRuntime: createSessionRuntimeState({
        sessionId: "sess-wf",
        foregroundAgent: "loom",
        mode: "ad_hoc",
        status: "idle",
        updatedAt: "2026-01-01T00:00:01.000Z",
      }),
      at: "2026-01-01T00:00:02.000Z",
    })

    expect(projection.lease).toEqual({
      owner_kind: "workflow",
      owner_ref: "wf_123/review",
      status: "running",
      session_id: "sess-wf",
      executor_agent: "weft",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:02.000Z",
    })
    expect(projection.sessionRuntime).toEqual({
      session_id: "sess-wf",
      foreground_agent: "weft",
      mode: "workflow",
      execution_ref: "wf_123/review",
      status: "running",
      updated_at: "2026-01-01T00:00:02.000Z",
    })
  })

  it("preserves foreground identity while pausing and clears owner on completion", () => {
    const currentLease = createExecutionLeaseState({
      ownerKind: "plan",
      ownerRef: ".weave/plans/my-plan.md",
      status: "running",
      sessionId: "sess-plan",
      executorAgent: "tapestry",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    })
    const currentSessionRuntime = createSessionRuntimeState({
      sessionId: "sess-plan",
      foregroundAgent: "tapestry",
      mode: "plan",
      executionRef: ".weave/plans/my-plan.md",
      status: "running",
      updatedAt: "2026-01-01T00:00:01.000Z",
    })

    const paused = projectExecutionTransition({
      event: "pause_owner",
      sessionId: "sess-plan",
      currentLease,
      currentSessionRuntime,
      at: "2026-01-01T00:00:02.000Z",
    })
    expect(paused.lease?.status).toBe("paused")
    expect(paused.sessionRuntime?.status).toBe("paused")
    expect(paused.sessionRuntime?.foreground_agent).toBe("tapestry")

    const completed = projectExecutionTransition({
      event: "complete_owner",
      sessionId: "sess-plan",
      currentLease: paused.lease,
      currentSessionRuntime: paused.sessionRuntime,
      at: "2026-01-01T00:00:03.000Z",
    })
    expect(completed.lease).toBeNull()
    expect(completed.sessionRuntime).toEqual({
      session_id: "sess-plan",
      foreground_agent: "tapestry",
      mode: "ad_hoc",
      execution_ref: ".weave/plans/my-plan.md",
      status: "idle",
      updated_at: "2026-01-01T00:00:03.000Z",
    })
  })

  it("clears owned lease on session deletion and leaves foreign lease intact", () => {
    const ownedLease = createExecutionLeaseState({
      ownerKind: "workflow",
      ownerRef: "wf_1/build",
      status: "running",
      sessionId: "sess-owned",
      executorAgent: "warp",
    })

    const ownedProjection = projectExecutionTransition({
      event: "delete_session",
      sessionId: "sess-owned",
      currentLease: ownedLease,
      currentSessionRuntime: createSessionRuntimeState({
        sessionId: "sess-owned",
        foregroundAgent: "warp",
        mode: "workflow",
        executionRef: "wf_1/build",
        status: "running",
      }),
    })

    expect(ownedProjection.lease).toBeNull()
    expect(ownedProjection.sessionRuntime).toBeNull()

    const foreignLease = createExecutionLeaseState({
      ownerKind: "workflow",
      ownerRef: "wf_2/build",
      status: "running",
      sessionId: "sess-other",
      executorAgent: "warp",
    })

    const foreignProjection = projectExecutionTransition({
      event: "delete_session",
      sessionId: "sess-owned",
      currentLease: foreignLease,
      currentSessionRuntime: createSessionRuntimeState({
        sessionId: "sess-owned",
        foregroundAgent: "loom",
        mode: "ad_hoc",
        status: "idle",
      }),
    })

    expect(foreignProjection.lease).toEqual(foreignLease)
    expect(foreignProjection.sessionRuntime).toBeNull()
  })

  it("classifies active and paused ownership from snapshots", () => {
    const activePlan = {
      owner: "plan",
      ownerRef: ".weave/plans/p.md",
      status: "running",
      sessionId: "sess-plan",
      executorAgent: "tapestry",
      hasActivePlan: true,
      hasActiveWorkflow: false,
      activePlanPaused: false,
      activeWorkflowPaused: false,
    } as const

    expect(isExecutionOwnerActive(activePlan, "plan")).toBe(true)
    expect(isExecutionOwnerPaused(activePlan, "plan")).toBe(false)
    expect(isExecutionOwnerPaused({ ...activePlan, status: "paused" }, "plan")).toBe(true)
  })
})
