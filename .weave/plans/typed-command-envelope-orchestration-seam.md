# Typed Command Envelope and Orchestration Seam Slice

## TL;DR
> **Summary**: Land the first real runtime seam by introducing a typed command/continuation protocol, effect-based adapter delegation, and a shared idle/execution coordinator that removes the highest-risk branching from `src/plugin/plugin-interface.ts` without changing `.weave` storage formats.
> **Estimated Effort**: Medium

## Context
### Original Request
Create an implementation-ready plan for the next concrete architecture slice in Weave, prioritizing a typed command envelope for built-in commands/continuations, runtime effect types with a thin adapter seam, extraction of execution coordination / idle-loop ownership into a shared orchestration service, and deferring policy centralization until those seams exist.

### Key Findings
- `src/plugin/plugin-interface.ts` is still the orchestration hotspot at ~744 lines and directly owns command detection, agent switching, continuation injection, analytics finalization, auto-pause, workflow precedence, and tool-policy checks.
- Built-in routing is still brittle: `/start-work` vs `/run-workflow` is separated by incidental prompt text (`"workflow engine will inject context"`, `<session-context>`, `<command-instruction>`) rather than a typed protocol.
- `src/hooks/create-hooks.ts` still exposes feature-specific callbacks, so `plugin-interface.ts` orchestrates behavior instead of delegating to a runtime boundary.
- Plan and workflow persistence are already separate and should stay separate for now: `.weave/state.json` for plan execution and `.weave/workflows/*` for workflow instances.
- The host-simulation harness already covers `/start-work`, idle continuation, interrupts, execution ownership, and session finalization, so this slice can be driven by real plugin-lifecycle regression tests instead of a big-bang rewrite.

### Why This Slice Now
- It attacks the current failure mode directly: order-sensitive routing and idle ownership are still trapped inside one adapter file.
- It creates reusable seams for later policy centralization without forcing an immediate domain/storage rewrite.
- It is vertically sliceable: command protocol, effect adapter, and idle coordination can land behind compatibility shims while existing work-state and workflow modules keep their current storage semantics.

### Risks and Rollback Notes
- New prompt envelope markers could break command detection if introduced all at once. **Rollback**: make parsers dual-read legacy markers and new typed envelope payloads until all call sites are migrated.
- Extracting idle ownership can cause duplicate `promptAsync()` injections. **Rollback**: keep legacy hook functions intact and route them through the new coordinator one lifecycle surface at a time.
- Workflow behavior is already semi-legacy and should not be expanded. **Compatibility note**: preserve current workflow storage and command surface, but keep the extracted coordinator neutral so workflows can later be deprecated or replaced without re-expanding `plugin-interface.ts`.

## Objectives
### Core Objective
Move Weave onto a typed runtime path for command handling and idle orchestration, with `plugin-interface.ts` acting as an adapter that applies effects rather than owning business branching.

### Deliverables
- [ ] Typed envelope/parser for built-in commands and continuation prompts.
- [ ] Runtime effect model plus adapter/application seam used by `plugin-interface.ts`.
- [ ] Shared execution coordinator + idle-cycle service that owns plan/workflow precedence.
- [ ] Regression coverage in the existing host-simulation harness for command routing and idle ownership.
- [ ] A clean follow-on seam for PolicyEngine work, without centralizing policies in this slice.

### Definition of Done
- [ ] `src/plugin/plugin-interface.ts` no longer decides `/start-work` vs `/run-workflow` via ad hoc substring checks.
- [ ] Built-in command parsing and continuation parsing go through a typed protocol module.
- [ ] Idle-loop ownership is decided in one orchestration service, not via branching order inside `plugin-interface.ts`.
- [ ] Existing `.weave/state.json`, `.weave/plans/*`, and `.weave/workflows/*` remain readable with no migration required.
- [ ] `bun test test/e2e/start-work-runtime.e2e.test.ts test/e2e/execution-ownership.e2e.test.ts` passes with the new path enabled.
- [ ] `bun test` and `bun run build` pass after the seam extraction.

### Guardrails (Must NOT)
- [ ] Must NOT do a big-bang rewrite of plan/workflow internals.
- [ ] Must NOT change on-disk plan or workflow authoring formats in this slice.
- [ ] Must NOT add more lifecycle branching to `src/plugin/plugin-interface.ts`.
- [ ] Must NOT centralize policy logic yet; only expose the seam needed for the next slice.
- [ ] Must NOT rely on live model behavior for regression confidence when host-simulated e2e can cover it.

### Review Recommendation
- [ ] Get a short Warp/Weft architecture review before execution starts.
  **Why**: The command envelope and effect contracts become the migration seam for every later slice; agreeing on them once will prevent churn across runtime, tests, and future PolicyEngine work.
  **Recommended scope**: review the protocol schema, effect union, and ownership rules before Phase 1 code lands.

## TODOs

- [x] 1. Introduce the typed built-in command and continuation protocol
  **What**: Define a protocol module that can parse built-in command payloads and system continuations into a typed union. Update built-in templates so `/start-work` and `/run-workflow` carry an explicit machine-readable envelope while preserving current user-visible instructions. Add typed request forms for `metrics`, `token-report`, and `weave-health` so command routing no longer depends on incidental prompt text.
  **Files**: `src/runtime/opencode/protocol.ts`, `src/runtime/opencode/command-envelope.ts`, `src/runtime/opencode/command-envelope.test.ts`, `src/features/builtin-commands/commands.ts`, `src/features/builtin-commands/templates/start-work.ts`, `src/features/builtin-commands/templates/run-workflow.ts`, `src/hooks/work-continuation.ts`, `src/features/workflow/hook.ts`, `src/hooks/todo-continuation-enforcer.ts`, `test/testkit/host/fake-opencode-host.ts`
  **Acceptance**: A single parser returns typed envelopes for `/start-work`, `/run-workflow`, `metrics`, `token-report`, `weave-health`, work continuation, workflow continuation, and todo-finalize prompts; the parser accepts both new envelopes and legacy markers during migration.
  **Test Strategy**: Add unit tests for protocol parsing and round-trip template coverage; extend the fake host with a generic built-in command sender and a `/run-workflow` helper so protocol assertions happen through real plugin entrypoints.

- [x] 2. Add runtime effect types and make `plugin-interface.ts` delegate through a thin adapter
  **What**: Create a small effect system and adapter entrypoint so `plugin-interface.ts` translates OpenCode input into typed runtime requests, then applies returned effects (`switchAgent`, `appendPromptText`, `injectPromptAsync`, `pauseExecution`, `trackAnalytics`, `appendCommandOutput`). Keep existing hook implementations and feature modules intact, but call them through a router/facade rather than directly from the plugin adapter.
  **Files**: `src/runtime/opencode/effects.ts`, `src/runtime/opencode/apply-effects.ts`, `src/runtime/opencode/event-router.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/application/commands/command-router.ts`, `src/application/commands/start-work-command.ts`, `src/application/commands/run-workflow-command.ts`, `src/application/commands/metrics-command.ts`, `src/application/commands/token-report-command.ts`, `src/application/commands/weave-health-command.ts`, `src/hooks/create-hooks.ts`, `src/index.ts`, `src/plugin/plugin-interface.ts`, `src/plugin/plugin-interface.test.ts`
  **Acceptance**: `plugin-interface.ts` becomes an adapter shell that delegates chat/event/command handling to runtime services and effect application helpers; direct mutation logic is reduced to applying typed effects to OpenCode output/client objects.
  **Test Strategy**: Add focused adapter tests that assert effect application behavior without re-testing feature internals; keep current `plugin-interface.test.ts` coverage but shift new cases toward protocol/effect tests rather than inline branching tests.

- [x] 3. Extract idle-loop ownership into a shared orchestration service
  **What**: Introduce a coordinator that determines active execution semantics (`none | plan | workflow`) and owns idle behavior, interrupt handling, and user-message auto-pause decisions. In this slice, use existing work-state and workflow persistence as the source of truth rather than adding a new `.weave` ownership file. The coordinator should call existing plan/workflow continuation functions behind a single precedence rule so `plugin-interface.ts` no longer relies on branch order.
  **Files**: `src/application/orchestration/execution-coordinator.ts`, `src/application/orchestration/idle-cycle-service.ts`, `src/application/orchestration/session-runtime.ts`, `src/hooks/start-work-hook.ts`, `src/hooks/work-continuation.ts`, `src/features/workflow/hook.ts`, `src/features/workflow/commands.ts`, `src/plugin/plugin-interface.ts`, `test/e2e/start-work-runtime.e2e.test.ts`, `test/e2e/execution-ownership.e2e.test.ts`, `test/e2e/session-finalization.e2e.test.ts`
  **Acceptance**: One service decides whether workflow continuation, plan continuation, todo finalization, or pause behavior runs for a given lifecycle event; restarting/resuming plans and active workflow precedence still behave exactly as current host-simulated tests expect.
  **Test Strategy**: Expand the existing e2e suites to cover coordinator-owned behavior, especially workflow-over-plan precedence, interrupt suppression, and normal-user-message auto-pause; prefer host-simulated assertions on `promptAsync()` over unit-only verification.

- [x] 4. Leave a clean handoff seam for PolicyEngine centralization
  **What**: After the adapter and coordinator seams land, identify the lifecycle hook points that the next slice will consume (`onChatMessage`, `beforeTool`, `afterTool`, `onSessionIdle`, `onSessionDeleted`, `onCompaction`). Do not centralize policy behavior yet; only ensure the runtime seams can host one engine later without reopening command or idle routing.
  **Files**: `src/runtime/opencode/event-router.ts`, `src/application/orchestration/session-runtime.ts`, `src/plugin/plugin-interface.ts`, `.weave/plans/weave-target-architecture-testing-blueprint.md`
  **Acceptance**: The extracted runtime surfaces expose obvious insertion points for future policy composition, and no new policy-specific branching is added to `plugin-interface.ts` during this slice.
  **Test Strategy**: Verify existing tool/session tests still pass unchanged; no new policy behavior should be required to validate this slice.

- [x] 5. Run compatibility and regression verification before merging
  **What**: Validate that the new runtime path preserves current user-facing behavior and `.weave` compatibility while materially shrinking adapter responsibility.
  **Files**: `test/e2e/start-work-runtime.e2e.test.ts`, `test/e2e/execution-ownership.e2e.test.ts`, `test/e2e/session-finalization.e2e.test.ts`, `src/runtime/opencode/command-envelope.test.ts`, `src/plugin/plugin-interface.ts`
  **Acceptance**: Legacy plan/workflow state remains readable, no duplicate continuation prompts appear, and `plugin-interface.ts` no longer contains command-routing substring checks for start-work/workflow discrimination.
  **Test Strategy**: Run targeted host-harness suites first, then full `bun test`, then `bun run build`; inspect failures for protocol fallback regressions before removing any legacy parsing path.

## Verification
- [x] All tests pass
- [x] No regressions
- [x] `bun test test/e2e/start-work-runtime.e2e.test.ts test/e2e/execution-ownership.e2e.test.ts test/e2e/session-finalization.e2e.test.ts`
- [x] `bun test src/runtime/opencode/command-envelope.test.ts src/plugin/plugin-interface.test.ts`
- [x] `bun test`
- [x] `bun run build`
- [x] `src/plugin/plugin-interface.ts` is adapter-first and free of `/start-work` vs `/run-workflow` substring routing
