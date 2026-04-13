# Compaction Agent Restoration Architecture

## TL;DR
> **Summary**: Separate repo-level execution ownership from session-level foreground agent identity. Persist both under `.weave/runtime/`, make compaction recovery reconcile that state before deciding whether to resume a plan/workflow or merely restore the last active agent, and treat Loom ad-hoc work as a first-class mode rather than a plan/workflow fallback.
> **Estimated Effort**: Medium

## Context
### Original Request
Design the proper long-term architecture for restoring the correct agent after compaction. Today `/start-work` switches to Tapestry and plan state persists `agent='tapestry'`, but idle continuation and compaction recovery do not reliably restore executor identity. Loom may legitimately be the active working agent outside plan/workflow execution, so blindly restoring Tapestry is wrong.

### Key Findings
- Current compaction recovery (`src/hooks/compaction-recovery.ts`) only checks workflow state, then plan state, and always returns `switchAgent: null`; it restores prompt text but not executor identity.
- `/start-work` (`src/hooks/start-work-hook.ts`) hard-codes Tapestry in both the returned switch and persisted plan state, which is fine for plan execution but not a general compaction source of truth.
- Execution coordination (`src/application/orchestration/execution-coordinator.ts`, `src/domain/session/execution-lease.ts`) currently models only `plan | workflow | none`, derived from existing files, with no persisted session-level agent identity and no ad-hoc Loom mode.
- Workflow state persists step metadata and `session_ids`, but compaction recovery does not use the active step's agent to retarget the resumed session.
- The runtime already sees agent identity in `src/runtime/opencode/plugin-adapter.ts` via `handleChatParams`, which is the right seam for persisting foreground session identity.
- Existing plans already point in this direction: `.weave/plans/remaining-target-architecture-phased-implementation.md` calls for persisted execution ownership in `.weave/runtime/active-execution.json` and centralized compaction policy; `.weave/plans/remove-agent-switch-hacks.md` removed old heuristic agent switching, so recovery now needs an explicit state model.

### Execution Ownership Matrix

These cases are the canonical mental model and must be preserved in both implementation and end-to-end tests:

| Scenario | foregroundAgent | ownerKind / executionType | ownerRef | Expected post-compaction behavior |
|---|---|---|---|---|
| Loom doing ad-hoc work | `loom` | `none` | `null` | Restore Loom as the foreground agent only; do not invent plan/workflow continuation |
| Tapestry running a plan | `tapestry` | `plan` | `<plan path>` | Restore Tapestry and inject the plan continuation prompt |
| Workflow step active | `<current step agent>` | `workflow` | `<workflow instance or step ref>` | Restore the current workflow step agent and inject workflow continuation |

This matrix is both the behavioral contract and the primary consumer-facing explanation of how Weave thinks about executing agents.

## Objectives
### Core Objective
Make compaction recovery restore the correct active agent and continuation behavior by using explicit persisted runtime state for both execution ownership and per-session foreground identity.

### Deliverables
- [x] A concrete persisted runtime/session state model that distinguishes plan execution, workflow execution, and ad-hoc agent-led work.
- [x] A single ownership/state-machine design used by `/start-work`, workflows, idle continuation, and compaction recovery.
- [x] A reconciliation-first compaction resume algorithm that restores Tapestry only for active plan execution, restores workflow step agents for active workflows, and restores Loom or other agents for ad-hoc sessions.
- [x] A compatibility-safe migration and rollout plan that keeps existing `.weave/state.json` and workflow state readable during transition.

### Definition of Done
- [x] The runtime has one authoritative design for `owner` vs `foregroundAgent`, documented and implemented through `.weave/runtime/` state.
- [x] `session.compacted` recovery can be explained by one deterministic algorithm rather than plan/workflow-specific heuristics.
- [x] The execution-ownership matrix (Loom ad-hoc, Tapestry plan, workflow step agent) is documented in this plan and reflected 1:1 in end-to-end coverage.
- [x] `bun test test/e2e/start-work-runtime.e2e.test.ts test/e2e/execution-ownership.e2e.test.ts test/e2e/workflow-precedence.e2e.test.ts` covers the updated ownership behavior.
- [x] New compaction-specific regression coverage exists for plan, workflow, Loom ad-hoc, paused, and stale-state scenarios.

### Guardrails (Must NOT)
- [x] Must NOT blindly restore Tapestry when no active plan execution owns the session.
- [x] Must NOT treat analytics/session-tracker data as the source of truth for recovery.
- [x] Must NOT auto-resume paused or completed plans/workflows after compaction.
- [x] Must NOT make workflow state or plan state alone responsible for ad-hoc Loom-led sessions.
- [x] Must NOT introduce a second compaction decision path outside the PolicyEngine/session-policy flow.

## TODOs

- [x] 1. Define the persisted runtime/session state model
  **What**: Use a two-layer model under `.weave/runtime/`: (a) repo-scoped `active-execution.json` as the authoritative execution lease for automation ownership, and (b) session-scoped records such as `.weave/runtime/sessions/{sessionId}.json` for foreground agent identity. The lease should hold `ownerKind: none|plan|workflow`, `ownerRef`, `status: running|paused|completed`, `sessionId`, `executorAgent`, and timestamps. The session record should hold `foregroundAgent`, `mode: ad_hoc|plan|workflow`, `executionRef`, `status: running|paused|awaiting_user|idle`, and `updatedAt`. Per-session files are preferred over one shared map to reduce write-clobber risk.
  **Files**: `src/domain/session/execution-lease.ts`, `src/infrastructure/fs/execution-lease-fs-store.ts`, `src/infrastructure/fs/work-state-fs-store.ts`, `src/infrastructure/fs/workflow-fs-repository.ts`, `src/features/work-state/types.ts`, `.weave/runtime/active-execution.json`, `.weave/runtime/sessions/`
  **Acceptance**: The schema can represent all three modes: active plan/Tapestry, active workflow/current-step-agent, and ad-hoc Loom-or-other-agent with no execution owner.

- [x] 2. Formalize the ownership model and state machine
  **What**: Make `owner` and `foregroundAgent` separate concepts. `owner` answers who may drive automated continuation in this repo (`none`, `plan`, `workflow`). `foregroundAgent` answers who the session currently is, even with no owner. Valid transitions: chat/session bootstrap updates ad-hoc foreground agent; `/start-work` enters `plan/running` with `foregroundAgent=tapestry`; workflow start/resume/step-advance enters `workflow/running` with `foregroundAgent=currentStep.agent`; interrupt/pause moves owner status to `paused` without clearing foreground agent; completion clears owner but does not invent a new foreground agent. Workflow precedence remains explicit: a running workflow lease overrides a running plan lease.
  **Files**: `src/domain/session/execution-lease.ts`, `src/application/orchestration/execution-coordinator.ts`, `src/domain/plans/plan-execution.ts`, `src/domain/workflows/workflow-service.ts`, `src/features/workflow/hook.ts`
  **Acceptance**: The runtime has one state table that explains every transition used by plan start/resume, workflow start/resume/step advance, interrupt/pause, completion, deletion, and ad-hoc session use.

- [x] 3. Make agent restoration a first-class runtime effect
  **What**: Stop coupling agent restoration to “prompt exists”. Add a dedicated runtime capability that can restore the session agent independently from whether a continuation prompt is injected. If the host API still requires `promptAsync(agent=...)`, hide that behind one application/service seam so compaction, idle continuation, and command-driven switches all use the same agent-restore primitive.
  **Files**: `src/runtime/opencode/effects.ts`, `src/runtime/opencode/apply-effects.ts`, `src/infrastructure/opencode/session-client.ts`, `src/application/policy/session-policy.ts`, `src/application/commands/start-work-command.ts`, `src/application/commands/run-workflow-command.ts`
  **Acceptance**: Compaction recovery can restore Loom/Tapestry/current-workflow-step-agent even when the correct behavior is “restore identity only, do not auto-continue work.”

- [x] 4. Replace heuristic compaction recovery with a reconciliation-first resume algorithm
  **What**: Build one resolver used by `session.compacted`: (1) load the session runtime record; (2) load/reconcile the execution lease and underlying plan/workflow state; (3) if a workflow owns the session and is still running, compose the workflow continuation prompt and target the current step agent; (4) else if a plan owns the session and is still running, compose the work continuation prompt and target the persisted executor agent, defaulting to Tapestry only in this plan-owned case; (5) else if no owner exists but `foregroundAgent` is known, restore only that agent with a minimal compaction note; (6) if persisted state is stale, heal/clear it and do not auto-resume. Session binding must be respected before any resume.
  **Files**: `src/hooks/compaction-recovery.ts`, `src/application/policy/session-policy.ts`, `src/application/orchestration/session-runtime.ts`, `src/application/orchestration/idle-cycle-service.ts`, `src/application/orchestration/execution-coordinator.ts`, `src/domain/workflows/workflow-context.ts`, `src/hooks/work-continuation.ts`
  **Acceptance**: The algorithm never defaults to Tapestry for `owner=none`, never resumes paused/completed work, and always prefers reconciled current workflow step data over stale persisted agent fields.

- [x] 5. Wire `/start-work`, workflows, and general session activity into the new runtime state
  **What**: `/start-work` should create/update both the execution lease and the caller's session runtime record with `mode=plan`, `ownerKind=plan`, and `foregroundAgent=tapestry`. Workflow start/resume/step advance should write `mode=workflow`, `ownerKind=workflow`, `ownerRef=instanceId/currentStepId`, and `foregroundAgent=currentStep.agent`. General ad-hoc sessions should update only the session runtime record from observed agent identity in `handleChatParams`, allowing Loom, Weft, Warp, Shuttle, or other agents to be restored after compaction without claiming execution ownership.
  **Files**: `src/hooks/start-work-hook.ts`, `src/application/commands/start-work-command.ts`, `src/features/workflow/hook.ts`, `src/application/commands/run-workflow-command.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/hooks/create-hooks.ts`
  **Acceptance**: Every legitimate agent switch path has exactly one writer for foreground agent state, and plan/workflow entrypoints also update the repo-scoped execution lease.

- [x] 6. Add compatibility-safe migration and fallback behavior
  **What**: Ship dual-read/dual-write behavior first. If `.weave/runtime/` files do not exist, derive plan/workflow ownership from current `.weave/state.json` and workflow instance files, then lazily backfill the new runtime records. Keep reading `state.agent` only as a plan-owned fallback. Repositories with no runtime state but active Loom sessions should continue safely by observing `handleChatParams` and populating session records from that point forward. Do not change existing plan/workflow storage formats in the first rollout.
  **Files**: `src/infrastructure/fs/execution-lease-fs-store.ts`, `src/infrastructure/fs/work-state-fs-store.ts`, `src/infrastructure/fs/workflow-fs-repository.ts`, `src/hooks/compaction-recovery.ts`, `src/application/orchestration/execution-coordinator.ts`, `test/integration/execution-lease.integration.test.ts`
  **Acceptance**: Old repos continue to resume plan/workflow execution correctly during migration, and the new runtime files are created opportunistically without breaking current behavior.

- [x] 7. Define failure handling and guardrails explicitly
  **What**: Reconciliation rules should be explicit: if the runtime says `workflow/running` but the active instance is missing or ended, clear the owner and fall back to foreground-agent-only restore; if it says `plan/running` but the plan is complete or paused, clear the owner and do not continue; if session record and lease disagree, a valid running owner wins for continuation, but the session record remains the source for ad-hoc `owner=none` restores; if the persisted agent is unknown or disabled, do not invent Tapestry/Loom—log, clear the stale agent field, and let the default session identity stand. Recovery must be idempotent per compaction event.
  **Files**: `src/hooks/compaction-recovery.ts`, `src/application/policy/session-policy.ts`, `src/application/orchestration/execution-coordinator.ts`, `src/runtime/opencode/event-router.ts`, `src/shared/log.ts`
  **Acceptance**: Conflicting or stale runtime data degrades to safe no-op or identity-only restore rather than resuming the wrong executor.

- [x] 8. Build a focused test matrix for ownership and compaction recovery
  **What**: Add unit, integration, and e2e coverage for the execution-ownership matrix and its edge cases. The canonical e2e scenarios must be written in the same terms used in this plan so consumers can read the tests as executable documentation:

  1. **Loom ad-hoc session**
     - `foregroundAgent=loom`
     - `ownerKind=none`
     - after compaction: Loom remains the foreground agent; no fake plan/workflow continuation is injected

  2. **Tapestry plan execution**
     - `foregroundAgent=tapestry`
     - `ownerKind=plan`
     - `ownerRef=<plan path>`
     - after compaction: Tapestry is restored and the plan continuation prompt is injected

  3. **Workflow-owned execution**
     - `foregroundAgent=<current step agent>`
     - `ownerKind=workflow`
     - `ownerRef=<workflow instance or step ref>`
     - after compaction: the correct workflow step agent is restored and workflow continuation is injected

  Use the matrix terms directly in the e2e names. Recommended file placement and test names:

  - `test/e2e/compaction-recovery.e2e.test.ts`
    - `describe("compaction recovery ownership matrix", ...)`
    - `it("restores Loom ad-hoc session after compaction when ownerKind is none", ...)`
    - `it("restores Tapestry plan execution after compaction when ownerKind is plan", ...)`
    - `it("restores workflow step agent after compaction when ownerKind is workflow", ...)`
    - `it("does not auto-resume paused plan after compaction", ...)`
    - `it("does not auto-resume paused workflow after compaction", ...)`
    - `it("clears stale plan ownership and avoids incorrect resume after compaction", ...)`
    - `it("clears stale workflow ownership and avoids incorrect resume after compaction", ...)`
    - `it("restores specialist ad-hoc agent after compaction when ownerKind is none", ...)`

  - `test/e2e/execution-ownership.e2e.test.ts`
    - ownership transition coverage such as Loom ad-hoc → `/start-work` → Tapestry plan, plan completion clearing owner, Loom ad-hoc → workflow ownership, and workflow pause/resume transitions

  - `test/e2e/workflow-precedence.e2e.test.ts`
    - precedence coverage such as workflow beating plan when both records exist and compaction following workflow precedence when both plan/workflow state are present

  - `test/e2e/session-finalization.e2e.test.ts`
    - `it("clears per-session runtime state on session deletion", ...)`

  Then extend around that matrix with paused/complete states, non-Loom ad-hoc specialists, stale lease/session disagreements, interactive Loom-owned workflow steps, and session deletion cleanup. Reuse the existing ownership and precedence suites as the compatibility baseline.
  **Files**: `test/e2e/start-work-runtime.e2e.test.ts`, `test/e2e/execution-ownership.e2e.test.ts`, `test/e2e/workflow-precedence.e2e.test.ts`, `test/e2e/session-finalization.e2e.test.ts`, `test/e2e/compaction-recovery.e2e.test.ts`, `test/integration/execution-lease.integration.test.ts`, `src/application/policy/policy-engine.test.ts`, `src/plugin/plugin-interface.test.ts`
  **Acceptance**: The suite contains explicit end-to-end tests for the three canonical matrix scenarios (Loom ad-hoc, Tapestry plan, workflow step agent), plus paused, stale, ad-hoc specialist, and deletion cases. The matrix examples in this plan map directly to named e2e tests, and existing ownership e2es stay green.

- [x] 9. Roll out incrementally and retire the old heuristic only after proof
  **What**: Land this as a test-first rollout so behavior is pinned before runtime-state changes ship. Recommended slices:

  1. **Write failing end-to-end ownership-matrix tests first**
     - Add the three canonical compaction-recovery e2es for Loom ad-hoc, Tapestry plan, and workflow step ownership using the exact names above.
     - Run them first and confirm they fail for behavioral reasons that match today's gap (wrong/missing agent restoration, wrong/missing continuation behavior), not because of malformed test setup.

  2. **Add minimal schemas/repositories plus dual-read reconciliation**
     - Introduce the runtime/session state model under `.weave/runtime/` with enough shape to support the failing tests.
     - Keep legacy plan/workflow state readable and dual-write where needed.

  3. **Wire writers from `/start-work`, workflows, and observed ad-hoc session identity**
     - Update `/start-work`, workflow start/resume/step transitions, and session agent observation so the runtime state becomes accurate before compaction recovery relies on it.

  4. **Make compaction recovery pass the matrix tests**
     - Implement the reconciliation-first restore algorithm and dedicated agent-restore effect until the three canonical matrix e2es pass.

  5. **Add edge-case e2es and harden behavior**
     - Add paused, stale, specialist ad-hoc, precedence, and session-deletion cases.
     - Use these to drive the remaining reconciliation and cleanup behavior.

  6. **Retire old heuristics only after proof**
     - Remove direct plan/workflow-only compaction heuristics only after the matrix tests and edge-case suites stay green.

  During rollout, emit debug logs on recovery decisions so mismatches are observable before cleanup.
  **Files**: `src/domain/session/execution-lease.ts`, `src/infrastructure/fs/execution-lease-fs-store.ts`, `src/hooks/start-work-hook.ts`, `src/features/workflow/hook.ts`, `src/hooks/compaction-recovery.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/application/policy/session-policy.ts`, `src/plugin/plugin-interface.test.ts`
  **Acceptance**: Execution begins by adding the canonical ownership-matrix e2es and observing them fail for the expected behavioral reasons. Each subsequent slice is independently shippable, dual-read remains available until recovery tests prove the new runtime state is authoritative, and the old `workflow-then-plan` compaction heuristic is removed only at the end.

## Verification
- [x] All tests pass
- [x] No regressions
- [x] `bun test test/e2e/start-work-runtime.e2e.test.ts test/e2e/execution-ownership.e2e.test.ts test/e2e/workflow-precedence.e2e.test.ts test/e2e/session-finalization.e2e.test.ts`
- [x] `bun test test/e2e/compaction-recovery.e2e.test.ts test/integration/execution-lease.integration.test.ts src/plugin/plugin-interface.test.ts`
- [x] `bun run typecheck`
- [x] `bun run build`
