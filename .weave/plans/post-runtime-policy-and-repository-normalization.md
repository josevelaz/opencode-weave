# Post-Runtime Policy Centralization and Repository Normalization

## TL;DR
> **Summary**: Finish the next safe architecture slices by first centralizing lifecycle policy decisions behind a `PolicyEngine` and closing the remaining host-simulated regressions, then normalizing repository/infrastructure boundaries so later domain extraction and execution-ownership decisions can happen behind stable interfaces.
> **Estimated Effort**: Large

## Context
### Original Request
Create an implementation-ready Weave plan for the remaining work needed to reach the target state in `.weave/plans/weave-target-architecture-testing-blueprint.md`, assuming the typed command envelope, runtime adapter/effects, shared orchestration layer, workflow-over-plan precedence e2e, and full verification slice are already complete.

### Key Findings
- `src/plugin/plugin-interface.ts` is now adapter-thin, but `src/runtime/opencode/plugin-adapter.ts` still contains policy behavior inline for tool guarding, rules lookup, pattern restrictions, workflow keyword handling, and plan auto-pause.
- `src/application/orchestration/session-runtime.ts` already exposes the right lifecycle seam (`onChatMessage`, `beforeTool`, `afterTool`, `onSessionIdle`, `onSessionDeleted`, `onCompaction`), but the default policy surface is still a no-op.
- High-value e2e coverage exists for start-work, interrupt suppression, execution ownership, session finalization, and workflow precedence; the remaining blueprint gaps are still real: host-level normal-message auto-pause and Pattern non-`.md` tool blocking.
- There is still no `src/domain/*` or `src/infrastructure/*` layer. `src/features/work-state/storage.ts`, `src/features/workflow/storage.ts`, `src/features/analytics/storage.ts`, and `src/config/loader.ts` still mix domain decisions with direct filesystem access.
- `src/application/orchestration/execution-coordinator.ts` currently derives active ownership by reading plan/workflow state directly. That is acceptable for the landed slice, but it leaves no stable abstraction for deciding whether a persisted execution lease is actually needed.
- `/run-workflow` remains a compatibility surface, not a growth area. Remaining work should preserve current behavior without investing in new workflow product scope.

## Objectives
### Core Objective
Finish the next low-risk architecture slices by moving lifecycle policies into one composed engine, closing the last critical host-simulated regressions, and introducing repository/domain seams that allow later cleanup without destabilizing existing `.weave` behavior.

### Deliverables
- [x] One composed `PolicyEngine` wired through all current runtime lifecycle entry points.
- [x] Host-simulated e2e coverage for Pattern write restrictions and normal user-message plan auto-pause.
- [x] Repository/infrastructure interfaces for plan, workflow, analytics, and config persistence, introduced behind compatibility facades.
- [x] Thin domain-facing services for plans/workflows/session ownership that no longer depend on OpenCode/plugin types.
- [x] An explicit execution-ownership decision path: either a justified persisted lease behind compatibility adapters, or a documented decision to keep derived ownership with stronger tests.

### Definition of Done
- [x] `src/runtime/opencode/plugin-adapter.ts` delegates lifecycle policy decisions to `src/application/policy/*` instead of owning new inline checks.
- [x] `bun test test/e2e/pattern-guard.e2e.test.ts test/e2e/auto-pause.e2e.test.ts` passes.
- [x] `bun test test/e2e/execution-ownership.e2e.test.ts test/e2e/workflow-precedence.e2e.test.ts test/e2e/session-finalization.e2e.test.ts` still passes unchanged or with compatibility-safe updates.
- [x] Application/orchestration modules depend on repository interfaces rather than importing raw FS helpers directly.
- [x] Any persisted execution-ownership file is added only behind dual-read/compatible behavior; otherwise the new ownership abstraction proves persistence is unnecessary.
- [x] `bun test`, `bun run typecheck`, and `bun run build` all pass.

### Guardrails (Must NOT)
- [x] Must NOT re-expand `src/plugin/plugin-interface.ts` or move policy logic back into the adapter layer.
- [x] Must NOT broaden `/run-workflow` scope beyond compatibility-preserving maintenance.
- [x] Must NOT change `.weave/state.json`, `.weave/plans/*`, or `.weave/workflows/*` formats in the first policy slice.
- [x] Must NOT introduce a second policy path once `PolicyEngine` wiring exists.
- [x] Must NOT force a new `.weave/runtime/active-execution.json` file unless repository/execution abstractions still show a real ambiguity that derived ownership cannot handle safely.

## TODOs

- [x] 1. Land PolicyEngine as the next slice and wire every lifecycle seam through it
  **What**: Create the central policy package and replace the current no-op lifecycle surface with one composed engine for chat, tool, session-idle, session-deleted, and compaction phases. Start by preserving current behavior through adapters/wrappers around existing hook logic rather than rewriting rules all at once.
  **Files**: `src/application/policy/policy-engine.ts`, `src/application/policy/chat-policy.ts`, `src/application/policy/tool-policy.ts`, `src/application/policy/session-policy.ts`, `src/domain/policy/policy-result.ts`, `src/application/orchestration/session-runtime.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/runtime/opencode/event-router.ts`, `src/hooks/create-hooks.ts`
  **Acceptance**: One engine is invoked from all lifecycle surfaces; adding a new policy no longer requires editing `plugin-adapter.ts` event/tool/chat branches directly.

- [x] 2. Migrate the current high-value policies into the engine without changing user-visible behavior
  **What**: Move the existing policy-bearing hooks behind the new engine in the safest order: Pattern tool restriction, write guard/rules lookup, context-window signaling, verification reminder, and todo/session lifecycle helpers. Preserve existing error messages and prompt content wherever possible so current tests remain stable.
  **Files**: `src/hooks/pattern-md-only.ts`, `src/hooks/write-existing-file-guard.ts`, `src/hooks/rules-injector.ts`, `src/hooks/context-window-monitor.ts`, `src/hooks/verification-reminder.ts`, `src/hooks/todo-continuation-enforcer.ts`, `src/application/policy/chat-policy.ts`, `src/application/policy/tool-policy.ts`, `src/application/policy/session-policy.ts`, `src/application/policy/policy-engine.ts`
  **Acceptance**: Pattern/tool/session policies run through the engine; there is no duplicate inline enforcement path left in `plugin-adapter.ts` for the migrated rules.

- [x] 3. Close the two remaining top-priority host-simulated e2e gaps in the same slice
  **What**: Add the highest-value missing coverage before deeper refactors: (a) a normal user message during active plan execution triggers host-level auto-pause without treating the message as a continuation, and (b) Pattern is blocked from writing non-`.md` files outside `.weave/`. Extend the fake host only as needed to send realistic user messages and tool args.
  **Files**: `test/e2e/auto-pause.e2e.test.ts`, `test/e2e/pattern-guard.e2e.test.ts`, `test/testkit/host/fake-opencode-host.ts`, `test/testkit/host/fake-plugin-client.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/application/policy/tool-policy.ts`, `src/application/policy/chat-policy.ts`
  **Acceptance**: Both regressions fail if policy routing is bypassed and pass through the host harness when the engine is active.

- [x] 4. Normalize persistence behind repository interfaces as the second slice
  **What**: Introduce explicit repository/store interfaces and filesystem adapters while keeping the current feature modules as facades during migration. Start with the modules already coupled to disk I/O so orchestration code can stop reading storage helpers directly.
  **Files**: `src/domain/plans/plan-repository.ts`, `src/domain/workflows/workflow-repository.ts`, `src/domain/session/execution-lease.ts`, `src/domain/analytics/analytics-service.ts`, `src/infrastructure/fs/plan-fs-repository.ts`, `src/infrastructure/fs/workflow-fs-repository.ts`, `src/infrastructure/fs/work-state-fs-store.ts`, `src/infrastructure/fs/analytics-fs-store.ts`, `src/infrastructure/fs/config-fs-loader.ts`, `src/infrastructure/opencode/session-client.ts`, `src/features/work-state/storage.ts`, `src/features/workflow/storage.ts`, `src/features/analytics/storage.ts`, `src/config/loader.ts`
  **Acceptance**: Application/orchestration code can consume repository contracts without importing `fs`-backed feature storage helpers directly.

- [x] 5. Extract the now-practical domain facades from feature modules behind compatibility shims
  **What**: Once repositories exist, pull stable plan/workflow/session services out of feature-origin modules and let the application layer depend on those services. Keep the first extraction narrow: plan selection/progress/execution, workflow lifecycle/continuation, and execution ownership read models. Leave broad prompt/agent changes out of scope.
  **Files**: `src/domain/plans/plan-service.ts`, `src/domain/plans/plan-progress.ts`, `src/domain/plans/plan-selection.ts`, `src/domain/plans/plan-execution.ts`, `src/domain/workflows/workflow-service.ts`, `src/domain/workflows/workflow-context.ts`, `src/domain/workflows/workflow-completion.ts`, `src/domain/session/execution-lease.ts`, `src/application/orchestration/execution-coordinator.ts`, `src/application/orchestration/idle-cycle-service.ts`, `src/application/commands/start-work-command.ts`, `src/application/commands/run-workflow-command.ts`, `src/hooks/start-work-hook.ts`, `src/hooks/work-continuation.ts`, `src/features/workflow/hook.ts`
  **Acceptance**: Plan/workflow orchestration imports stable domain services or interfaces rather than reaching directly into feature storage and hook internals.

- [x] 6. Decide explicit persisted execution ownership only after the abstractions exist
  **What**: Introduce a single execution-ownership abstraction first, then make a narrow decision: keep derived ownership if repository-backed reads are sufficient, or add a persisted lease store only if tests still expose ambiguous ownership/pause cases. If persistence is justified, dual-read existing state plus the new lease and write the new record in a compatibility-safe way.
  **Files**: `src/domain/session/execution-lease.ts`, `src/application/orchestration/execution-coordinator.ts`, `src/infrastructure/fs/execution-lease-fs-store.ts`, `test/integration/execution-lease.integration.test.ts`, `test/e2e/execution-ownership.e2e.test.ts`, `test/e2e/workflow-precedence.e2e.test.ts`
  **Acceptance**: Execution ownership is represented by one abstraction; either no persisted file is needed after proof, or the persisted lease path lands with dual-read/compatibility coverage and no regression to current `.weave` behavior.

- [x] 7. Backfill the supporting test pyramid around the new seams before deleting compatibility paths
  **What**: Add focused tests around policy composition, repository behavior, and domain-level ownership decisions so later cleanup does not rely only on broad e2e suites. Use the host harness for lifecycle regressions and integration tests for real temp-directory persistence.
  **Files**: `src/application/policy/*.test.ts`, `src/domain/plans/*.test.ts`, `src/domain/workflows/*.test.ts`, `test/integration/policy-engine.integration.test.ts`, `test/integration/fs-repositories.integration.test.ts`, `test/integration/execution-lease.integration.test.ts`, `test/e2e/auto-pause.e2e.test.ts`, `test/e2e/pattern-guard.e2e.test.ts`, `test/e2e/execution-ownership.e2e.test.ts`
  **Acceptance**: New policy/repository/execution regressions are covered at unit or integration level first, with host-simulated e2e reserved for lifecycle behavior.

## Verification
- [x] All tests pass
- [x] No regressions
- [x] `bun test test/e2e/pattern-guard.e2e.test.ts test/e2e/auto-pause.e2e.test.ts`
- [x] `bun test test/e2e/execution-ownership.e2e.test.ts test/e2e/workflow-precedence.e2e.test.ts test/e2e/session-finalization.e2e.test.ts`
- [x] `bun test test/integration/policy-engine.integration.test.ts test/integration/fs-repositories.integration.test.ts test/integration/execution-lease.integration.test.ts`
- [x] `bun test`
- [x] `bun run typecheck`
- [x] `bun run build`
