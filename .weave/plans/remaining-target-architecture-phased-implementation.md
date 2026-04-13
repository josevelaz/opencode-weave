# Remaining Target Architecture Phased Implementation Plan

## TL;DR
> **Summary**: Finish the last ~30% of the target architecture through five compatibility-safe slices: harden domain boundaries, introduce explicit persisted execution ownership, complete PolicyEngine centralization, finish the testing pyramid and missing host-level regressions, then remove the remaining legacy compatibility branches. Land each slice behind existing seams and stop to verify before deleting fallback paths.
> **Estimated Effort**: XL

## Context
### Original Request
Create an execution-ready phased implementation plan for completing the remaining work from `/Users/pgermishuys/source/weave/.weave/plans/weave-target-architecture-testing-blueprint.md`, incorporating that the architecture is roughly 70% complete, several runtime/orchestration/e2e slices are already done, and the biggest remaining gaps are true domain extraction out of `src/features/*`, explicit persisted execution ownership via `.weave/runtime/active-execution.json`, full policy centralization through `PolicyEngine`, tighter infrastructure boundaries, completion of the testing pyramid, remaining e2e scenarios, and later cleanup of legacy compatibility/substring parsing branches.

### Key Findings
- Runtime extraction, typed command envelopes, adapter-thin `src/plugin/plugin-interface.ts`, shared idle/execution coordination, host-simulated e2e harness, and key `/start-work`/ownership/finalization/interrupt/workflow-precedence coverage are already in place.
- Policy centralization has started, but `src/hooks/create-hooks.ts` still wires many hook-era behaviors directly, and several behaviors still depend on hook wrappers rather than domain/application-first contracts.
- `src/domain/plans/*`, `src/domain/workflows/*`, and `src/domain/session/*` now exist, but workflow service code still leans heavily on `src/features/workflow/*`, so domain extraction is only partial.
- `src/application/orchestration/execution-coordinator.ts` already reads through `ExecutionLeaseRepository`, but ownership is still derived only from plan/workflow state; the explicit persisted lease file requested in the blueprint is not present yet.
- Filesystem repository extraction has started for plans, workflows, analytics, config, and execution lease, but feature facades such as `src/features/work-state/storage.ts`, `src/features/workflow/storage.ts`, and `src/features/analytics/storage.ts` still remain as compatibility surfaces.
- High-value e2e coverage exists for start-work, auto-pause, pattern guard, execution ownership, workflow precedence, session finalization, and interrupt suppression, but the broader testing pyramid still needs more domain/unit coverage and command/policy/health-report lifecycle coverage.
- `/run-workflow` is now mainly a compatibility surface; it should be preserved while avoiding new product-scope investment.
- The safest path is not 1-2 large PRs. The remaining work crosses storage, domain boundaries, policy flow, and regression coverage, so smaller slices are better for compatibility and rollback.

## Objectives
### Core Objective
Complete the remaining target-architecture work without destabilizing current behavior by finishing domain extraction, persisting explicit execution ownership, centralizing lifecycle policy decisions, tightening infrastructure boundaries, completing the intended testing pyramid, and only then removing legacy compatibility paths.

### Deliverables
- [ ] A phased 5-PR implementation sequence with explicit stop-and-verify checkpoints.
- [ ] Stable domain/application interfaces for plans, workflows, session ownership, and analytics that no longer depend on `src/features/*` internals for core orchestration.
- [ ] A compatibility-safe persisted execution ownership record at `.weave/runtime/active-execution.json`.
- [ ] One fully centralized `PolicyEngine` path for chat, tool, idle, session-deleted, assistant-message, and compaction lifecycle handling.
- [ ] A completed testing pyramid with added domain/integration coverage and remaining host-simulated e2e regressions.
- [ ] A final cleanup phase that removes legacy substring/compatibility branches only after the new path is proven.

### Definition of Done
- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run build` passes.
- [ ] `test/e2e/*.test.ts` covers command routing, plan/workflow ownership, auto-pause, pattern guard, finalization, interrupt suppression, and health/metrics command paths.
- [ ] Core orchestration modules depend on `src/domain/*` and `src/infrastructure/*` contracts instead of reaching into `src/features/*` storage/hook internals for runtime decisions.
- [ ] `.weave/runtime/active-execution.json` is dual-read/dual-write compatible and does not break existing `.weave/state.json` or `.weave/workflows/*` behavior.
- [ ] Legacy compatibility branches are removed only after replacement-path tests prove equivalent behavior.

### Guardrails (Must NOT)
- [ ] Must NOT destabilize `.weave/state.json`, `.weave/plans/*`, or `.weave/workflows/*` during earlier phases.
- [ ] Must NOT broaden `/run-workflow` beyond compatibility maintenance.
- [ ] Must NOT reintroduce orchestration logic into `src/plugin/plugin-interface.ts` or add new adapter-only policy branches.
- [ ] Must NOT delete legacy parsing/compatibility code before replacement tests exist and pass.
- [ ] Must NOT collapse markdown plans into workflow definitions.
- [ ] Must NOT land the explicit persisted execution file without dual-read migration behavior and focused regression coverage.

## TODOs

- [ ] 1. Phase 1 — Complete domain extraction behind compatibility facades
  **What**: Finish moving orchestration-relevant business logic out of `src/features/*` and `src/hooks/*` into stable domain/application services, while keeping existing feature exports as thin facades. This is the right first slice because it reduces dependency tangles before ownership persistence and final cleanup.
  **Files**: `src/domain/plans/plan-service.ts`, `src/domain/plans/plan-execution.ts`, `src/domain/plans/plan-selection.ts`, `src/domain/plans/plan-progress.ts`, `src/domain/workflows/workflow-service.ts`, `src/domain/workflows/workflow-context.ts`, `src/domain/workflows/workflow-completion.ts`, `src/domain/workflows/workflow-repository.ts`, `src/domain/session/execution-lease.ts`, `src/application/commands/start-work-command.ts`, `src/application/commands/run-workflow-command.ts`, `src/application/orchestration/idle-cycle-service.ts`, `src/hooks/start-work-hook.ts`, `src/hooks/work-continuation.ts`, `src/features/workflow/hook.ts`, `src/features/workflow/index.ts`, `src/features/work-state/index.ts`
  **Acceptance**: Start-work, work-continuation, and workflow continuation paths depend on domain services/contracts rather than directly owning selection/progress/continuation logic in hook-era modules; existing public feature exports still work as compatibility facades.
  - **PR Slice**: PR 1 of 5.
  - **Goal**: Make domain/application modules the primary owners of plan/workflow behavior without changing on-disk formats.
  - **Key file areas**: `src/domain/plans/*`, `src/domain/workflows/*`, `src/application/commands/*`, `src/application/orchestration/*`, thin wrappers in `src/hooks/*` and `src/features/*`.
  - **Steps**:
    1. Move remaining plan selection/progress/resume/continuation decisions into domain modules and keep hooks as adapters.
    2. Refactor workflow hook logic so discovery/resume/start/completion decisions live behind `WorkflowService`-style interfaces instead of feature-layer static calls.
    3. Replace direct feature-module imports in command/orchestration code with domain/application imports.
    4. Keep feature exports as shims so downstream compatibility remains intact during the transition.
  - **Stop & Verify**: Stop after command and idle paths no longer need feature-internal logic to decide ownership/progress. Run `bun test test/e2e/start-work-runtime.e2e.test.ts test/e2e/execution-ownership.e2e.test.ts test/e2e/workflow-precedence.e2e.test.ts test/e2e/auto-pause.e2e.test.ts` plus `bun run typecheck`.
  - **Risk notes**:
    - Biggest risk is changing behavior while “moving” code rather than only rerouting imports.
    - Workflow code is the most coupled area; keep `/run-workflow` behavior stable and resist redesign.
    - Avoid mixing persistence changes into this PR.
  - **Suggested regression tests**:
    - Existing `/start-work`, auto-pause, execution-ownership, and workflow-precedence e2e suites.
    - New or expanded unit/domain tests for plan selection, resume behavior, workflow completion, and continuation prompt composition.

- [ ] 2. Phase 2 — Add explicit persisted execution ownership with compatibility-safe migration
  **What**: Introduce `.weave/runtime/active-execution.json` as the explicit persisted ownership record required by the blueprint, but keep dual-read behavior so current plan/workflow state remains authoritative during migration. Update coordinator logic to write/read the ownership lease through one abstraction.
  **Files**: `src/domain/session/execution-lease.ts`, `src/application/orchestration/execution-coordinator.ts`, `src/application/orchestration/idle-cycle-service.ts`, `src/infrastructure/fs/execution-lease-fs-store.ts`, `src/infrastructure/fs/plan-fs-repository.ts`, `src/infrastructure/fs/workflow-fs-repository.ts`, `src/hooks/start-work-hook.ts`, `src/hooks/work-continuation.ts`, `src/features/workflow/hook.ts`, `test/integration/execution-lease.integration.test.ts`, `test/e2e/execution-ownership.e2e.test.ts`, `test/e2e/workflow-precedence.e2e.test.ts`, `.weave/runtime/active-execution.json`
  **Acceptance**: Execution ownership decisions route through one persisted lease abstraction; the new file is written for active ownership changes, dual-read works against legacy state/workflow storage, and all ownership/precedence regressions still pass.
  - **PR Slice**: PR 2 of 5.
  - **Goal**: Remove implicit ownership inference as the long-term source of truth while preserving compatibility.
  - **Key file areas**: `src/domain/session/*`, `src/application/orchestration/*`, `src/infrastructure/fs/execution-lease-fs-store.ts`, host/integration ownership tests.
  - **Steps**:
    1. Expand the execution-lease contract from read-only snapshot derivation to explicit read/write/clear ownership operations.
    2. Add runtime directory creation and persisted lease file management under `.weave/runtime/`.
    3. Wire plan start/resume/pause/finalize and workflow start/resume/pause/finalize transitions to update the persisted lease.
    4. Keep dual-read fallback so older repos or interrupted sessions still derive correctly from legacy plan/workflow state.
    5. Add recovery behavior for missing/stale lease files so startup and idle flows remain safe.
  - **Stop & Verify**: Stop once ownership changes are persisted and all current ownership-related e2e suites pass unchanged. Run `bun test test/integration/execution-lease.integration.test.ts test/e2e/execution-ownership.e2e.test.ts test/e2e/workflow-precedence.e2e.test.ts test/e2e/session-finalization.e2e.test.ts`.
  - **Risk notes**:
    - Highest risk is lease drift when plan/workflow state and lease disagree after interruptions or crashes.
    - Use reconciliation rules that prefer explicit active records only when valid, then heal mismatches.
    - Avoid making the lease file the only source of truth until recovery rules are proven.
  - **Suggested regression tests**:
    - Integration tests for lease write/read/clear, stale lease reconciliation, and missing runtime directory creation.
    - E2E tests for restart/resume across sessions, workflow-over-plan precedence, interrupt pause, and session finalization clearing ownership.

- [ ] 3. Phase 3 — Finish PolicyEngine centralization and remove remaining split policy paths
  **What**: Complete the migration from hook-era lifecycle behavior to one composed policy pipeline, so chat/tool/assistant/idle/session/compaction decisions all flow through `PolicyEngine` and not through scattered wrappers or duplicate inline branches.
  **Files**: `src/application/policy/policy-engine.ts`, `src/application/policy/chat-policy.ts`, `src/application/policy/tool-policy.ts`, `src/application/policy/session-policy.ts`, `src/application/policy/runtime-policy.ts`, `src/domain/policy/policy-result.ts`, `src/application/orchestration/session-runtime.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/hooks/create-hooks.ts`, `src/hooks/pattern-md-only.ts`, `src/hooks/write-existing-file-guard.ts`, `src/hooks/rules-injector.ts`, `src/hooks/context-window-monitor.ts`, `src/hooks/verification-reminder.ts`, `src/hooks/todo-continuation-enforcer.ts`
  **Acceptance**: The runtime invokes exactly one policy engine per lifecycle phase; hook modules are either pure rule helpers or thin wrappers; no policy behavior remains duplicated between adapter/orchestration/hook paths.
  - **PR Slice**: PR 3 of 5.
  - **Goal**: Make policy composition explicit and testable before broader cleanup.
  - **Key file areas**: `src/application/policy/*`, `src/application/orchestration/session-runtime.ts`, lifecycle adapter wiring, remaining hook rule helpers.
  - **Steps**:
    1. Inventory remaining lifecycle behavior still hidden in hooks or adapter call sites.
    2. Convert those behaviors into named chat/tool/session policy units with consistent result types.
    3. Trim `create-hooks.ts` so it provides configuration/rule helpers instead of lifecycle branching.
    4. Ensure assistant-message, session-idle, session-deleted, and compaction flows use the same engine path as chat/tool events.
    5. Preserve current user-facing messages and prompt text to avoid unnecessary churn.
  - **Stop & Verify**: Stop after `create-hooks.ts` is reduced to compatibility/config glue and policy decisions are only produced by `PolicyEngine`. Run `bun test src/application/policy/policy-engine.test.ts test/integration/policy-engine.integration.test.ts test/e2e/pattern-guard.e2e.test.ts test/e2e/auto-pause.e2e.test.ts`.
  - **Risk notes**:
    - Policy ordering bugs are easy to introduce when merging scattered rules.
    - Message text drift can break brittle assertions; update assertions intentionally, not accidentally.
    - Do not mix final legacy cleanup into this phase.
  - **Suggested regression tests**:
    - Unit tests for policy composition/ordering/merge semantics.
    - Integration tests for policy-engine assembly with real temp directories.
    - E2E tests for pattern guard, auto-pause, context-window warnings, verification reminder, and interrupt suppression.

- [ ] 4. Phase 4 — Finish infrastructure normalization and complete the testing pyramid
  **What**: Tighten repository and infrastructure boundaries so application/domain code no longer depends on feature-layer storage helpers, then add the remaining domain/integration/e2e coverage needed to make final cleanup safe.
  **Files**: `src/infrastructure/fs/plan-fs-repository.ts`, `src/infrastructure/fs/workflow-fs-repository.ts`, `src/infrastructure/fs/work-state-fs-store.ts`, `src/infrastructure/fs/analytics-fs-store.ts`, `src/infrastructure/fs/config-fs-loader.ts`, `src/infrastructure/opencode/session-client.ts`, `src/features/work-state/storage.ts`, `src/features/workflow/storage.ts`, `src/features/analytics/storage.ts`, `src/config/loader.ts`, `src/domain/**/*.test.ts`, `test/integration/**/*.test.ts`, `test/e2e/**/*.test.ts`, `test/testkit/host/fake-opencode-host.ts`, `test/testkit/host/fake-plugin-client.ts`
  **Acceptance**: Repository contracts are the primary dependency direction, feature storage files are compatibility facades only, and the added tests cover the remaining blueprint gaps across domain, integration, and e2e layers.
  - **PR Slice**: PR 4 of 5.
  - **Goal**: Prove the architecture through tests before deleting compatibility code.
  - **Key file areas**: `src/infrastructure/*`, `src/features/*/storage.ts` facades, domain test files, integration tests, host e2e suites.
  - **Steps**:
    1. Remove any remaining direct `fs`-level assumptions from application/domain code.
    2. Keep feature storage exports, but make them delegate only to infrastructure repositories.
    3. Expand unit/domain tests for plan progress/selection/validation, workflow transition/completion, lease reconciliation, and policy result merging.
    4. Add or finish integration tests for repository behavior, config loading, analytics persistence, and command/bootstrap assembly.
    5. Add the remaining host-level e2e scenarios: `/weave-health`, metrics/token-report injection, todo finalization after true idle, and context-window threshold signaling.
  - **Stop & Verify**: Stop after the testing pyramid is materially complete and before any deletion of fallback paths. Run `bun test`, then confirm newly added suites cover each remaining lifecycle surface called out in the blueprint.
  - **Risk notes**:
    - Test sprawl can create noise; bias toward domain tests for logic and reserve e2e for lifecycle seams.
    - Keep `/run-workflow` covered, but do not overinvest beyond compatibility scenarios.
    - Avoid refactoring repositories and deleting old facades in the same pass.
  - **Suggested regression tests**:
    - Domain tests for lease reconciliation and command envelope parsing.
    - Integration tests for repository round-trips, analytics/config behavior, and command-router wiring.
    - E2E tests for health/metrics commands, idle todo finalization, context-window warnings, start-work ownership, pattern guard, and finalization flows.

- [ ] 5. Phase 5 — Remove legacy compatibility and substring parsing branches after proof
  **What**: Delete the remaining compatibility-only branches, substring parsing fallbacks, and obsolete feature/hook indirections once the new domain/application/policy/infrastructure paths are fully covered and stable.
  **Files**: `src/runtime/opencode/command-envelope.ts`, `src/runtime/opencode/protocol.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/hooks/create-hooks.ts`, `src/hooks/start-work-hook.ts`, `src/hooks/work-continuation.ts`, `src/features/workflow/hook.ts`, `src/features/workflow/index.ts`, `src/features/work-state/index.ts`, `src/plugin/plugin-interface.ts`, `test/e2e/**/*.test.ts`, `test/integration/**/*.test.ts`
  **Acceptance**: Command detection no longer depends on legacy substring/marker fallbacks except where explicitly preserved for backward compatibility, duplicate branches are removed, and all tests still pass through the typed runtime path.
  - **PR Slice**: PR 5 of 5.
  - **Goal**: Cash in the architectural work by removing dead paths only after replacement coverage is complete.
  - **Key file areas**: runtime protocol/parser, compatibility hooks/facades, any remaining legacy routing branches, final regression suites.
  - **Steps**:
    1. Identify all remaining compatibility branches and substring-based fallbacks.
    2. Delete only the branches already proven redundant by typed-envelope and policy-path tests.
    3. Remove or reduce obsolete wrappers where application/domain entrypoints are now the only supported path.
    4. Update tests to assert the canonical path rather than legacy implementation details.
  - **Stop & Verify**: This is the final stop. Run `bun test`, `bun run typecheck`, and `bun run build`, then spot-check that no new command-routing logic relies on free-form substring matching for built-in commands.
  - **Risk notes**:
    - This is the easiest phase to underestimate because deletions can uncover hidden compatibility consumers.
    - Keep the PR deletion-focused; do not mix in new features.
    - If any high-value regression appears, back out the deletion rather than patching around it with a third path.
  - **Suggested regression tests**:
    - Full `bun test` run.
    - Grep-based verification that command-routing fallbacks are gone from runtime/plugin surfaces.
    - Existing host e2e suites to ensure the typed path remains the only path in practice.

## Verification
- [ ] All tests pass
- [ ] No regressions
- [ ] `bun test`
- [ ] `bun run typecheck`
- [ ] `bun run build`
- [ ] Phase 1 stop-check passes: `bun test test/e2e/start-work-runtime.e2e.test.ts test/e2e/execution-ownership.e2e.test.ts test/e2e/workflow-precedence.e2e.test.ts test/e2e/auto-pause.e2e.test.ts`
- [ ] Phase 2 stop-check passes: `bun test test/integration/execution-lease.integration.test.ts test/e2e/execution-ownership.e2e.test.ts test/e2e/workflow-precedence.e2e.test.ts test/e2e/session-finalization.e2e.test.ts`
- [ ] Phase 3 stop-check passes: `bun test src/application/policy/policy-engine.test.ts test/integration/policy-engine.integration.test.ts test/e2e/pattern-guard.e2e.test.ts test/e2e/auto-pause.e2e.test.ts`
- [ ] Phase 4 stop-check passes: testing pyramid expanded across domain, integration, and e2e suites for health/metrics/context-window/finalization coverage
- [ ] Phase 5 stop-check passes: typed runtime path is canonical and legacy substring/compatibility branches are removed
