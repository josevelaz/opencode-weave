# Policy Centralization Behind PolicyEngine

## TL;DR
> **Summary**: Finish the policy refactor by making `PolicyEngine` the only runtime path that executes policy behavior, then demote hook-era files to thin helpers/config wrappers. This closes blueprint TODO 5, DoD 73, and Guardrail 80 without changing user-visible behavior.
> **Estimated Effort**: Medium

## Context
### Original Request
Plan a focused refactor to centralize all policy enforcement behind the existing `PolicyEngine` in Weave, specifically closing blueprint TODO 5, DoD 73, and Guardrail 80 from `.weave/plans/weave-target-architecture-testing-blueprint.md`, while preserving current behavior and keeping each slice small enough for a single focused session.

### Key Findings
- `src/application/policy/policy-engine.ts` already composes chat/tool/session lifecycle entrypoints, but the concrete policies still delegate back into `CreatedHooks`, so the engine is orchestration glue rather than the true owner of rules.
- `src/runtime/opencode/plugin-adapter.ts` still bypasses the engine for `tool.definition`, `experimental.session.compacting`, todo-finalization re-arm, and helper construction (`createCompactionTodoPreserver`, `createTodoContinuationEnforcer`).
- `src/runtime/opencode/event-router.ts` still calls `compactionPreserver.handleEvent()` before policy dispatch, so compaction behavior is split across two paths.
- `src/hooks/create-hooks.ts` still exports executable policy functions (`checkContextWindow`, `patternMdOnly`, `shouldInjectRules`, `getRulesForFile`, `verificationReminder`) instead of only config/state.
- `src/application/policy/tool-policy.ts` still reaches into hook callbacks for Pattern restrictions, rules lookup, and write-guard tracking.
- `src/application/policy/session-policy.ts` still directly calls hook callbacks for context-window checks and compaction recovery, while idle behavior remains partly owned by `src/application/orchestration/idle-cycle-service.ts`.
- `src/runtime/opencode/command-envelope.ts` imports `FINALIZE_TODOS_MARKER` from `src/hooks/todo-continuation-enforcer.ts`, so todo policy state still leaks back into runtime parsing.
- Current scattered-to-target mapping should be:
  - `src/hooks/write-existing-file-guard.ts` -> `beforeTool` policy units under `src/application/policy/*`
  - `src/hooks/rules-injector.ts` -> `beforeTool` policy units under `src/application/policy/*`
  - `src/hooks/pattern-md-only.ts` -> `beforeTool` policy units under `src/application/policy/*`
  - `src/hooks/todo-description-override.ts` -> `onToolDefinition` policy path under `src/application/policy/*`
  - `src/hooks/context-window-monitor.ts` -> `onAssistantMessage` policy units under `src/application/policy/*`
  - `src/hooks/todo-continuation-enforcer.ts` -> `onChatMessage` re-arm plus `onSessionIdle`/`onSessionDeleted` policy units under `src/application/policy/*`
  - `src/hooks/verification-reminder.ts` -> idle/completion policy unit under `src/application/policy/*` using current trigger semantics only
  - `src/hooks/compaction-todo-preserver.ts` + `src/hooks/compaction-recovery.ts` -> pre-compaction and compaction session policy units under `src/application/policy/*`
- The main risks are stateful helper lifetime (read-tracking set, finalized sessions, compaction snapshots), preserving idle ordering (`workflow -> work -> todo finalization -> reminder`), and accidentally changing existing error/prompt text.

## Objectives
### Core Objective
Make `PolicyEngine` the sole composed runtime policy path for chat, tool, tool-definition, assistant-message, idle, session-deleted, and compaction lifecycle handling, while leaving the OpenCode adapter and hook factory as thin wiring/config layers.

### Deliverables
- [x] One explicit policy surface that owns every current policy-like lifecycle seam, including `tool.definition` and pre-compaction capture.
- [x] Named policy units under `src/application/policy/*` for Pattern restrictions, rules lookup, write guarding, context-window monitoring, todo lifecycle, verification reminders, and compaction recovery/preservation.
- [x] `src/runtime/opencode/plugin-adapter.ts` and `src/runtime/opencode/event-router.ts` reduced to translation/delegation only, with no second enforcement path.
- [x] Targeted unit, integration, and e2e regressions proving behavior is unchanged after each slice.
- [x] Explicit closure notes for blueprint TODO 5, DoD 73, and Guardrail 80.

### Definition of Done
- [x] `bun test src/application/policy/*.test.ts test/integration/policy-engine.integration.test.ts`
- [x] `bun test test/e2e/pattern-guard.e2e.test.ts test/e2e/auto-pause.e2e.test.ts`
- [x] `bun test`
- [x] `bun run typecheck`
- [x] `bun run build`
- [x] `rg "todoDescriptionOverride|compactionPreserver|todoContinuationEnforcer|patternMdOnly|checkContextWindow|shouldInjectRules|getRulesForFile|writeGuard" src/runtime/opencode/plugin-adapter.ts src/runtime/opencode/event-router.ts` shows no direct enforcement path outside policy composition/wiring.

### Guardrails (Must NOT)
- [x] Must NOT introduce any new policy execution path outside `src/application/policy/*` once the engine owns the lifecycle seams.
- [x] Must NOT change user-visible blocking text, continuation text, or reminder text unless tests are intentionally updated to match identical behavior.
- [x] Must NOT change idle ownership semantics or reorder workflow/work/todo behavior during the refactor.
- [x] Must NOT mix broader plan/workflow domain extraction into this slice.
- [x] Must NOT “improve” currently-unused rule behavior (for example rules injection side effects) as part of the centralization refactor.

## TODOs

- [x] 1. Phase 1A — Extend PolicyEngine to cover the remaining policy lifecycle seams
  **What**: Add the missing lifecycle contracts needed to remove adapter bypasses: central handling for `tool.definition`, pre-compaction capture, and chat-message todo re-arm. Keep the change narrow: expand the runtime policy surface first, without changing rule behavior.
  **Files**: `src/application/policy/runtime-policy.ts`, `src/application/policy/policy-engine.ts`, `src/application/orchestration/session-runtime.ts`, `src/domain/policy/policy-result.ts`
  **Acceptance**: `plugin-adapter.ts` can delegate `tool.definition`, `experimental.session.compacting`, and chat-message finalization re-arm through one `lifecyclePolicy` object instead of calling hook helpers directly.

- [x] 2. Phase 1B — Move tool-definition policy behind the engine
  **What**: Route todo description override through the new policy seam so `tool.definition` is treated like every other lifecycle policy surface. Preserve the existing description text and enablement behavior.
  **Files**: `src/application/policy/tool-definition-policy.ts`, `src/application/policy/policy-engine.ts`, `src/application/orchestration/session-runtime.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/hooks/todo-description-override.ts`, `src/plugin/plugin-interface.test.ts`
  **Acceptance**: `plugin-adapter.ts` no longer calls `hooks.todoDescriptionOverride` directly; `tool.definition` behavior still passes through the existing integration tests unchanged.

- [x] 3. Phase 2A — Replace hook-backed tool enforcement with named tool policy units
  **What**: Split Pattern write restriction, rules lookup, and write-guard tracking into explicit tool-policy units composed under `src/application/policy/tool-policy.ts`. Keep the existing hook files as pure helper libraries during the transition, but stop reading executable policy callbacks from `CreatedHooks`.
  **Files**: `src/application/policy/tool-policy.ts`, `src/application/policy/pattern-tool-policy.ts`, `src/application/policy/rules-tool-policy.ts`, `src/application/policy/write-guard-tool-policy.ts`, `src/hooks/pattern-md-only.ts`, `src/hooks/rules-injector.ts`, `src/hooks/write-existing-file-guard.ts`, `src/application/policy/tool-policy.test.ts`
  **Acceptance**: `tool-policy.ts` no longer references `input.hooks.patternMdOnly`, `input.hooks.shouldInjectRules`, `input.hooks.getRulesForFile`, or `input.hooks.writeGuard`; Pattern blocking text and read-tracking behavior remain unchanged; `bun test src/application/policy/tool-policy.test.ts test/e2e/pattern-guard.e2e.test.ts` passes.

- [x] 4. Phase 2B — Extract assistant/session policies into explicit modules
  **What**: Move context-window monitoring, todo finalization cleanup, verification reminder assembly, compaction snapshot/restore, and compaction recovery into dedicated session/assistant policy units. If `FINALIZE_TODOS_MARKER` still couples runtime parsing to a hook file, relocate that constant to a neutral runtime/policy module as part of this slice.
  **Files**: `src/application/policy/session-policy.ts`, `src/application/policy/context-window-session-policy.ts`, `src/application/policy/todo-session-policy.ts`, `src/application/policy/verification-session-policy.ts`, `src/application/policy/compaction-session-policy.ts`, `src/runtime/opencode/command-envelope.ts`, `src/runtime/opencode/protocol.ts`, `src/hooks/context-window-monitor.ts`, `src/hooks/todo-continuation-enforcer.ts`, `src/hooks/verification-reminder.ts`, `src/hooks/compaction-todo-preserver.ts`, `src/hooks/compaction-recovery.ts`, `src/application/policy/session-policy.test.ts`
  **Acceptance**: `session-policy.ts` becomes composition-only; context-window, todo lifecycle, verification reminder, and compaction behavior are invoked through named policy units; `bun test src/application/policy/session-policy.test.ts src/hooks/context-window-monitor.test.ts src/hooks/verification-reminder.test.ts` passes.

- [x] 5. Phase 3A — Make idle ordering explicit inside the session policy pipeline
  **What**: Move the current idle ordering contract out of split hook/orchestration helpers and document it in one place: workflow continuation first, then plan continuation, then todo finalization, then verification reminder/no-op. Preserve current pause and ownership semantics exactly.
  **Files**: `src/application/orchestration/idle-cycle-service.ts`, `src/application/orchestration/execution-coordinator.ts`, `src/application/policy/session-policy.ts`, `src/application/policy/policy-engine.test.ts`, `test/e2e/auto-pause.e2e.test.ts`
  **Acceptance**: One session-policy path owns idle sequencing; the host-level auto-pause and continuation behavior remains unchanged; `bun test src/application/policy/policy-engine.test.ts test/e2e/auto-pause.e2e.test.ts` passes.

- [x] 6. Phase 3B — Trim `create-hooks.ts` down to config/state assembly
  **What**: Remove executable policy ownership from `CreatedHooks` so the hook factory exposes only enablement, thresholds, continuation config, analytics flags, and any stateful helper dependencies that the policy layer still needs. Keep backward-compatible helper exports, but stop making `CreatedHooks` the owner of policy decisions.
  **Files**: `src/hooks/create-hooks.ts`, `src/hooks/create-hooks.test.ts`, `src/application/orchestration/session-runtime.ts`, `src/application/policy/chat-policy.ts`, `src/application/policy/tool-policy.ts`, `src/application/policy/session-policy.ts`
  **Acceptance**: `createRuntimeLifecyclePolicySurface()` assembles policy units directly; `CreatedHooks` is no longer the source of executable Pattern/rules/context-window/verification policy logic; `bun test src/hooks/create-hooks.test.ts test/integration/policy-engine.integration.test.ts` passes.

- [x] 7. Phase 4A — Remove the remaining split policy path from the adapter and event router
  **What**: Delete direct policy helper instantiation/calls from `plugin-adapter.ts` and `event-router.ts`, and leave those files with only input translation, `lifecyclePolicy` delegation, and effect application. This is the guardrail-closing slice.
  **Files**: `src/runtime/opencode/plugin-adapter.ts`, `src/runtime/opencode/event-router.ts`, `src/runtime/opencode/plugin-adapter-runtime-state.test.ts`, `test/integration/policy-engine.integration.test.ts`
  **Acceptance**: `plugin-adapter.ts` and `event-router.ts` no longer instantiate or invoke policy helpers directly; all lifecycle policy behavior flows through `lifecyclePolicy`; `bun test test/integration/policy-engine.integration.test.ts src/runtime/opencode/plugin-adapter-runtime-state.test.ts` passes.

- [x] 8. Phase 4B — Backfill the regression net that proves the blueprint items are closed
  **What**: Add focused tests for policy composition, ordering, tool-definition routing, compaction routing, and adapter delegation so each prior slice can land independently and the final refactor is provably behavior-preserving.
  **Files**: `src/application/policy/tool-policy.test.ts`, `src/application/policy/session-policy.test.ts`, `src/application/policy/policy-engine.test.ts`, `test/integration/policy-engine.integration.test.ts`, `test/e2e/pattern-guard.e2e.test.ts`, `test/e2e/auto-pause.e2e.test.ts`, `src/plugin/plugin-interface.test.ts`
  **Acceptance**: Every migrated policy concern has at least one direct unit/integration assertion plus one lifecycle-level assertion where needed; the final verification suite demonstrates closure of blueprint TODO 5, DoD 73, and Guardrail 80.

## Verification
- [x] All tests pass
- [x] No regressions
- [x] `bun test src/application/policy/*.test.ts test/integration/policy-engine.integration.test.ts`
- [x] `bun test test/e2e/pattern-guard.e2e.test.ts test/e2e/auto-pause.e2e.test.ts`
- [x] `bun test`
- [x] `bun run typecheck`
- [x] `bun run build`
- [x] `rg "todoDescriptionOverride|compactionPreserver|todoContinuationEnforcer|patternMdOnly|checkContextWindow|shouldInjectRules|getRulesForFile|writeGuard" src/runtime/opencode/plugin-adapter.ts src/runtime/opencode/event-router.ts` confirms no second direct enforcement path remains outside `src/application/policy/*`
