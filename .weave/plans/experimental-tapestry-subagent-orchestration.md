# Experimental Tapestry Subagent Orchestration

## TL;DR
> **Summary**: Add an opt-in `experimental.tapestry_subagent_orchestration` config flag that only changes Tapestry's prompt when enabled, allowing limited execution-time subagent orchestration while keeping today's default behavior unchanged.
> **Estimated Effort**: Medium

## Context
### Original Request
Create a reviewable implementation plan for adding an experimental config option that allows Tapestry to orchestrate subagents, while keeping default behavior unchanged. Include explicit guardrails against recursive/self delegation and note that the first version should be prompt-gated unless runtime enforcement is added later.

### Key Findings
- `src/agents/tapestry/prompt-composer.ts` currently hard-codes "During task execution, you work directly — no subagent delegation."
- Tapestry already uses the Task tool in `PostExecutionReview` for Weft/Warp after all plan checkboxes are complete, so the new feature must distinguish **execution-time delegation** from existing **terminal review delegation**.
- Tapestry prompt composition is currently parameterized only by `disabledAgents` and `continuation` (`src/agents/tapestry/index.ts`, `src/agents/builtin-agents.ts`, `src/create-managers.ts`).
- Experimental config is already a first-class top-level section in `src/config/schema.ts` and `schema/weave-config.schema.json`, making it the right place for this opt-in flag.
- Prompt eval variants only support `disabledAgents` today (`src/features/evals/types.ts`, `src/features/evals/schema.ts`, `src/features/evals/targets/builtin-agent-target.ts`), so enabled-path eval coverage needs a small variant extension.
- Multiple docs currently state that Tapestry never delegates (`README.md`, `docs/architecture.md`, `docs/agent-interactions.md`), so docs must be updated carefully to preserve the default invariant while documenting the experimental exception.

### Current State
- Default Tapestry behavior is direct execution with no execution-time delegation.
- `call_weave_agent` is explicitly denied for Tapestry, while Task-tool usage is only described for post-execution review.
- Existing prompt contracts and tests assume the default prompt contains "no subagent delegation" wording.

### Desired Behavior
- A new opt-in config flag enables an alternate Tapestry prompt path for experimental execution-time orchestration.
- When enabled, Tapestry may delegate narrowly scoped helper work via the Task tool during execution.
- The prompt must explicitly forbid delegating to `tapestry`, recursive/re-delegated subagent chains, and handing off full plan ownership.
- The initial rollout is prompt-gated only; hard runtime enforcement is a follow-up, not part of the default scope.

### Exact File Targets
- Config + schema: `src/config/schema.ts`, `src/config/schema.test.ts`, `schema/weave-config.schema.json`
- Agent plumbing: `src/create-managers.ts`, `src/agents/builtin-agents.ts`, `src/agents/tapestry/index.ts`
- Prompt logic + unit tests: `src/agents/tapestry/prompt-composer.ts`, `src/agents/tapestry/prompt-composer.test.ts`, `src/agents/tapestry/index.test.ts`
- Integration coverage: `test/integration/custom-agent-pipeline.integration.test.ts`
- Eval plumbing: `src/features/evals/types.ts`, `src/features/evals/schema.ts`, `src/features/evals/targets/builtin-agent-target.ts`, `src/features/evals/targets/builtin-agent-target.test.ts`
- Eval cases/suites: `evals/cases/tapestry/experimental-subagent-orchestration-contract.jsonc`, `evals/suites/prompt-contracts.jsonc`
- Docs: `README.md`, `docs/configuration.md`, `docs/architecture.md`, `docs/agent-interactions.md`

### Risks
- Prompt drift could accidentally change the default Tapestry contract and break deterministic prompt tests.
- Docs could overstate safety if they describe prompt guidance as runtime enforcement.
- Allowing execution-time delegation without sharp boundaries could create recursive/self-delegation loops or vague ownership handoffs.

## Objectives
### Core Objective
Enable experimental, config-gated Tapestry subagent orchestration through prompt composition and config plumbing, while preserving current default behavior and safety expectations.

### Deliverables
- [x] Add `experimental.tapestry_subagent_orchestration` to validated config and generated JSON schema.
- [x] Thread the experimental flag into Tapestry agent construction without changing the default prompt path.
- [x] Add a guarded execution-time delegation prompt branch with explicit anti-recursion / anti-self-delegation rules.
- [x] Add unit, integration, and prompt-eval coverage for both default-off and enabled-on behavior.
- [x] Update user-facing docs to describe the feature as experimental, default-off, and prompt-gated.

### Definition of Done
- [ ] `bun test` passes.
- [x] `bun run schema:config:check` passes.
- [x] `bun run eval --suite prompt-contracts` passes with the new Tapestry experimental contract.
- [x] Default Tapestry prompt output remains unchanged when `experimental.tapestry_subagent_orchestration` is absent or `false`.

### Non-Goals
- [x] Do not add runtime task-tool interception or hard enforcement in this iteration.
- [x] Do not enable Tapestry execution-time delegation by default.
- [x] Do not broaden Tapestry's tool permissions beyond the existing model for this rollout.
- [x] Do not change Loom routing, Pattern scope, or reviewer behavior beyond wording needed for Tapestry docs/prompts.

### Guardrails (Must NOT)
- Must NOT permit Tapestry to delegate to `tapestry` itself.
- Must NOT allow Tapestry to hand off the entire remaining plan or plan ownership wholesale; delegation must stay bounded to targeted helper tasks.
- Must NOT change the default prompt/tool behavior when the experimental flag is disabled.
- Must NOT present prompt-only guidance as if it were runtime-enforced; explicitly document that hard enforcement would be a later follow-up.
- Must NOT relax `call_weave_agent: false` as part of this change.

## TODOs

- [x] 1. Add the experimental config surface
  **What**: Add a boolean `experimental.tapestry_subagent_orchestration` field to the Zod schema, schema tests, and generated JSON schema artifact. Keep merge behavior unchanged so user/project config layering continues to work automatically.
  **Files**: `src/config/schema.ts`, `src/config/schema.test.ts`, `schema/weave-config.schema.json`
  **Acceptance**: The config parses when the flag is `true` or `false`, rejects invalid types, and `bun run schema:config:check` reports no drift.

- [x] 2. Plumb the flag into builtin agent creation
  **What**: Extend the Tapestry creation path so `createManagers()` passes the resolved experimental flag into `createBuiltinAgents()`, which in turn passes it into `createTapestryAgentWithOptions()`. Preserve the existing fast path when the feature is off so the default prompt stays byte-for-byte equivalent.
  **Files**: `src/create-managers.ts`, `src/agents/builtin-agents.ts`, `src/agents/tapestry/index.ts`
  **Acceptance**: Tapestry receives the new option only through config plumbing, and the default constructor path remains unchanged when the flag is disabled.

- [x] 3. Add a guarded experimental prompt branch
  **What**: Extend `TapestryPromptOptions` and prompt composition so the default path still says no execution-time delegation, while the enabled path swaps in tightly-scoped orchestration instructions. The enabled wording should allow helper delegation only for bounded subproblems, explicitly forbid self-delegation, recursive delegation, and full-plan handoff, and state that this is prompt-gated behavior unless runtime enforcement is added later.
  **Files**: `src/agents/tapestry/prompt-composer.ts`, `src/agents/tapestry/prompt-composer.test.ts`, `src/agents/tapestry/index.test.ts`
  **Acceptance**: Default prompt assertions still pass unchanged; enabled-path tests assert the new delegation wording plus the explicit anti-recursion / anti-self-delegation guardrails.

- [x] 4. Add integration coverage for config-driven prompt selection
  **What**: Extend integration coverage around `createManagers()` so one test proves the default Tapestry prompt does not gain execution-time delegation text, and another proves the experimental config flag injects the new guarded orchestration wording.
  **Files**: `test/integration/custom-agent-pipeline.integration.test.ts`
  **Acceptance**: Integration tests cover both flag states and confirm that only the opt-in config path changes the Tapestry prompt.

- [x] 5. Extend eval infrastructure and add an enabled-path prompt contract
  **What**: Expand builtin prompt-eval variants beyond `disabledAgents` so evals can render Tapestry with the experimental flag enabled. Add a dedicated Tapestry prompt contract case that checks for bounded delegation language plus explicit prohibitions on self/recursive delegation, then include it in the prompt contracts suite.
  **Files**: `src/features/evals/types.ts`, `src/features/evals/schema.ts`, `src/features/evals/targets/builtin-agent-target.ts`, `src/features/evals/targets/builtin-agent-target.test.ts`, `evals/cases/tapestry/experimental-subagent-orchestration-contract.jsonc`, `evals/suites/prompt-contracts.jsonc`
  **Acceptance**: Prompt evals can render the new experimental variant, the new case passes, and existing default-contract cases still validate the default-off prompt.

- [x] 6. Update docs to reflect the experimental default-off model
  **What**: Update config, architecture, and interaction docs so they distinguish default Tapestry behavior from the experimental opt-in path. Call out that the first version is prompt-gated, that `call_weave_agent` remains disabled, and that recursive/self delegation is explicitly forbidden.
  **Files**: `README.md`, `docs/configuration.md`, `docs/architecture.md`, `docs/agent-interactions.md`
  **Acceptance**: Docs consistently describe the feature as experimental, config-gated, default-off, prompt-gated, and guarded against self/recursive delegation.

- [ ] 7. Run verification and regression checks
  **What**: Run targeted tests first, then full verification so config, prompt, integration, and eval coverage all pass together.
  **Acceptance**: The targeted suites, full `bun test`, schema drift check, and prompt-contract evals all pass without changing default Tapestry contracts.

## Verification
- [ ] All tests pass
- [x] No regressions
- [x] `bun test src/config/schema.test.ts src/config/merge.test.ts src/agents/tapestry/prompt-composer.test.ts src/agents/tapestry/index.test.ts test/integration/custom-agent-pipeline.integration.test.ts src/features/evals/targets/builtin-agent-target.test.ts` passes
- [ ] `bun test` passes
- [x] `bun run schema:config:check` passes
- [x] `bun run eval --suite prompt-contracts` passes
- [x] Default-off docs and prompt contracts still describe Tapestry as direct execution unless the experimental flag is explicitly enabled
