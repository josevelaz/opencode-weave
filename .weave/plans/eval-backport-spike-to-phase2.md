# Backport GitHub Models Spike into Phase 2 Eval Harness

## TL;DR
> **Summary**: Extend the `model-response` executor to support a `"live"` mode that calls GitHub Models API (reusing the spike's `callGitHubModels` pattern), port the spike's 10 eval cases into JSONC format, and wire mode selection via `WEAVE_EVAL_MODE` env var or `--live` CLI flag — while preserving mock-only default behavior.
> **Estimated Effort**: Medium

## Context
### Original Request
Merge two parallel eval paths: the Phase 2 pilot (3 mock-only cases, `llm-judge` evaluator, integrated harness) and the GitHub Models spike (10 cases, real API calls, standalone script). Add a `"live"` execution mode to the `model-response` executor so Phase 2 cases can optionally hit real LLMs through the harness.

### Key Findings
- **`model-response` executor** (`src/features/evals/executors/model-response.ts`) is synchronous, returns `EvalArtifacts` directly. Live mode needs `async` — this is the biggest structural change, rippling into `runner.ts`'s `executeCase` function.
- **Runner is synchronous** (`src/features/evals/runner.ts`): `executeCase()` and `runEvalSuite()` are sync. The model-response executor and the runner both need to become `async` to support live API calls.
- **`ExecutionContext`** (`src/features/evals/types.ts`) has `mode: "local" | "ci" | "hosted"` — this is for environment context, not execution strategy. Live/mock is a separate concern; it should be a new field or resolved from env vars.
- **`ModelResponseExecutor` type** has `provider`, `model`, `input` fields — the spike uses `provider`="github-models" and `model`="gpt-4o-mini". These fields map naturally to the API call.
- **Spike's API caller** (`script/eval-spike-github-models.ts` lines 168-202) uses `fetch()` with `temperature: 0`, `max_tokens: 1024`, and the Azure inference endpoint. This can be extracted almost verbatim.
- **Phase 2 cases** use `"provider": "openai", "model": "gpt-5"` — for live mode, these need to map to GitHub Models API model names. The spike hardcodes `gpt-4o-mini`. Cases should specify a live-compatible model or the executor should have a model override.
- **`llm-judge` evaluator** (`src/features/evals/evaluators/llm-judge.ts`) already does `expectedContains`/`forbiddenContains` checks on `artifacts.modelOutput` — this is exactly what the spike's grading does. Existing evaluators work unchanged once `modelOutput` is populated with real API responses.
- **Schema validation** (`src/features/evals/schema.ts`) defines `ModelResponseExecutorSchema` with `provider`, `model`, `input` — adding an optional `mode` field here would let individual cases opt in/out of live mode.
- **Rate limiting**: The spike adds 1s delay between calls. The runner currently runs cases sequentially via `.map()` which would need to become `for...of` with `await` + delay for live mode.
- **Spike script** should remain as-is — it's a lightweight standalone tool that doesn't depend on the harness.

### Dependency
> **Prerequisite**: The "automate Phase 2 pilot" work must be complete first. That work ensures `script/eval.ts` can run `phase2-loom-pilot` suite end-to-end with mock responses. This plan extends that foundation.

## Objectives
### Core Objective
Enable the Phase 2 eval harness to run Loom routing cases against both mock responses and live GitHub Models API, controlled by an environment variable, so we can validate routing quality in CI (mock, fast, no token) and locally/on-demand (live, real LLM).

### Deliverables
- [ ] `model-response` executor supports live mode via GitHub Models API
- [ ] Runner supports async execution for live API calls
- [ ] 7 new JSONC eval cases ported from the spike (10 spike cases → 3 already exist in Phase 2, 7 are new)
- [ ] Suite manifest updated to include all 10 cases
- [ ] `--live` CLI flag and `WEAVE_EVAL_MODE` env var for mode selection
- [ ] Existing mock mode remains default and unchanged
- [ ] Spike script continues to work independently

### Definition of Done
- [ ] `bun run eval --suite phase2-loom-pilot` passes with mock mode (no GITHUB_TOKEN needed)
- [ ] `WEAVE_EVAL_MODE=live GITHUB_TOKEN=ghp_xxx bun run eval --suite phase2-loom-pilot` runs all 10 cases against GitHub Models API
- [ ] `bun test` — all existing tests pass, no regressions
- [ ] `bun run script/eval-spike-github-models.ts --dry-run` still works

### Guardrails (Must NOT)
- Must NOT break existing mock-only Phase 2 behavior
- Must NOT require GITHUB_TOKEN for CI runs (mock mode remains default)
- Must NOT introduce new npm dependencies
- Must NOT modify the spike script (`script/eval-spike-github-models.ts`)
- Must NOT change Phase 1 eval behavior (`phase1-core` suite)

## TODOs

- [ ] 1. **Make the executor and runner async**
  **What**: Convert `executeModelResponse` to `async`, update `executeCase` and `runEvalSuite` in `runner.ts` to be async, update `executePromptRender` signature to async for consistency. The prompt-render executor can simply `return` (implicit `Promise.resolve`). Update all call sites.
  **Files**:
  - `src/features/evals/executors/model-response.ts` — change `executeModelResponse` return type to `Promise<EvalArtifacts>`
  - `src/features/evals/executors/prompt-renderer.ts` — change `executePromptRender` return type to `Promise<EvalArtifacts>`
  - `src/features/evals/runner.ts` — make `executeCase` async, change `selectedCases.map(...)` to sequential `for...of` with `await`, make `runEvalSuite` return `Promise<RunEvalSuiteOutput>`
  - `src/features/evals/index.ts` — no changes needed (re-exports don't change)
  - `src/features/evals/types.ts` — no changes to types (return types are in the function signatures)
  - `script/eval.ts` — add `await` to `runEvalSuite()` call, make `main()` async (it already is sync, needs to become async)
  **Acceptance**: `bun run eval --suite phase1-core` still passes (prompt-render executor unaffected by async change). `bun test` passes.

- [ ] 2. **Add execution mode resolution**
  **What**: Create a utility function `resolveExecutionMode()` that determines mock vs live mode from: (1) `WEAVE_EVAL_MODE` env var, (2) CLI `--live` flag, (3) default to `"mock"`. Add the `--live` flag to `script/eval.ts` arg parsing. The mode should be threaded through `ExecutionContext` via a new optional `executionMode?: "mock" | "live"` field.
  **Files**:
  - `src/features/evals/types.ts` — add `executionMode?: "mock" | "live"` to `ExecutionContext` interface
  - `script/eval.ts` — add `--live` flag to `parseArgs`, pass `executionMode` into `runEvalSuite` options
  - `src/features/evals/runner.ts` — thread `executionMode` from options into context
  **Acceptance**: `bun run eval --suite phase2-loom-pilot` defaults to mock. `bun run eval --suite phase2-loom-pilot --live` sets mode to live. `WEAVE_EVAL_MODE=live bun run eval --suite phase2-loom-pilot` also sets mode to live.

- [ ] 3. **Extract GitHub Models API caller into a shared module**
  **What**: Create `src/features/evals/executors/github-models-api.ts` containing the `callGitHubModels` function extracted from the spike (lines 168-202 of `script/eval-spike-github-models.ts`). This function uses only `fetch()` (built-in, no new deps). Include the API URL constant, the request/response typing, and token resolution from `GITHUB_TOKEN` env var. Add a `DELAY_BETWEEN_CALLS_MS` export for rate limiting.
  **Files**:
  - `src/features/evals/executors/github-models-api.ts` (create)
  **Acceptance**: Module exports `callGitHubModels(systemPrompt, userMessage, model, token): Promise<{ content: string; durationMs: number }>`. Compiles without errors. No new dependencies in `package.json`.

- [ ] 4. **Implement live mode in model-response executor**
  **What**: Branch on `context.executionMode` in `executeModelResponse`. When `"live"`: (a) resolve GITHUB_TOKEN from env, (b) call `callGitHubModels` with the rendered prompt as system message and `executor.input` as user message, (c) populate `modelOutput` with the response, (d) record `durationMs` in artifacts. When `"mock"` (or undefined): use existing `resolveMockResponse` logic unchanged. Throw a clear error if live mode is requested but `GITHUB_TOKEN` is missing.
  **Files**:
  - `src/features/evals/executors/model-response.ts` — add live branch, import `callGitHubModels`
  **Acceptance**: With `WEAVE_EVAL_MOCK_RESPONSES` set and mode=mock, behavior is identical to current. With `GITHUB_TOKEN` set and mode=live, executor calls the API and returns real model output.

- [ ] 5. **Add rate limiting for live mode in runner**
  **What**: When `context.executionMode === "live"`, add a 1-second delay between cases (matching the spike's `DELAY_BETWEEN_CALLS_MS`). Use a simple `await sleep(1000)` between iterations in the `for...of` loop (from TODO 1). No delay for mock mode.
  **Files**:
  - `src/features/evals/runner.ts` — add sleep utility and conditional delay in the case execution loop
  **Acceptance**: Live mode runs with visible ~1s pauses between cases. Mock mode runs instantly as before.

- [ ] 6. **Port 7 new eval cases from spike to JSONC format**
  **What**: The spike has 10 cases. Three already exist in Phase 2 under different IDs but covering the same scenarios:
  - `route-to-thread-exploration` → exists as `delegation-intent-exploration`
  - `route-to-warp-security` → exists as `delegation-intent-security`
  - `route-to-pattern-planning` → exists as `delegation-intent-planning`

  Port the remaining 7 cases into `evals/cases/loom/phase2/` as JSONC files. Each case should:
  - Use `"target": { "kind": "builtin-agent-prompt", "agent": "loom" }`
  - Use `"executor": { "kind": "model-response", "provider": "github-models", "model": "gpt-4o-mini", "input": "<the spike's input>" }`
  - Use evaluators appropriate to the case:
    - Cases with `expectedContains` + `forbiddenContains` → use `"llm-judge"` evaluator (matching existing Phase 2 pattern)
    - Self-handle cases (empty `expectedContains`, broad `forbiddenContains`) → use `"excludes-all"` evaluator on `modelOutput` for forbidden patterns
  - Include `"tags": ["phase2", "loom", "routing", "spike-backport"]`
  - Use `"phase": "phase2"`

  New files (7):
  ```
  evals/cases/loom/phase2/route-to-spindle-research.jsonc
  evals/cases/loom/phase2/route-to-weft-review.jsonc
  evals/cases/loom/phase2/route-to-shuttle-specialist.jsonc
  evals/cases/loom/phase2/self-handle-simple-question.jsonc
  evals/cases/loom/phase2/self-handle-single-file-fix.jsonc
  evals/cases/loom/phase2/ambiguous-exploration-security.jsonc
  evals/cases/loom/phase2/ambiguous-research-planning.jsonc
  ```

  **Files**: 7 new JSONC files in `evals/cases/loom/phase2/`
  **Acceptance**: `bun run eval --suite phase2-loom-pilot --case route-to-spindle-research` loads and runs (with mock responses configured). Each JSONC file passes schema validation.

- [ ] 7. **Update existing Phase 2 cases for live compatibility**
  **What**: Update the 3 existing Phase 2 cases to use `"provider": "github-models"` and `"model": "gpt-4o-mini"` (currently they say `"openai"` / `"gpt-5"`). This makes them compatible with the GitHub Models API endpoint when running in live mode. Mock mode doesn't care about provider/model values (it uses them as lookup keys in the mock mapping), so update `WEAVE_EVAL_MOCK_RESPONSES` examples accordingly.
  **Files**:
  - `evals/cases/loom/phase2/delegation-intent-exploration.jsonc`
  - `evals/cases/loom/phase2/delegation-intent-planning.jsonc`
  - `evals/cases/loom/phase2/delegation-intent-security.jsonc`
  **Acceptance**: All 3 existing cases still pass with mock responses (using updated mock mapping key `github-models/gpt-4o-mini`).

- [ ] 8. **Update suite manifest to include all 10 cases**
  **What**: Add the 7 new case file paths to `evals/suites/phase2-loom-pilot.jsonc`.
  **Files**: `evals/suites/phase2-loom-pilot.jsonc`
  **Acceptance**: `bun run eval --suite phase2-loom-pilot` runs 10 cases (in mock mode). Suite manifest passes schema validation.

- [ ] 9. **Update mock response mapping for all 10 cases**
  **What**: Document the required `WEAVE_EVAL_MOCK_RESPONSES` JSON for all 10 cases. The mock response for each case should contain the expected patterns so cases pass in mock mode. This could be a documentation update or a helper script that generates the mapping. At minimum, update any CI configuration or test fixtures that set this env var.
  **Files**:
  - `src/features/evals/executors/model-response.test.ts` — update test mock mapping key from `openai/gpt-5` to `github-models/gpt-4o-mini`
  - Add documentation comment in `model-response.ts` explaining the mock mapping format
  **Acceptance**: `bun test` passes with updated mock mapping. Mock mode works for all 10 cases.

- [ ] 10. **Add tests for live mode executor**
  **What**: Add unit tests for the live mode branch in `model-response.ts`. Tests should:
  - Verify live mode throws if `GITHUB_TOKEN` is missing
  - Verify live mode calls `callGitHubModels` with correct params (mock the fetch call)
  - Verify mock mode still works when `executionMode` is undefined (backward compat)
  - Verify `github-models-api.ts` handles API errors (non-200 responses)
  **Files**:
  - `src/features/evals/executors/model-response.test.ts` — add live mode tests
  - `src/features/evals/executors/github-models-api.test.ts` (create) — test API caller in isolation
  **Acceptance**: `bun test` passes. Live mode error cases covered.

- [ ] 11. **Add async runner tests**
  **What**: Update `runner.test.ts` to handle the now-async `runEvalSuite`. Existing tests should work with `await`. Add a test verifying that live mode adds delay between cases (can use timing assertion or mock `sleep`).
  **Files**:
  - `src/features/evals/runner.test.ts` — update existing tests to `await`, add live-mode delay test
  **Acceptance**: `bun test` passes. Runner tests verify both sync-equivalent mock behavior and async live behavior.

## Verification
- [ ] `bun test` — all unit tests pass, no regressions
- [ ] `bun run eval --suite phase1-core` — Phase 1 evals unaffected
- [ ] `bun run eval --suite phase2-loom-pilot` — runs 10 cases in mock mode, all pass
- [ ] `WEAVE_EVAL_MODE=live GITHUB_TOKEN=ghp_xxx bun run eval --suite phase2-loom-pilot` — runs 10 cases against GitHub Models API, ≥8 pass
- [ ] `bun run eval --suite phase2-loom-pilot --live --case route-to-spindle-research` — runs single case in live mode
- [ ] `bun run script/eval-spike-github-models.ts --dry-run` — spike still works independently
- [ ] `bun run typecheck` — no type errors
- [ ] No new entries in `package.json` dependencies

## Potential Pitfalls

| Risk | Mitigation |
|------|------------|
| **Async conversion breaks callers** | TODO 1 is deliberately first — convert signatures before adding any live logic. Run full test suite after this step alone. |
| **Mock mapping key change breaks CI** | TODO 7 and 9 must be done together. If CI sets `WEAVE_EVAL_MOCK_RESPONSES` with old keys (`openai/gpt-5`), it will break. Coordinate the key change. |
| **Rate limiting not sufficient** | 1s delay matches the spike's proven approach. GitHub Models Low tier allows 15 req/min; 10 cases with 1s gaps = ~10s total, well within limits. |
| **`llm-judge` evaluator uses exact match, not case-insensitive** | The existing `llm-judge.ts` uses `output.includes(pattern)` — exact, case-sensitive. The spike uses `toLowerCase()`. For live mode, agent names appear lowercase in Loom's prompt, so the model should echo them lowercase. If flaky, consider adding case-insensitive option to `llm-judge` evaluator. |
| **Self-handle cases need different evaluator shape** | Self-handle cases have empty `expectedContains` and broad `forbiddenContains`. The `llm-judge` evaluator handles this (it checks for non-empty output when no patterns specified). But `excludes-all` evaluator runs against `renderedPrompt`, not `modelOutput`. May need to add `excludes-all` support for `modelOutput` or stick with `llm-judge` for all cases. |
| **Existing Phase 2 cases tested with `openai/gpt-5` mock key** | Tests and CI may reference the old key. A search-and-replace across test files is needed when updating provider/model. |
