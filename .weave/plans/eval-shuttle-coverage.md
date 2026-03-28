# Shuttle Eval Coverage

## TL;DR
> **Summary**: Add Shuttle to the eval system by widening the type system to accept it, adding a `resolveBuiltinAgentTarget` case, creating Phase 1 prompt-contract cases, Phase 2 Loom-routing cases, and a spike case — all working without a project-specific category config by testing Shuttle's static default prompt.
> **Estimated Effort**: Medium

## Context
### Original Request
Add eval coverage for Shuttle, the 8th built-in agent, which was intentionally excluded from Phase 1. Shuttle is a "Domain Specialist" for "category-specific specialized work" with config-driven behavior (categories defined per-project). The spike already has one shuttle routing case that initially failed before input was rewritten to mirror the prompt language.

### Key Findings

1. **Explicit exclusion at the type level**: `BuiltinEvalAgentName` in `src/features/evals/types.ts:32` is defined as `Exclude<WeaveAgentName, "shuttle">`. This type gates what `BuiltinAgentPromptTarget.agent` accepts. The Zod schema in `schema.ts:19` mirrors this by hard-coding the 7 allowed agent names.

2. **No `resolveBuiltinAgentTarget` case**: The switch in `src/features/evals/targets/builtin-agent-target.ts` has cases for all 7 agents but no `shuttle` case. Adding one is trivial — Shuttle uses a static default prompt (no composer), identical pattern to pattern/thread/spindle/weft/warp.

3. **Shuttle's prompt is static and testable**: `SHUTTLE_DEFAULTS` in `src/agents/shuttle/default.ts` has XML sections (`<Role>`, `<Execution>`, `<Constraints>`, `<Style>`), explicit behavioral contracts ("Never spawn subagents", "Never read or expose .env files"), and a tool policy (`call_weave_agent: false`). This is plenty to write deterministic Phase 1 evaluators against — no category config needed.

4. **Shuttle's mode is `"all"`** and its cost is `"CHEAP"` — it's a leaf worker that cannot delegate. This is a strong prompt contract to test.

5. **Loom's prompt already references Shuttle**: Line 78 of `prompt-composer.ts` emits `"- Use shuttle for category-specific specialized work"` when shuttle is enabled. The existing `loom-default-contract` case doesn't explicitly assert this line. A new case (or addendum) can verify Loom's delegation section mentions shuttle.

6. **The spike's shuttle case (case 6)** required heavy prompt-mirroring in the input (`"This is category-specific specialized work"`) to get the model to route correctly. This is a known fragility signal — the Loom prompt only says one line about shuttle. Phase 2 LLM-judge cases should test this routing with and without the magic phrase.

7. **Categories config is optional**: `buildAgent` in `agent-builder.ts` applies category config only if `options.categories` is provided. When absent, Shuttle still builds correctly with its defaults. Eval cases can test the no-config path (default) and optionally a with-config variant later.

## Objectives
### Core Objective
Bring Shuttle into the eval system with deterministic prompt-contract coverage (Phase 1), Loom→Shuttle routing coverage (Phase 2), and an updated spike case — without breaking existing eval suites.

### Deliverables
- [x] Widen the type system to allow `"shuttle"` in eval targets
- [x] Add `shuttle` case to `resolveBuiltinAgentTarget`
- [x] Create Phase 1 deterministic eval case for Shuttle's prompt contract
- [x] Create Phase 2 LLM-judge routing case for Loom→Shuttle delegation
- [x] Add Loom default-contract assertion for shuttle delegation line
- [x] Update spike script with refined shuttle routing case
- [x] Update suite manifests to include new cases
- [x] Regenerate baselines

### Definition of Done
- [x] `bun test --filter evals` passes (existing + new)
- [x] `bun run script/run-eval.ts -- --suite phase1-core` passes with all cases green
- [x] `bun run script/run-eval.ts -- --suite pr-smoke` passes (no regression)
- [x] `resolveBuiltinAgentTarget({ kind: "builtin-agent-prompt", agent: "shuttle" })` returns valid resolved target
- [x] TypeScript compiles with no errors (`bun run typecheck` or equivalent)

### Guardrails (Must NOT)
- Must NOT break existing eval suites or baselines (existing cases must still pass at same scores)
- Must NOT introduce new npm dependencies
- Must NOT require a project-specific shuttle config for the tests to pass
- Must NOT change Shuttle's actual agent behavior (prompt, tools, etc.)

## TODOs

- [x] 1. **Widen `BuiltinEvalAgentName` type to include `"shuttle"`**
  **What**: Change `BuiltinEvalAgentName` from `Exclude<WeaveAgentName, "shuttle">` to `WeaveAgentName` (or explicitly add `"shuttle"` to the union). Update the Zod schema `BuiltinAgentPromptTargetSchema` in `schema.ts` to add `"shuttle"` to the `agent` enum.
  **Files**:
  - `src/features/evals/types.ts` — change line 32 from `Exclude<WeaveAgentName, "shuttle">` to `WeaveAgentName`
  - `src/features/evals/schema.ts` — change line 19 from `z.enum(["loom", "tapestry", "pattern", "thread", "spindle", "weft", "warp"])` to include `"shuttle"`
  **Acceptance**: TypeScript compiles. The Zod schema accepts `{ kind: "builtin-agent-prompt", agent: "shuttle" }` without validation errors. Existing schema tests still pass.

- [x] 2. **Add `shuttle` case to `resolveBuiltinAgentTarget`**
  **What**: Add an import for `SHUTTLE_DEFAULTS` and a `case "shuttle":` block to the switch statement, following the same pattern as pattern/thread/spindle/weft/warp (static prompt, `sourceKind: "default"`).
  **Files**:
  - `src/features/evals/targets/builtin-agent-target.ts` — add import + case block
  - `src/features/evals/targets/builtin-agent-target.test.ts` — add a test that resolves shuttle and asserts `sourceKind: "default"`, `toolPolicy: { call_weave_agent: false }`, and a non-empty `renderedPrompt`
  **Acceptance**: `resolveBuiltinAgentTarget({ kind: "builtin-agent-prompt", agent: "shuttle" })` returns the expected artifacts. Unit test passes.

- [x] 3. **Create Phase 1 eval case: `shuttle/default-contract.jsonc`**
  **What**: Create a deterministic prompt-contract case that validates Shuttle's static prompt structure and behavioral guarantees. Test against the rendered prompt (no LLM needed).
  **Files**:
  - `evals/cases/shuttle/default-contract.jsonc` (new file)
  **Content** (approximate):
  ```jsonc
  {
    "id": "shuttle-default-contract",
    "title": "Shuttle prompt enforces domain specialist leaf-worker contract",
    "phase": "phase1",
    "tags": ["phase1", "default", "shuttle"],
    "target": {
      "kind": "builtin-agent-prompt",
      "agent": "shuttle"
    },
    "executor": {
      "kind": "prompt-render"
    },
    "evaluators": [
      { "kind": "xml-sections-present", "sections": ["Role", "Execution", "Constraints", "Style"] },
      { "kind": "contains-all", "patterns": [
        "category-based specialist worker",
        "Execute the assigned task completely",
        "Never spawn subagents",
        "Never read or expose .env files"
      ]},
      { "kind": "excludes-all", "patterns": ["call_weave_agent"] },
      { "kind": "tool-policy", "expectations": { "call_weave_agent": false } },
      { "kind": "min-length", "min": 400 }
    ]
  }
  ```
  **Acceptance**: Case loads, renders, and passes all evaluators deterministically. The `excludes-all` for `call_weave_agent` verifies the prompt doesn't mention this tool (it's denied via policy, not prompt text — adjust if the prompt actually contains the string). The `tool-policy` evaluator confirms the tool deny-list.

  **Note on `excludes-all`**: The `SHUTTLE_DEFAULTS.prompt` text does NOT contain the string `"call_weave_agent"` — the tool denial is in the `tools` config only. So `excludes-all` on `"call_weave_agent"` would check the rendered prompt, which should pass. However, if the evaluator checks artifacts broadly, verify during implementation. If this is fragile, drop the `excludes-all` and rely solely on `tool-policy`.

- [x] 4. **Add shuttle reference assertion to existing Loom default-contract**
  **What**: Strengthen the existing `loom-default-contract.jsonc` by adding a `contains-all` or `section-contains-all` evaluator that asserts the Delegation section mentions shuttle. Currently the Loom default-contract tests for `"Delegate aggressively"` and `"MUST use Warp"` but not shuttle. Add `"Use shuttle"` to the `section-contains-all` patterns for the Delegation section.
  **Files**:
  - `evals/cases/loom/default-contract.jsonc` — add `"Use shuttle"` to the existing `section-contains-all` evaluator's patterns array (line 15)
  **Acceptance**: The augmented evaluator still passes. Confirms Loom's prompt includes shuttle delegation guidance.

  **Alternative**: If touching the existing case feels risky (baseline churn), create a separate case `evals/cases/loom/shuttle-delegation-mention.jsonc` instead. Implementation can decide.

- [x] 5. **Create Phase 2 eval case: Loom→Shuttle routing intent**
  **What**: Create an LLM-judge routing case that tests whether Loom delegates to Shuttle for category-specific work. Follows the pattern of existing Phase 2 cases (`delegation-intent-exploration.jsonc`, etc.).
  **Files**:
  - `evals/cases/loom/phase2/delegation-intent-shuttle.jsonc` (new file)
  **Content** (approximate):
  ```jsonc
  {
    "id": "loom-phase2-delegation-intent-shuttle",
    "title": "Loom model response prefers Shuttle for category-specific specialized work",
    "phase": "phase2",
    "tags": ["phase2", "loom", "pilot", "routing"],
    "target": {
      "kind": "builtin-agent-prompt",
      "agent": "loom"
    },
    "executor": {
      "kind": "model-response",
      "provider": "openai",
      "model": "gpt-5",
      "input": "I need a domain specialist to handle the GraphQL schema generation for our product catalog. This is category-specific specialized work."
    },
    "evaluators": [
      {
        "kind": "llm-judge",
        "rubricRef": "evals/rubrics/loom-routing-rubric.md",
        "expectedContains": ["shuttle"],
        "forbiddenContains": ["I will implement this directly"]
      }
    ]
  }
  ```
  **Notes**: The input intentionally mirrors the Loom prompt language ("category-specific specialized work") because the spike showed this is necessary for reliable routing. A second, harder variant without the magic phrase could be added later to test prompt robustness.
  **Acceptance**: Case loads and validates against schema. When run with a live model, Loom routes to shuttle.

- [x] 6. **Update routing rubric to mention Shuttle**
  **What**: Add a Shuttle scenario expectation to `evals/rubrics/loom-routing-rubric.md` so the LLM judge knows what correct shuttle routing looks like.
  **Files**:
  - `evals/rubrics/loom-routing-rubric.md` — add a bullet under "Scenario Expectations"
  **Content to add**:
  ```
  - **Category-specific specialized work**: should indicate delegation to Shuttle for domain-specific tasks.
  ```
  **Acceptance**: Rubric file updated. No tests break.

- [x] 7. **Update spike script with improved shuttle case**
  **What**: The spike already has case 6 (`route-to-shuttle-specialist`). Verify it still matches the case in the script and optionally add a second, more challenging variant that doesn't use the magic phrase. Also consider adding a note about known fragility.
  **Files**:
  - `script/eval-spike-github-models.ts` — review case 6, optionally add variant
  **Acceptance**: Spike runs in dry-run mode without errors. Existing cases unchanged.

- [x] 8. **Update suite manifests**
  **What**: Add the new shuttle case file to `phase1-core.jsonc` and `pr-smoke.jsonc` suite manifests. Add the Phase 2 routing case to `phase2-loom-pilot.jsonc`.
  **Files**:
  - `evals/suites/phase1-core.jsonc` — add `"evals/cases/shuttle/default-contract.jsonc"` to `caseFiles`
  - `evals/suites/pr-smoke.jsonc` — optionally add shuttle case (it's lightweight, good for smoke)
  - `evals/suites/phase2-loom-pilot.jsonc` — add `"evals/cases/loom/phase2/delegation-intent-shuttle.jsonc"` to `caseFiles`
  **Acceptance**: Suite loads all cases without errors. Existing cases still resolve.

- [x] 9. **Regenerate baselines**
  **What**: Run the Phase 1 suite and regenerate `evals/baselines/phase1-core.json` and `evals/baselines/pr-smoke.json` to include the new shuttle case. Existing case scores must remain unchanged (score 1.0).
  **Files**:
  - `evals/baselines/phase1-core.json` — regenerated
  - `evals/baselines/pr-smoke.json` — regenerated (if shuttle added to pr-smoke)
  **Acceptance**: New baseline includes shuttle case with `normalizedScore: 1`. All existing case scores unchanged.

- [x] 10. **Verify existing unit tests still pass**
  **What**: Run the full test suite to catch any regressions from the type widening or new switch case.
  **Files**: No changes — verification only.
  **Acceptance**: `bun test` passes. Special attention to:
  - `src/features/evals/schema.test.ts` (schema validation)
  - `src/features/evals/targets/builtin-agent-target.test.ts` (target resolution)
  - `src/features/evals/loader.test.ts` (case loading)
  - `src/agents/shuttle/index.test.ts` (shuttle factory — should be unaffected)

## Verification
- [x] All existing tests pass (`bun test`)
- [x] Phase 1 suite runs green with shuttle case included
- [x] PR smoke suite runs green (no regression)
- [x] `resolveBuiltinAgentTarget` handles shuttle correctly (unit test)
- [x] TypeScript compiles cleanly
- [x] Baseline scores for existing cases unchanged (diff check)
- [x] The `BuiltinEvalAgentName` type now includes `"shuttle"` (compile-time)
- [x] New eval case files parse correctly via Zod schema

## Design Decisions & Rationale

### Why Shuttle's static prompt is sufficient for Phase 1
Shuttle's category-specific behavior comes from the `buildAgent` function applying `CategoriesConfig` at runtime — model selection, temperature overrides, etc. But its **prompt contract** is static: the XML sections, behavioral constraints ("never spawn subagents"), and tool denials are all in `SHUTTLE_DEFAULTS` and don't change with config. Phase 1 evals test the prompt contract, not runtime behavior.

### Why not test with a mock categories config?
Category config affects model/temperature selection, not the prompt content that Phase 1 evaluators check. A future Phase 3/4 trajectory test could inject a config and verify Shuttle receives the right model — but that's out of scope here.

### Why the type exclusion existed
The original `Exclude<WeaveAgentName, "shuttle">` was deliberate: shuttle was skipped because its config-driven nature made it seem untestable. Now that we've established that the static prompt is independently testable, the exclusion should be removed.

### Routing fragility
The spike showed that Loom only reliably routes to Shuttle when the user input contains "category-specific specialized work" — mirroring the exact prompt language. This is a known limitation of having only one delegation line for shuttle in Loom's prompt. The Phase 2 case intentionally uses this phrasing. Improving Loom's shuttle delegation guidance (more triggers, richer description) is a separate concern.
