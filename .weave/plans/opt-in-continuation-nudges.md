# Split Compaction Recovery from Idle Continuation Nudges

## TL;DR
> **Summary**: Split continuation behavior into two lanes: default-on post-compaction recovery prompts that let Tapestry resume from persisted state after context restoration, and default-off generic idle nudges/fallback prompts that only fire when explicitly enabled. Keep silent state-repair paths intact so the feature only controls user-visible nudges, not safety plumbing.
> **Estimated Effort**: Medium

## Context
### Original Request
Revise the continuation-nudges plan so post-compaction/context-restoration resume behavior is distinct from generic idle nudges. Tapestry should still be able to continue after compaction, while generic session-idle nudges and todo-finalization prompt fallbacks should likely be opt-in.

### Key Findings
- `src/plugin/plugin-interface.ts` is still the main arbitration point: it owns `session.idle`, tracks `continuationFired`, and already sequences workflow continuation before work continuation before todo finalization.
- Post-compaction behavior is a different runtime lane from idle nudging. `experimental.session.compacting` captures todo state, and `session.compacted` restores it through `src/hooks/compaction-todo-preserver.ts`; today that path repairs state but does not explicitly re-prompt the executor.
- `src/hooks/work-continuation.ts` is purely a prompt generator on top of persisted work state. Its stale-progress and auto-pause bookkeeping should stay independent from whether generic idle nudges are enabled.
- `src/features/workflow/hook.ts` mixes two concerns under one hook name: `/run-workflow` start/resume commands and `session.idle` step-advance prompts. The product direction now wants only the idle half to be opt-in.
- `src/hooks/todo-continuation-enforcer.ts` already has the right semantic split: direct todo mutation is silent repair, while `client.session.promptAsync()` is a user-visible fallback nudge.
- `src/agents/tapestry/prompt-composer.ts` is option-driven and can cheaply receive a narrow “resume after injected recovery/continuation prompt” hint without changing default output when omitted.
- Loom’s current guidance (`/start-work` resumes interrupted work) remains compatible because manual resume is still supported even if generic idle nudges are off.

### Recommended Design
#### 1. Recommended config shape
```jsonc
{
  "continuation": {
    "recovery": {
      "compaction": true
    },
    "idle": {
      "enabled": false,
      "work": false,
      "workflow": false,
      "todo_prompt": false
    }
  }
}
```

Semantics:
- If `continuation` is omitted, resolve to:
  - `continuation.recovery.compaction = true`
  - `continuation.idle.enabled = false`
  - idle children inherit from `idle.enabled` when omitted
- `disabled_hooks` stays the lower-level kill switch and wins over config if both are present.
- `recovery` and `idle` are separate namespaces on purpose: compaction recovery is resumptive state restoration, while idle prompting is a generic nudge policy.

Why this shape:
- It keeps the user-facing mental model crisp: “resume after compaction” is not the same feature as “nudge idle sessions.”
- It leaves room for future recovery modes without forcing another breaking schema change.
- It keeps the simple opt-in for generic idle nudges explicit:
  ```jsonc
  { "continuation": { "idle": { "enabled": true } } }
  ```

#### 2. Runtime behavior → flag mapping
- `continuation.recovery.compaction`
  - Controls a dedicated `session.compacted` resume prompt path.
  - After todo snapshot restore is attempted, if there is active unpaused work-state or a running workflow, inject one resume prompt so Tapestry can continue from persisted state.
  - This is **not** a generic idle nudge and should still work when all `continuation.idle.*` flags are false.
  - Must **not** disable snapshot capture/restore itself; only the prompt injection belongs behind this flag.
- `continuation.idle.work`
  - Controls the `session.idle` plan-resume nudge produced by `hooks.workContinuation()`.
  - Must **not** gate `/start-work`, persisted work-state reads/writes, stale-progress tracking, markers, or auto-pause behavior.
- `continuation.idle.workflow`
  - Controls idle-driven workflow continuation/complete/pause prompts from `hooks.workflowContinuation()`.
  - Must **not** gate `/run-workflow`, active-workflow detection, workflow commands, or explicit manual resume paths.
- `continuation.idle.todo_prompt`
  - Controls only the `client.session.promptAsync()` fallback in `src/hooks/todo-continuation-enforcer.ts`.
  - Must **not** gate direct todo finalization writes.
- `continuation.idle.enabled`
  - Umbrella switch for the three idle behaviors above unless a child override is set.

#### 3. Compatibility notes
- **Tapestry**
  - Default-on compaction recovery means Tapestry can keep executing after context restoration even when generic idle nudges are disabled.
  - Prompt composition should gain, at most, a terse optional hint explaining that an injected recovery/continuation prompt means “resume from persisted work/workflow state.”
  - Default prompt output must stay byte-for-byte stable when continuation options are omitted.
- **Loom**
  - Loom’s manual guidance stays valid: `/start-work` remains the normal resume path for plans.
  - Loom should not be made dependent on idle nudges being on; if anything, diagnostics/docs should clarify that automatic idle resume is optional while manual resume remains stable.
- **Workflows**
  - `/run-workflow` start and explicit resume should remain always available.
  - Running workflows should participate in compaction recovery by default, but idle step-advance prompts should remain opt-in under `continuation.idle.workflow`.
  - When both workflow and work-state are present, keep the existing workflow-first arbitration for any injected resume prompt.
- **Todo cleanup**
  - Compaction todo snapshot/restore stays independent from continuation flags except for the optional post-compaction prompt.
  - Direct todo finalization stays always on.
  - If direct todo writing is unavailable and `idle.todo_prompt` is off, leftover `in_progress` todos may persist until the next manual/user-driven cleanup.

#### 4. Rollout/default recommendation
- Ship with `recovery.compaction = true` by default.
- Ship with all generic idle nudges off by default.
- Document the first-line knobs as:
  - “Keep execution going after compaction” → default behavior
  - “Also auto-nudge idle sessions” → `continuation.idle.enabled = true`
- Expose resolved continuation settings in diagnostics so users can tell whether a missing prompt was suppressed by defaults, an override, or `disabled_hooks`.

#### 5. Potential pitfalls
- Event-lane confusion: `session.compacted` and `session.idle` must remain separate so compaction recovery does not accidentally resurrect always-on idle nudging.
- Arbitration drift: post-compaction recovery should reuse the same workflow-before-work precedence as idle continuation to avoid contradictory prompts.
- Prompt stability: any Tapestry option must preserve identical default output when omitted.
- Silent-repair regressions: config work must not accidentally disable compaction restore or direct todo writes.
- Diagnostics ambiguity: “continuation disabled” is no longer specific enough once recovery and idle are split.

## Objectives
### Core Objective
Make post-compaction recovery prompts a distinct, default-on continuation lane while keeping generic idle nudges and todo-prompt fallbacks explicitly opt-in.

### Deliverables
- [ ] Add a `continuation` config shape that separates `recovery.compaction` from `idle.*`
- [ ] Map each continuation-related runtime behavior to the correct resolved flag with explicit precedence rules
- [ ] Preserve Tapestry’s ability to resume after compaction/context restoration even when idle nudges are off
- [ ] Keep Loom manual resume, workflow commands, compaction todo restore, and direct todo finalization behavior compatible
- [ ] Add regression coverage for default-on compaction recovery, default-off idle nudges, and mixed override cases

### Definition of Done
- [ ] `bun test src/plugin/plugin-interface.test.ts src/hooks/todo-protection.integration.test.ts src/hooks/todo-continuation-enforcer.test.ts src/agents/tapestry/prompt-composer.test.ts src/features/workflow/hook.test.ts src/workflow.test.ts` passes
- [ ] `bun test src/config/schema.test.ts src/config/loader.test.ts` passes with continuation resolution coverage
- [ ] `bun test` passes
- [ ] Manual smoke check confirms post-compaction recovery still resumes active Tapestry work while plain idle sessions stay silent by default

### Guardrails (Must NOT)
- [ ] Must NOT treat post-compaction recovery as just another `session.idle` nudge
- [ ] Must NOT disable compaction todo snapshot/restore when only idle nudges are off
- [ ] Must NOT disable `/start-work`, `/run-workflow`, or workflow command handling when idle continuation is off
- [ ] Must NOT disable the direct todo-write finalization path
- [ ] Must NOT change Tapestry’s default prompt output when continuation prompt options are omitted
- [ ] Must NOT make Loom depend on automatic idle continuation to preserve resume behavior

## TODOs

- [x] 1. Add continuation config schema and resolver for recovery vs idle
  **What**: Replace the single continuation namespace proposal with a resolved shape that separates `recovery.compaction` from `idle.enabled/work/workflow/todo_prompt`, applies inheritance once, and documents the precedence order (`disabled_hooks` > explicit child override > parent default > built-in default).
  **Files**: `src/config/schema.ts`, `src/config/schema.test.ts`, `src/config/loader.ts`, `src/config/loader.test.ts`, `src/config/index.ts`, `src/config/continuation.ts`
  **Acceptance**: Omitted config resolves to compaction recovery on and idle nudges off; partial idle blocks inherit from `idle.enabled`; explicit child overrides work; diagnostics can surface the fully resolved shape.

- [x] 2. Thread resolved continuation settings through plugin startup and agent construction
  **What**: Pass the resolved continuation settings into the plugin/hook layer and Tapestry construction so runtime gating, diagnostics, and prompt composition all read one canonical config object.
  **Files**: `src/index.ts`, `src/create-managers.ts`, `src/agents/builtin-agents.ts`, `src/agents/tapestry/index.ts`
  **Acceptance**: Plugin runtime and Tapestry prompt creation consume the same resolved continuation object without duplicating flag logic.

- [x] 3. Add a dedicated post-compaction recovery prompt path
  **What**: Introduce a separate recovery evaluator for `session.compacted` that runs after todo restore, checks for active running workflow or unpaused work-state, and injects one resume prompt when `continuation.recovery.compaction` is enabled. Reuse workflow-first arbitration so compaction recovery behaves consistently with the existing continuation ordering.
  **Files**: `src/plugin/plugin-interface.ts`, `src/hooks/create-hooks.ts`, `src/hooks/compaction-todo-preserver.ts`, `src/hooks/compaction-recovery.ts`, `src/features/workflow/hook.ts`, `src/hooks/work-continuation.ts`, `src/plugin/plugin-interface.test.ts`, `src/hooks/todo-protection.integration.test.ts`
  **Acceptance**: With default settings, `session.compacted` can resume active Tapestry work/workflows even when idle flags are false; when `recovery.compaction=false`, restore still happens but no recovery prompt is injected.

- [x] 4. Gate generic work-plan idle nudges without touching work-state safety logic
  **What**: Limit `session.idle` plan nudges to `continuation.idle.work`, but leave persisted work-state reads/writes, stale-progress counters, markers, and user-interrupt auto-pause logic unchanged.
  **Files**: `src/plugin/plugin-interface.ts`, `src/hooks/create-hooks.ts`, `src/hooks/work-continuation.ts`, `src/plugin/plugin-interface.test.ts`
  **Acceptance**: Idle sessions with active plans stay silent by default; manual `/start-work` resume still works; stale/paused protections still behave correctly when idle work nudges are later enabled.

- [x] 5. Separate workflow idle continuation from workflow start/resume commands
  **What**: Split the workflow feature at the runtime-behavior level so `/run-workflow` startup, explicit resume, and workflow commands remain always available, while idle-driven step advancement/complete/pause prompts obey `continuation.idle.workflow`.
  **Files**: `src/plugin/plugin-interface.ts`, `src/hooks/create-hooks.ts`, `src/features/workflow/hook.ts`, `src/features/workflow/hook.test.ts`, `src/workflow.test.ts`
  **Acceptance**: With idle workflow nudges off, workflows can still start and resume manually, but `session.idle` does not inject workflow prompts; post-compaction recovery still works when enabled.

- [x] 6. Gate only the todo finalization prompt fallback
  **What**: Keep direct todo finalization writes always on, but require `continuation.idle.todo_prompt=true` before falling back to `client.session.promptAsync()` when the writer is unavailable and no higher-priority continuation already fired.
  **Files**: `src/hooks/todo-continuation-enforcer.ts`, `src/hooks/todo-continuation-enforcer.test.ts`, `src/plugin/plugin-interface.ts`, `src/plugin/plugin-interface.test.ts`
  **Acceptance**: Direct-write finalization still runs regardless of continuation flags; when the writer is unavailable and `idle.todo_prompt=false`, no fallback prompt is injected.

- [x] 7. Make Tapestry recovery-aware but default-stable
  **What**: Add an optional prompt-composer input that appends a short recovery/continuation hint only when some injected resume prompt path is enabled, so Tapestry knows to continue from persisted plan/workflow state after compaction or approved idle continuation.
  **Files**: `src/agents/tapestry/prompt-composer.ts`, `src/agents/tapestry/prompt-composer.test.ts`, `src/agents/tapestry/index.ts`, `src/agents/builtin-agents.ts`
  **Acceptance**: Existing default prompt tests remain unchanged when no continuation option is passed; enabled mode adds only the intended resume hint.

- [x] 8. Update diagnostics and compatibility messaging
  **What**: Extend health/debug reporting so users can distinguish: compaction recovery enabled, idle nudges disabled by default, idle child override disabled, or continuation behavior suppressed by `disabled_hooks`. Confirm Loom-facing messaging still accurately describes manual resume as the stable path.
  **Files**: `src/config/loader.ts`, `src/features/health-report.ts`, `src/features/health-report.test.ts`, `src/plugin/plugin-interface.ts`
  **Acceptance**: A user can tell why a recovery prompt appeared after compaction but an idle prompt did not, without reading source code.

- [x] 9. Add integration coverage for the split defaults and mixed overrides
  **What**: Expand tests across config resolution, plugin event handling, workflow continuation, compaction recovery, and todo finalization to cover: omitted config, `recovery.compaction=false`, `idle.enabled=true`, and mixed overrides such as `idle.enabled=true` with `workflow=false`.
  **Files**: `src/config/schema.test.ts`, `src/config/loader.test.ts`, `src/plugin/plugin-interface.test.ts`, `src/hooks/todo-protection.integration.test.ts`, `src/hooks/todo-continuation-enforcer.test.ts`, `src/features/workflow/hook.test.ts`, `src/workflow.test.ts`
  **Acceptance**: Tests prove the split defaults and precedence rules, and protect against regressions where compaction recovery accidentally depends on idle nudges.

- [x] 10. Run focused and full regression verification
  **What**: Execute the targeted continuation/compaction/workflow/Tapestry tests first, then the full suite, and do a manual smoke pass that differentiates post-compaction recovery from plain idle behavior.
  **Acceptance**: Targeted tests and full suite pass; manual smoke confirms active Tapestry work resumes after compaction while generic idle sessions remain silent by default.

## Verification
- [x] All tests pass
- [x] No regressions
- [x] `bun test src/plugin/plugin-interface.test.ts src/hooks/todo-protection.integration.test.ts src/hooks/todo-continuation-enforcer.test.ts src/agents/tapestry/prompt-composer.test.ts src/features/workflow/hook.test.ts src/workflow.test.ts`
- [x] `bun test src/config/schema.test.ts src/config/loader.test.ts`
- [x] `bun test`
