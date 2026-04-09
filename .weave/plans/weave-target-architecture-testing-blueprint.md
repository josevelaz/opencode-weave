# Weave Target Architecture and Testing Blueprint

## TL;DR
> **Summary**: Re-center Weave around a thin OpenCode adapter, a typed orchestration/application layer, and separate but coordinated plan/workflow execution modules. Pair that refactor with a real host-simulation test harness so plugin lifecycle, idle-loop ownership, command routing, policy enforcement, and persistence are exercised end-to-end without depending on a live LLM.
> **Estimated Effort**: XL

## Progress Update (2026-04-09)
- [x] Host-simulation harness landed under `test/testkit/host/*` and `test/testkit/fixtures/*`.
- [x] The old omnibus regression file was split into focused `test/e2e/*` and `test/integration/*` suites.
- [x] End-to-end coverage now exists for `/start-work` runtime flow, interrupt suppression, execution ownership behavior, and session finalization.
- [ ] Pattern tool-guard e2e coverage is still pending.
- [ ] Runtime extraction / typed command envelope work has not started yet.
- [ ] `plugin-interface.ts` is still the orchestration hotspot; the current checkpoint is primarily test infrastructure and regression coverage.

## Context
### Original Request
Design a concrete, opinionated target architecture and testing blueprint for the Weave codebase at `/Users/pgermishuys/source/weave`, tailored to the current plugin-centered architecture around `src/plugin/plugin-interface.ts`, with explicit guidance on layers, module boundaries, runtime flow, plans vs workflows, test pyramid, a host simulation harness, high-value e2e scenarios, phased refactoring, risks, and success criteria.

### Key Findings
- `src/plugin/plugin-interface.ts` is the orchestration hotspot: it owns command detection, agent switching, event handling, continuation injection, analytics, pause/resume, tool guards, and command-side data injection in one file.
- Current routing is brittle because it depends on prompt substring checks like `promptText.includes("workflow engine will inject context")` and generic `<session-context>` / `<command-instruction>` markers instead of a single typed command envelope.
- Plans and workflows are implemented as parallel systems today:
  - Plans: `src/hooks/start-work-hook.ts` + `src/features/work-state/*` backed by `.weave/state.json` and markdown checkbox progress.
  - Workflows: `src/features/workflow/*` backed by `.weave/workflows/*` and a step-state machine.
- Both execution models compete for the same plugin lifecycle and idle loop, which is why `plugin-interface.ts` contains ordering-sensitive logic for workflow continuation vs work continuation vs todo finalization.
- Policy enforcement is scattered across hooks and inline plugin code (`pattern-md-only`, write guard, rules injection, verification reminders, context-window checks, todo protections) rather than composed through one policy pipeline.
- The repo already has strong file-I/O integration tests (`src/workflow.test.ts`, `src/workflow-engine.test.ts`, `src/plugin/plugin-interface.test.ts`), but there is no dedicated fake OpenCode host that simulates the full plugin lifecycle with deterministic events, captured `promptAsync()` injections, and session state transitions.
- Bootstrapping is already reasonably clean in `src/index.ts`; the biggest payoff is not a total rewrite but extracting runtime seams so `index.ts` builds a runtime and the OpenCode adapter delegates into it.
- Recommended target principles for this repo:
  - Keep the OpenCode-facing layer thin and dumb.
  - Replace ad hoc string routing with one machine-readable Weave command/event envelope.
  - Unify orchestration semantics, not authoring formats: plans stay markdown checklists; workflows stay state-machine definitions.
  - Centralize policy decisions behind a `PolicyEngine`.
  - Make idle-loop ownership explicit and persisted.
  - Treat end-to-end host simulation as a first-class product surface, not a test afterthought.
- Recommended target module split:
  - **Runtime adapter**: translate OpenCode hooks/events into typed internal requests.
  - **Application/orchestration**: command routing, session coordination, idle-cycle ownership, continuation dispatch.
  - **Domain modules**: plans, workflows, policies, sessions, analytics.
  - **Infrastructure**: filesystem repositories, OpenCode client bridge, config loading.
  - **Agents/prompts**: remain separate and mostly unchanged, consumed by orchestration rather than owning orchestration.
- Recommended event model:
  - OpenCode event -> `RuntimeEventRouter` -> typed internal event -> `SessionRuntime` / `ExecutionCoordinator` / `PolicyEngine` -> returned effects (`switchAgent`, `injectPrompt`, `persistState`, `recordAnalytics`) -> adapter applies effects to OpenCode.
- Recommendation on plans vs workflows:
  - **Do not fully unify them into one storage/authoring model.**
  - **Do unify** command routing, active-execution ownership, session lifecycle, continuation dispatch, and policy enforcement behind shared orchestration contracts.
  - Tradeoff: this preserves markdown-plan simplicity while removing duplicated runtime control logic.
- Recommended target folder structure:
  - `src/runtime/opencode/*` for the plugin adapter and protocol parsing.
  - `src/application/orchestration/*`, `src/application/commands/*`, `src/application/policy/*` for orchestration logic.
  - `src/domain/plans/*`, `src/domain/workflows/*`, `src/domain/session/*`, `src/domain/analytics/*` for business logic.
  - `src/infrastructure/fs/*`, `src/infrastructure/opencode/*` for concrete implementations.
  - `test/testkit/*`, `test/integration/*`, `test/e2e/*` for stronger integration/e2e separation.

## Objectives
### Core Objective
Define a target architecture that removes orchestration from `src/plugin/plugin-interface.ts`, replaces marker-based branching with typed runtime contracts, makes plan/workflow interaction explicit, and establishes a testing system that gives high confidence in real plugin behavior.

### Deliverables
- [ ] A target layered architecture for Weave with named modules, concrete paths, and explicit boundaries.
- [ ] A runtime/event model that shows how OpenCode hooks and events flow through the system and who owns continuation, routing, and policy decisions.
- [ ] A plan/workflow strategy that shares orchestration semantics without forcing one authoring model.
- [ ] A testing blueprint with a practical host-simulation harness and prioritized e2e scenarios.
- [ ] A phased refactoring roadmap with migration guidance, risks, and measurable architecture-improvement signals.

### Definition of Done
- [ ] `src/plugin/plugin-interface.ts` is reduced to an adapter that applies effects and contains no plan/workflow business branching.
- [ ] Command detection no longer depends on free-form substrings like `"workflow engine will inject context"`; one typed envelope/parser owns command routing.
- [ ] Plan execution and workflow execution both run through a shared orchestration entry point with explicit idle-loop ownership.
- [ ] Policy hooks run through one composed pipeline instead of scattered inline checks.
- [ ] `bun test` covers unit, integration, and host-simulated e2e suites, including plugin lifecycle and `promptAsync()` assertions.
- [ ] At least one regression in each of these categories is covered end-to-end: command routing, idle continuation, plan/workflow collision handling, tool guard enforcement, and analytics/session finalization.

### Guardrails (Must NOT)
- [ ] Must NOT collapse plans into workflow JSON or remove markdown checklist plans.
- [ ] Must NOT keep adding business logic to `src/plugin/plugin-interface.ts` once orchestration seams exist.
- [ ] Must NOT introduce a second policy path outside the central `PolicyEngine`.
- [ ] Must NOT rely on live model inference for core e2e confidence.
- [ ] Must NOT break existing on-disk compatibility for `.weave/state.json`, `.weave/plans/*`, or `.weave/workflows/*` during early phases.

## TODOs

- [ ] 1. Establish the target runtime boundary and command protocol
  **What**: Make the OpenCode-facing layer a translation adapter only. Introduce a single machine-readable Weave envelope for built-in commands and system continuations so routing is centralized instead of being inferred from incidental text. The target is: `index.ts` builds a runtime, `plugin-interface.ts` delegates into an adapter/router, and only the runtime knows business rules.
  - Target principles:
    - `plugin-interface.ts` may translate OpenCode input/output, but must not decide plan/workflow behavior.
    - A single parser owns Weave command detection for `/start-work`, `/run-workflow`, `/metrics`, `/token-report`, and `/weave-health`.
    - Continuation markers, command markers, and injected prompts live in one protocol module.
  - Runtime effects to standardize:
    - `SwitchAgentEffect`
    - `InjectPromptEffect`
    - `PersistStateEffect`
    - `TrackAnalyticsEffect`
    - `BlockToolEffect`
    - `AppendCommandOutputEffect`
  **Files**: `src/index.ts`, `src/plugin/plugin-interface.ts`, `src/runtime/opencode/plugin-adapter.ts`, `src/runtime/opencode/event-router.ts`, `src/runtime/opencode/command-envelope.ts`, `src/runtime/opencode/effects.ts`, `src/runtime/opencode/protocol.ts`, `src/features/builtin-commands/commands.ts`, `src/features/builtin-commands/templates/start-work.ts`, `src/features/builtin-commands/templates/run-workflow.ts`
  **Acceptance**: All built-in command detection goes through `command-envelope.ts`; `plugin-interface.ts` contains no direct `promptText.includes(...)` routing for start-work/workflow detection.

- [ ] 2. Introduce a shared orchestration/application layer
  **What**: Add an application layer that coordinates session lifecycle, command handling, idle-cycle progression, and effect production. Recommended services:
  - `src/application/orchestration/session-runtime.ts` — per-session message/event handling and transcript state.
  - `src/application/orchestration/execution-coordinator.ts` — owns active execution selection and pause/resume rules.
  - `src/application/orchestration/idle-cycle-service.ts` — single place that decides whether workflow continuation, plan continuation, or todo finalization runs.
  - `src/application/commands/command-router.ts` — dispatches typed command envelopes to handlers.
  - `src/application/commands/start-work-command.ts`
  - `src/application/commands/run-workflow-command.ts`
  - `src/application/commands/metrics-command.ts`
  - `src/application/commands/token-report-command.ts`
  - `src/application/commands/weave-health-command.ts`
  The coordinator should introduce explicit `ActiveExecution = none | plan | workflow` semantics so the idle loop no longer depends on ordering quirks spread across hooks.
  **Files**: `src/application/orchestration/session-runtime.ts`, `src/application/orchestration/execution-coordinator.ts`, `src/application/orchestration/idle-cycle-service.ts`, `src/application/commands/command-router.ts`, `src/application/commands/start-work-command.ts`, `src/application/commands/run-workflow-command.ts`, `src/application/commands/metrics-command.ts`, `src/application/commands/token-report-command.ts`, `src/application/commands/weave-health-command.ts`, `src/hooks/create-hooks.ts`
  **Acceptance**: One coordinator decides idle-loop ownership and command dispatch; `create-hooks.ts` returns adapter callables into the application layer rather than direct feature-specific functions.

- [ ] 3. Separate domain modules by responsibility, not by hook origin
  **What**: Move business logic into explicit domain modules with stable interfaces. Recommended split:
  - `src/domain/plans/*`
    - `plan-service.ts`
    - `plan-repository.ts` (interface)
    - `plan-progress.ts`
    - `plan-validation.ts`
    - `plan-selection.ts`
    - `plan-execution.ts`
  - `src/domain/workflows/*`
    - `workflow-service.ts`
    - `workflow-engine.ts`
    - `workflow-repository.ts` (interface)
    - `workflow-definition.ts`
    - `workflow-completion.ts`
    - `workflow-context.ts`
  - `src/domain/session/*`
    - `session-transcript-store.ts`
    - `session-event.ts`
    - `execution-lease.ts`
  - `src/domain/analytics/*`
    - `analytics-service.ts`
    - `metrics-service.ts`
  Keep existing plan/workflow behavior, but give both domains a shared orchestration contract such as `begin`, `resume`, `pause`, `onIdle`, and `onUserMessage`.
  **Files**: `src/domain/plans/plan-service.ts`, `src/domain/plans/plan-repository.ts`, `src/domain/plans/plan-progress.ts`, `src/domain/plans/plan-validation.ts`, `src/domain/plans/plan-selection.ts`, `src/domain/plans/plan-execution.ts`, `src/domain/workflows/workflow-service.ts`, `src/domain/workflows/workflow-engine.ts`, `src/domain/workflows/workflow-repository.ts`, `src/domain/workflows/workflow-definition.ts`, `src/domain/workflows/workflow-completion.ts`, `src/domain/workflows/workflow-context.ts`, `src/domain/session/session-transcript-store.ts`, `src/domain/session/session-event.ts`, `src/domain/session/execution-lease.ts`, `src/domain/analytics/analytics-service.ts`, `src/domain/analytics/metrics-service.ts`
  **Acceptance**: Plan/workflow logic is imported by the application layer through stable module interfaces; no domain module imports the OpenCode plugin types directly.

- [ ] 4. Keep plans and workflows separate in storage, but unify runtime ownership
  **What**: Preserve markdown plans and workflow instances as distinct domain concepts, but introduce one shared runtime contract and one persisted ownership record to remove dual-model ambiguity.
  - Recommendation:
    - Keep `.weave/state.json` for active plan state.
    - Keep `.weave/workflows/*` for workflow instances.
    - Add a lightweight execution ownership record such as `.weave/runtime/active-execution.json` to declare which execution currently owns the idle loop.
  - Why this recommendation fits Weave:
    - Plans are author-facing checklists created by Pattern and executed by Tapestry.
    - Workflows are orchestrator-authored, typed step machines with gates and artifacts.
    - Full unification would blur user-facing planning with orchestration state and slow adoption.
  - Tradeoffs:
    - **Recommended approach**: shared coordinator + separate persistence. Best migration path, lowest authoring disruption.
    - **Rejected for now**: converting plans into workflow steps. Too invasive and loses checklist UX.
    - **Rejected for now**: leaving them entirely separate. Preserves current hotspot and idle-loop conflicts.
  **Files**: `src/application/orchestration/execution-coordinator.ts`, `src/domain/session/execution-lease.ts`, `src/infrastructure/fs/execution-lease-fs-store.ts`, `src/features/work-state/storage.ts`, `src/features/workflow/storage.ts`, `.weave/runtime/active-execution.json`
  **Acceptance**: Plan/workflow collision handling depends on an explicit execution owner record, not implicit event ordering inside `plugin-interface.ts`.

- [ ] 5. Centralize policy enforcement behind a PolicyEngine
  **What**: Gather tool guards, rules injection, write tracking, pattern markdown restrictions, todo protections, verification reminders, and context-window checks into one composed policy system with well-defined hook points: `onChatMessage`, `beforeTool`, `afterTool`, `onSessionIdle`, `onSessionDeleted`, `onCompaction`. Recommended modules:
  - `src/application/policy/policy-engine.ts`
  - `src/application/policy/chat-policy.ts`
  - `src/application/policy/tool-policy.ts`
  - `src/application/policy/session-policy.ts`
  - `src/domain/policy/policy-result.ts`
  Existing hook implementations should either move under this package or become thin wrappers around policy rules.
  **Files**: `src/application/policy/policy-engine.ts`, `src/application/policy/chat-policy.ts`, `src/application/policy/tool-policy.ts`, `src/application/policy/session-policy.ts`, `src/domain/policy/policy-result.ts`, `src/hooks/write-existing-file-guard.ts`, `src/hooks/rules-injector.ts`, `src/hooks/pattern-md-only.ts`, `src/hooks/context-window-monitor.ts`, `src/hooks/todo-continuation-enforcer.ts`, `src/hooks/verification-reminder.ts`
  **Acceptance**: The runtime invokes one policy engine per lifecycle phase; no new policy logic is added directly in the plugin adapter.

- [ ] 6. Normalize infrastructure boundaries and filesystem repositories
  **What**: Move direct filesystem work out of orchestration modules into infrastructure adapters so tests can swap real FS for controlled fakes when needed. Recommended repositories/adapters:
  - `src/infrastructure/fs/plan-fs-repository.ts`
  - `src/infrastructure/fs/workflow-fs-repository.ts`
  - `src/infrastructure/fs/work-state-fs-store.ts`
  - `src/infrastructure/fs/analytics-fs-store.ts`
  - `src/infrastructure/fs/config-fs-loader.ts`
  - `src/infrastructure/opencode/session-client.ts`
  This also creates the seam needed for a proper host-simulation harness.
  **Files**: `src/infrastructure/fs/plan-fs-repository.ts`, `src/infrastructure/fs/workflow-fs-repository.ts`, `src/infrastructure/fs/work-state-fs-store.ts`, `src/infrastructure/fs/analytics-fs-store.ts`, `src/infrastructure/fs/config-fs-loader.ts`, `src/infrastructure/opencode/session-client.ts`, `src/config/loader.ts`, `src/features/analytics/storage.ts`, `src/features/work-state/storage.ts`, `src/features/workflow/storage.ts`
  **Acceptance**: Application/domain services depend on repository interfaces; direct `fs` access is concentrated in infrastructure modules.

- [ ] 7. Build the testing pyramid around real seams
  **What**: Adopt an explicit pyramid and move tests to match it.
  - **Unit / domain tests**
    - Focus: pure plan selection/progress, workflow transitions, completion detectors, command envelope parsing, execution-lease decisions, policy rule outputs.
    - Style: fast, no filesystem unless the domain contract explicitly requires it.
    - Suggested locations: co-located under new domain/application modules.
  - **Integration tests**
    - Focus: filesystem repositories, config loading/merging, command handlers with real temp directories, analytics persistence, policy-engine composition.
    - Suggested locations: `test/integration/**`.
  - **End-to-end tests**
    - Focus: plugin bootstrap from `src/index.ts`, OpenCode lifecycle events, agent switching, `promptAsync` injection, idle-loop behavior, session deletion, and command templates.
    - Suggested locations: `test/e2e/**`.
  - Suggested target ratio:
    - ~60% unit/domain
    - ~25% integration
    - ~15% host-simulated e2e
  - Progress update:
    - Added `test/e2e/README.md` and `test/integration/README.md`.
    - Split the former omnibus regression coverage into focused suites:
      - `test/e2e/start-work-runtime.e2e.test.ts`
      - `test/e2e/execution-ownership.e2e.test.ts`
      - `test/e2e/session-finalization.e2e.test.ts`
      - `test/integration/plugin-bootstrap.integration.test.ts`
      - `test/integration/custom-workflow-bootstrap.integration.test.ts`
      - `test/integration/analytics-storage.integration.test.ts`
      - `test/integration/manager-config.integration.test.ts`
    - Unit/domain expansion is still pending and this item should remain open until the broader pyramid is in place.
  **Files**: `package.json`, `test/integration/README.md`, `test/e2e/README.md`, `src/domain/**/*.test.ts`, `test/integration/**/*.test.ts`, `test/e2e/**/*.test.ts`
  **Acceptance**: Every new orchestration bug fix requires at least one integration or e2e regression test, not only a unit test.

- [x] 8. Create a host-simulation e2e harness for plugin lifecycle testing
  **What**: Add a fake OpenCode host that instantiates `WeavePlugin`, feeds hooks/events in realistic order, captures output mutations, and records `client.session.promptAsync()` injections. The harness should support:
  - creating/deleting sessions
  - sending user chat messages
  - emitting `message.part.updated`, `message.updated`, `session.idle`, `tui.command.execute`, `session.deleted`
  - running built-in commands with realistic command templates
  - observing switched agents, appended command output, blocked tools, analytics writes, and injected continuations
  - deterministic time/ID helpers for stable snapshots
  Recommended harness modules:
  - `test/testkit/host/fake-opencode-host.ts`
  - `test/testkit/host/fake-plugin-client.ts`
  - `test/testkit/fixtures/project-fixture.ts`
  - `test/testkit/assertions/effects.ts`
  The fake client should store every `promptAsync()` call so tests can assert exact continuation prompts and agents.
  - Progress update:
    - Implemented:
      - `test/testkit/host/fake-opencode-host.ts`
      - `test/testkit/host/fake-plugin-client.ts`
      - `test/testkit/fixtures/project-fixture.ts`
      - `test/testkit/plugin-context.ts`
    - Current host helpers cover:
      - plugin boot from `src/index.ts`
      - user chat messages and `/start-work`
      - `session.idle`, `tui.command.execute`, `session.deleted`
      - `message.updated`, `message.part.updated`
      - `chat.params`
      - `tool.execute.before` / `tool.execute.after`
  **Files**: `test/testkit/host/fake-opencode-host.ts`, `test/testkit/host/fake-plugin-client.ts`, `test/testkit/fixtures/project-fixture.ts`, `test/testkit/assertions/effects.ts`, `test/e2e/plugin-lifecycle.e2e.test.ts`, `test/e2e/plan-workflow-collision.e2e.test.ts`, `test/e2e/tool-policy.e2e.test.ts`
  **Acceptance**: A test can bootstrap the plugin from `src/index.ts`, simulate a session lifecycle end-to-end, and assert on both hook outputs and captured `promptAsync()` side effects without shelling out to the real OpenCode CLI.

- [ ] 9. Implement the highest-value e2e scenarios first
  **What**: Prioritize scenarios that cover the current architectural pain points and likely regressions.
  - First-wave scenarios:
    - [x] `/start-work` routes to Tapestry and creates/resumes plan state.
    - [ ] `/run-workflow` starts a workflow, progresses on `session.idle`, and pauses/resumes cleanly. *(Likely to be deprecated; do not prioritize further investment.)*
    - [x] Execution ownership / collision behavior is covered for the currently supported plan flows.
    - [ ] A normal user message during active plan execution auto-pauses the plan and does not mis-handle continuation prompts. *(Internal logic exists, but true host-level reachability is currently unproven.)*
    - [ ] Pattern is blocked from writing non-`.md` files outside `.weave/`.
    - [x] Session deletion finalizes analytics and metrics generation when a plan completes.
    - [x] Interrupt (`session.interrupt`) pauses the active execution and suppresses duplicate continuation prompts.
  - Progress update:
    - Implemented current coverage in:
      - `test/e2e/start-work-runtime.e2e.test.ts`
      - `test/e2e/execution-ownership.e2e.test.ts`
      - `test/e2e/session-finalization.e2e.test.ts`
    - We intentionally skipped new `/run-workflow` e2e investment because that surface is expected to be deprecated.
  - Second-wave scenarios:
    - config diagnostics flow into `/weave-health`
    - metrics/token-report command injection
    - todo finalization after true idle
    - context-window threshold warnings
  **Files**: `test/e2e/start-work.e2e.test.ts`, `test/e2e/run-workflow.e2e.test.ts`, `test/e2e/execution-ownership.e2e.test.ts`, `test/e2e/auto-pause.e2e.test.ts`, `test/e2e/pattern-guard.e2e.test.ts`, `test/e2e/session-finalization.e2e.test.ts`, `test/e2e/interrupt.e2e.test.ts`
  **Acceptance**: The first-wave suite fails against known marker/ownership regressions and passes once the new runtime path is wired.

- [ ] 10. Refactor in phases with compatibility adapters and measurable health checks
  **What**: Refactor incrementally so architecture improves without a destabilizing big bang.
  - Phase 1: add command envelope + runtime effect types, keep existing behavior behind adapters.
  - Phase 2: extract `ExecutionCoordinator` and `IdleCycleService`, preserve current storage formats.
  - Phase 3: centralize policies behind `PolicyEngine` and delete inline checks from `plugin-interface.ts`.
  - Phase 4: move plan and workflow logic into domain/application modules and route old hooks through facades.
  - Phase 5: switch primary tests to the host harness, keep CLI smoke test as a thin external verification layer only.
  - Phase 6: remove legacy substring routing and dead compatibility branches.
  - Architecture health criteria to track over time:
    - `src/plugin/plugin-interface.ts` shrinks below ~150 lines.
    - Number of free-form `includes(...)` routing checks drops to zero for command detection.
    - All lifecycle decisions go through typed events/effects.
    - New regression tests are added at integration/e2e level before bug-fix completion.
    - Plan/workflow ownership bugs stop requiring order-sensitive fixes in the adapter layer.
  - Migration guidance:
    - Keep existing `.weave` formats readable until the new repositories are stable.
    - Introduce new modules behind facades first; only then rewrite call sites.
    - Run old and new tests in parallel during the transition.
    - Migrate one lifecycle surface at a time: command routing -> idle loop -> tool policies -> analytics/session finalization.
  **Files**: `src/plugin/plugin-interface.ts`, `src/index.ts`, `src/hooks/create-hooks.ts`, `src/features/work-state/*`, `src/features/workflow/*`, `src/hooks/*`, `test/e2e/*`, `test/integration/*`
  **Acceptance**: Each phase lands with compatibility preserved, adapter complexity reduced, and at least one new host-simulated regression test covering the migrated surface.

## Verification
- [ ] All tests pass
- [ ] No regressions
- [ ] `bun test` covers unit, integration, and host-simulated e2e paths
- [ ] `bun run build` succeeds after runtime/module extraction
- [ ] `src/plugin/plugin-interface.ts` is adapter-only and free of plan/workflow substring routing
- [ ] Plan/workflow collision behavior is validated by deterministic e2e tests, not only unit tests
