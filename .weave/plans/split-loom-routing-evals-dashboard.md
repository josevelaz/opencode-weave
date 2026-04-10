# Split Loom Routing Evals and Dashboard

## TL;DR
> **Summary**: Split **Loom** routing coverage into separate Identity and Intent suites in `weave`, keep the existing `agent-trajectory` suite as the canonical Trajectory source, move the Tapestry post-execution routing/review case into its own Tapestry-focused suite, add only minimal suite metadata to emitted run JSON, then update the static `weave-website` dashboard to load Identity, Intent, and Trajectory views plus a commit-aligned Overview aggregate.
> **Estimated Effort**: Large

## Context
### Original Request
Split Loom routing evals into identity vs intent, keep trajectory as a separate dimension, and update the website to present those dimensions clearly.

### Key Decisions
- **Loom-only routing suites**: Loom routing results should not be polluted by non-Loom cases.
- **Tapestry separation**: The existing Tapestry post-execution reviewer-routing case moves to a dedicated Tapestry-focused suite.
- **Canonical trajectory source**: Keep `evals/suites/agent-trajectory.jsonc` as the only canonical Trajectory suite; do not introduce a duplicate `agent-routing-trajectory` stream in v1.
- **Minimal schema scope**: Add only minimal suite metadata needed by the website, specifically a `suiteMetadata` block with `title` and `routingKind`.
- **Commit-aligned overview**: The website Overview must combine Identity / Intent / Trajectory only when the runs belong to the same commit or run group for a given model.
- **Broader CI triggers**: Live routing evals must rerun when routing-related prompts, suites, cases, evaluator logic, schema/runner code, or workflow logic changes.

### Current-State Findings
- Loom prompt narration currently explains delegation but does **not** explicitly require naming the delegated agent.
- Pattern vs Shuttle guidance is currently broad enough to create ambiguity in implicit domain-work cases.
- `llm-judge` currently supports `expectedContains` and `forbiddenContains` only.
- Eval run JSON includes `suiteId` and `phase`, but not explicit suite metadata for website grouping.
- CI currently publishes one routing JSONL feed: `evals/results/agent-routing.jsonl`.
- The website dashboard is a single static page that loads exactly one JSONL feed.

## Objectives
### Core Objective
Separate routing evaluation into three interpretable dimensions:
- **Identity**: Did Loom explicitly choose/name the right agent?
- **Intent**: Did Loom show the correct orchestration behavior even if wording varies?
- **Trajectory**: Did the observed multi-turn delegation chain follow the expected path?

### Deliverables
- [ ] Loom prompt guidance updated so delegation narration explicitly names the delegated agent and clarifies Pattern vs Shuttle boundaries.
- [ ] New Loom-only suite layout with `agent-routing-identity` and `agent-routing-intent`.
- [ ] Existing `agent-trajectory` retained as the canonical trajectory suite.
- [ ] Tapestry post-execution routing coverage moved to a separate Tapestry-focused suite.
- [ ] Minimal eval schema/output change so website code can group runs by routing kind without brittle suite-id parsing.
- [ ] CI fan-out/fan-in updated to publish separate canonical JSONL files per suite.
- [ ] `/Users/pgermishuys/source/weave-website/evals/index.html` updated to support Overview, Identity, Intent, and Trajectory views.

### Definition of Done
- [ ] `bun test` passes in `/Users/pgermishuys/source/weave`.
- [ ] `bun run eval --suite agent-routing-identity --provider openrouter --model openai/gpt-5.4 --json` succeeds locally.
- [ ] `bun run eval --suite agent-routing-intent --provider openrouter --model openai/gpt-5.4 --json` succeeds locally.
- [ ] `bun run eval --suite agent-trajectory --json` succeeds locally.
- [ ] `bun run eval --suite tapestry-routing-review --json` succeeds locally.
- [ ] `bun run script/eval-trend-report.ts --suite agent-routing-identity --model-key openrouter/openai/gpt-5.4` succeeds.
- [ ] `bun run script/eval-trend-report.ts --suite agent-routing-intent --model-key openrouter/openai/gpt-5.4` succeeds.
- [ ] `bun run script/eval-trend-report.ts --suite agent-trajectory --model-key openrouter/openai/gpt-5.4` succeeds.
- [ ] `/Users/pgermishuys/source/weave-website/evals/index.html` renders all four views against published JSONL files without requiring a backend.

### Guardrails (Must NOT)
- [ ] Do not redesign the whole eval framework; keep changes additive and optional.
- [ ] Do not require a server-side API or database for the website dashboard.
- [ ] Do not break old JSONL readers; new run fields must be backward-compatible optional additions.
- [ ] Do not create a duplicate trajectory suite if the existing `agent-trajectory` suite can remain canonical.
- [ ] Do not mix cross-suite Overview metrics across different commits when a commit-aligned comparison is unavailable.

## TODOs

- [x] 1. Tighten Loom routing instructions
  **What**: Update Loom prompt composition so delegation narration explicitly tells Loom to name the delegated agent in user-facing text. Clarify the routing boundary so `Pattern` is for planning/scoping/work breakdown before substantial implementation, while `Shuttle` is for domain/category specialist work when the main need is the specialist domain itself.
  **Files**: `/Users/pgermishuys/source/weave/src/agents/loom/prompt-composer.ts`, `/Users/pgermishuys/source/weave/src/agents/loom/prompt-composer.test.ts`, `/Users/pgermishuys/source/weave/evals/rubrics/loom-routing-rubric.md`
  **Acceptance**: Prompt tests assert the explicit “name the delegated agent” rule and the Pattern-vs-Shuttle distinction appears in prompt text and rubric wording.

- [x] 2. Add minimal suite metadata and intent matcher support
  **What**: Add optional suite metadata to eval manifests/results in the smallest useful form. Recommended shape: `suiteMetadata?: { title: string; routingKind?: "identity" | "intent" | "trajectory" | "other" }`. Keep `suiteId` and `phase` unchanged. Extend `llm-judge` with a simple OR-style matcher (`expectedAnyOf` or equivalent) so intent cases can accept multiple approved phrasings while identity cases remain strict.
  **Files**: `/Users/pgermishuys/source/weave/src/features/evals/types.ts`, `/Users/pgermishuys/source/weave/src/features/evals/schema.ts`, `/Users/pgermishuys/source/weave/src/features/evals/index.ts`, `/Users/pgermishuys/source/weave/src/features/evals/runner.ts`, `/Users/pgermishuys/source/weave/src/features/evals/schema.test.ts`, `/Users/pgermishuys/source/weave/src/features/evals/runner.test.ts`, `/Users/pgermishuys/source/weave/src/features/evals/storage.test.ts`, `/Users/pgermishuys/source/weave/src/features/evals/evaluators/llm-judge.ts`, `/Users/pgermishuys/source/weave/src/features/evals/evaluators/llm-judge.test.ts`
  **Acceptance**: Run JSON validates with and without the new optional fields, old JSONL lines still parse, and intent cases can use OR-style matching without weakening identity suites.

- [x] 3. Split Loom routing suites and separate Tapestry coverage
  **What**: Introduce two explicit Loom-only suite manifests: `evals/suites/agent-routing-identity.jsonc` and `evals/suites/agent-routing-intent.jsonc`. Keep strict Loom routing files under `evals/cases/loom/routing/*.jsonc` for Identity coverage. Add intent-oriented files under `evals/cases/loom/routing-intent/*.jsonc`. Keep `evals/suites/agent-trajectory.jsonc` as the canonical Trajectory suite. Move `evals/cases/trajectory/tapestry-post-execution-review.jsonc` out of Loom trajectory/routing reporting into a dedicated suite such as `evals/suites/tapestry-routing-review.jsonc`.
  **Files**: `/Users/pgermishuys/source/weave/evals/suites/agent-routing.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/agent-routing-identity.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/agent-routing-intent.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/agent-trajectory.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/tapestry-routing-review.jsonc`, `/Users/pgermishuys/source/weave/evals/cases/loom/routing/*.jsonc`, `/Users/pgermishuys/source/weave/evals/cases/loom/routing-intent/*.jsonc`, `/Users/pgermishuys/source/weave/evals/cases/trajectory/tapestry-post-execution-review.jsonc`
  **Acceptance**: Identity suite reports only Loom identity checks, Intent suite reports Loom orchestration-intent checks, `agent-trajectory` remains the only canonical trajectory stream, and the Tapestry post-execution case is reported separately.

- [x] 4. Publish separate JSONL streams and broaden CI triggers
  **What**: Update CI so each model run emits one artifact per relevant suite and fan-in merges them into separate canonical JSONLs: `evals/results/agent-routing-identity.jsonl`, `evals/results/agent-routing-intent.jsonl`, `evals/results/agent-trajectory.jsonl`, and `evals/results/tapestry-routing-review.jsonl` if that suite is published. Broaden the current change-detection logic so live routing evals run when routing prompts, suite manifests, case files, evaluator logic, eval schema/runner/storage logic, or the workflow itself changes.
  **Files**: `/Users/pgermishuys/source/weave/.github/workflows/evals.yml`, `/Users/pgermishuys/source/weave/script/eval-trend-report.ts`, `/Users/pgermishuys/source/weave/script/eval.ts`
  **Acceptance**: CI artifacts contain one run JSON per published suite per model, fan-in writes separate canonical JSONLs, and routing-related code or manifest changes trigger the live suites.

- [x] 5. Update the static website dashboard
  **What**: Refactor `/Users/pgermishuys/source/weave-website/evals/index.html` to load a small hardcoded list of suite feeds instead of one `DATA_URL`. Add tabs for `Overview`, `Identity`, `Intent`, and `Trajectory`. Map `Trajectory` to the canonical `agent-trajectory` feed. Build Overview from the latest run per model per suite **only when Identity, Intent, and Trajectory belong to the same commit/run group**. If not, mark the model as partial or omit the combined row rather than mixing snapshots.
  **Files**: `/Users/pgermishuys/source/weave-website/evals/index.html`
  **Acceptance**: The dashboard renders four views, each detailed tab reads only its suite stream, and Overview shows combined per-model metrics only when the underlying data is commit-aligned.

- [x] 6. Roll out safely and verify compatibility
  **What**: Roll out in this order: (1) prompt wording and evaluator/schema support, (2) new Loom suites and Tapestry suite separation, (3) CI publishing of new JSONLs while legacy files still exist, (4) website switched to new feeds, (5) optional cleanup/deprecation of old `agent-routing` paths after data proves stable. Watch for these risks: old JSONL consumers ignoring new fields, intent cases becoming too loose, mixed-commit overview rows, and accidental double-counting of trajectory data.
  **Acceptance**: Legacy JSON remains readable, new JSONL files publish side-by-side, the website never double-counts trajectory coverage, and commit-misaligned Overview rows are withheld or marked partial.

## Verification
- [x] All tests pass
- [x] No regressions
- [x] `bun test /Users/pgermishuys/source/weave/src/agents/loom/prompt-composer.test.ts /Users/pgermishuys/source/weave/src/features/evals/**/*.test.ts`
- [x] `bun run eval --suite agent-routing-identity --provider openrouter --model openai/gpt-5.4 --json`
- [x] `bun run eval --suite agent-routing-intent --provider openrouter --model openai/gpt-5.4 --json`
- [x] `bun run eval --suite agent-trajectory --json`
- [x] `bun run eval --suite tapestry-routing-review --json`
- [x] `bun run script/eval-trend-report.ts --suite agent-routing-identity --model-key openrouter/openai/gpt-5.4`
- [x] `bun run script/eval-trend-report.ts --suite agent-routing-intent --model-key openrouter/openai/gpt-5.4`
- [x] `bun run script/eval-trend-report.ts --suite agent-trajectory --model-key openrouter/openai/gpt-5.4`
- [x] Serve `/Users/pgermishuys/source/weave-website` locally and verify Overview, Identity, Intent, and Trajectory tabs against the published raw GitHub JSONL endpoints
