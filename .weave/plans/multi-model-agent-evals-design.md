# Multi-Model Agent Evals Design

## TL;DR
> **Summary**: Add explicit top-level run metadata for provider/model and keep a single canonical JSONL per suite, then teach CI, the trend report, and the website to group and compare runs by model. Backfill the existing unlabeled `agent-routing` history as `github-models/gpt-4o` so current history is preserved and remains comparable. The website target state is a per-model × per-case comparison matrix with pass/fail, score shown as a percentage, pass-rate style summaries, and a compact last-6-run trend/stability view.
> **Estimated Effort**: Medium

## Context
### Original Request
Design a practical approach for supporting multi-model agent evals in this repo and surfacing them cleanly in `/Users/pgermishuys/source/weave-website`. Specifically: recommend the CI matrix shape, result schema changes, storage strategy, trend-report changes, website data model/UI, rollout plan, and backward-compatibility handling.

### Key Findings
- `weave` currently appends one JSONL line per suite run to `evals/results/{suite}.jsonl` via `appendEvalRunJsonl()` in `src/features/evals/storage.ts`.
- The canonical run type `EvalRunResult` in `src/features/evals/types.ts` / `schema.ts` has no top-level provider/model metadata today.
- The eval runner already receives `providerOverride` / `modelOverride` in `ExecutionContext`, so the missing piece is persistence, not execution plumbing.
- CI currently runs one live routing eval job and appends only `evals/results/agent-routing.jsonl` in `.github/workflows/evals.yml`.
- `script/eval-trend-report.ts` already supports both legacy spike rows and main-format rows, but normalizes main-format rows to `model: "unknown"`.
- `/Users/pgermishuys/source/weave-website/evals/index.html` fetches the single `agent-routing.jsonl` file and assumes one run stream, with main-format rows also normalized to `model: 'unknown'`.
- Existing unlabeled `agent-routing` history is known and should be treated as `github-models/gpt-4o`, not shown as a generic legacy bucket.
- The website is a static page with client-side JSONL parsing, so the safest first step is to keep raw data fetches simple and avoid introducing a new backend.

## Objectives
### Core Objective
Enable CI to run the same eval suite across multiple provider/model combinations and let both the trend tooling and website compare scenario outcomes per model without breaking historical data.

### Deliverables
- [x] Backward-compatible multi-model run metadata design for `EvalRunResult`
- [x] CI matrix design that captures provider+model cleanly and writes comparable history
- [x] Storage, trend-report, and website recommendations with explicit tradeoffs
- [x] Explicit history backfill guidance for existing `gpt-4o` rows

### Definition of Done
- [x] A documented preferred design exists covering CI, schema, storage, reporting, UI, rollout, and compatibility
- [x] The design identifies exact files to change in `weave` and `/Users/pgermishuys/source/weave-website`

### Guardrails (Must NOT)
- Must NOT require a new backend service or database for the first rollout
- Must NOT break existing `agent-routing.jsonl` readers when old rows are still present
- Must NOT lose or discard current unlabeled history during the transition
- Must NOT rewrite historical JSONL rows with guessed provenance; backfill only when provenance is known
- Must NOT encode too many matrix dimensions into the initial canonical identity; provider+model is the minimum viable comparison key

## TODOs

- [x] 1. Preferred architecture and tradeoff decision
  **What**: Adopt a **single canonical JSONL per suite** as the source of truth (preferred), with each line representing one suite run and including top-level run metadata: `provider`, `model`, and a stable combined label such as `modelKey` (`github-models/gpt-4o-mini`). Do not split canonical history by model in phase 1. If needed later, emit derived per-model views for convenience, not as the primary store.
  **Files**: `src/features/evals/types.ts`, `src/features/evals/schema.ts`, `script/eval-trend-report.ts`, `.github/workflows/evals.yml`, `/Users/pgermishuys/source/weave-website/evals/index.html`
  **Acceptance**: The design clearly states that the preferred option is combined canonical storage with explicit metadata, and includes tradeoffs vs per-model files.

- [x] 2. CI matrix recommendation
  **What**: Use a two-level matrix identity:
  - required dimensions: `provider`, `model`
  - optional metadata, not primary dimensions: `suite`, `trigger`, `branch`, `commitSha`
  Keep `suite` outside the model matrix when possible (`agent-routing` remains its own job or reusable workflow input). Avoid adding temperature/prompt-version/region as matrix axes in phase 1; capture those as metadata only if needed. Recommended initial matrix size: 3-5 curated models total, not every available model.

  Preferred CI shape:
  - deterministic suites stay unchanged
  - live `agent-routing` job becomes a matrix over curated `{ provider, model }`
  - each matrix cell runs independently, appends one row to the canonical suite JSONL, and publishes the same metadata in the job summary/artifact name

  Tradeoffs:
  - combined matrix job gives fast side-by-side comparisons and reuses the existing suite result format
  - too many dimensions create sparse history and unreadable trends; provider+model is enough until there is a real comparison need for prompt version or environment
  **Files**: `.github/workflows/evals.yml`
  **Acceptance**: The plan names provider+model as the minimum encoded comparison dimensions and caps initial matrix breadth.

- [x] 3. Result schema recommendation
  **What**: Extend `EvalRunResult` with an optional top-level `runMetadata` object so existing rows still validate. Preferred shape:

  ```ts
  runMetadata?: {
    provider?: string
    model?: string
    modelKey?: string        // `${provider}/${model}`
    source?: "local" | "ci" | "scheduled" | "workflow_dispatch"
    repo?: string
    branch?: string
    commitSha?: string
    workflow?: string
    job?: string
    matrix?: Record<string, string>
  }
  ```

  Also add optional per-case metadata only where it helps comparison, not as a full duplicate of run metadata. Preferred per-case additions are:
  - `caseResults[].metadata?.scenarioTags?: string[]` only if the suite needs richer scenario grouping than `caseId` / `description`
  - no per-case provider/model duplication in phase 1

  Tradeoffs:
  - `runMetadata` keeps top-level keys stable and is backward-compatible
  - putting provider/model as new flat top-level keys is simpler to query but less extensible; `runMetadata` is preferred because more CI context is likely soon
  - per-case metadata should stay minimal to avoid bloating every line
  **Files**: `src/features/evals/types.ts`, `src/features/evals/schema.ts`, `src/features/evals/runner.ts`, `script/eval.ts`
  **Acceptance**: The recommended schema explicitly includes provider/model metadata and keeps it optional for historical rows.

- [x] 4. Storage strategy recommendation
  **What**: Prefer **both, with one canonical and one optional derived form**:
  - canonical: `evals/results/{suite}.jsonl`
  - optional derived/exported convenience files later: `evals/results/{suite}--{provider}--{model}.jsonl` or a generated summary JSON for the website

  Preferred option for phase 1 is to write **only the canonical combined JSONL** and let downstream tools group by `runMetadata.modelKey`.

  Historical-data requirement:
  - keep the current `evals/results/agent-routing.jsonl` file as the canonical history source
  - do a one-time backfill of existing unlabeled rows with known metadata: `provider = github-models`, `model = gpt-4o`, `modelKey = github-models/gpt-4o`
  - do not split old vs new history into separate files

  Tradeoffs:
  - combined only: best for history integrity, simplest append path, one fetch URL, easiest backward compatibility
  - per-model only: easier charting, but fragments history and complicates cross-model comparisons and backfills
  - both: best long-term ergonomics, but derived files must be treated as build artifacts to avoid divergence
  **Files**: `src/features/evals/storage.ts`, `.github/workflows/evals.yml`, `script/eval-trend-report.ts`, `/Users/pgermishuys/source/weave-website/evals/index.html`
  **Acceptance**: The plan explicitly marks combined canonical JSONL as preferred and treats per-model files as optional derivatives, not primary storage.

- [x] 5. Trend-report recommendation
  **What**: Update `script/eval-trend-report.ts` so normalization produces:
  - `modelKey = runMetadata.modelKey ?? backfilled known-history value ?? unknown fallback`
  - grouped analysis by model stream
  - optional aggregate analysis across all runs only when requested

  Preferred report behavior:
  - default: analyze one model stream at a time via `--model-key` filter, or auto-select the latest model if only one exists
  - add `--compare-models` to print the latest score/pass-rate per model for the same suite
  - when no metadata exists, fall back to `unknown` and keep existing behavior, but the goal is to backfill the known `gpt-4o` history so `unknown` should become rare for `agent-routing`

  Recommended outputs:
  - per-model score trend
  - latest-run comparison table across models
  - per-case/scenario comparison table showing pass/fail or score by model for the latest run of each model

  Tradeoffs:
  - mixing all models in one historical sparkline is misleading; trends should be per model
  - a separate comparison table is a better cross-model view than a single merged trajectory
  **Files**: `script/eval-trend-report.ts`
  **Acceptance**: The recommendation separates per-model trends from cross-model comparison output and preserves `unknown` fallback behavior.

- [x] 6. Website data model and UI recommendation
  **What**: Keep the website on a single fetch to the canonical suite JSONL in phase 1, but normalize rows into this client-side shape:

  ```ts
  {
    suiteId,
    timestamp,
    modelKey,
    provider,
    model,
    score,
    passedCases,
    totalCases,
    durationMs,
    caseResults: [{ caseId, description, passed, score }]
  }
  ```

  Preferred UI pattern:
  - top filter bar: suite selector, model multi-select, “latest only” / “trend” toggle
  - summary cards: best latest model, worst latest model, score spread, total models tracked
  - chart 1: multi-line score trend with one line per selected model
  - chart 2 / primary comparison surface: scenario comparison matrix (`caseId` rows, model columns, latest score/pass state in each cell)
  - detail table: per-scenario deltas, sortable by spread, failure count, or pass rate
  - optional model detail drawer/panel to inspect one model’s historical run stream

  Expected website end state after execution:
  - a clear per-model matrix where each row is an eval case/scenario and each column is a model
  - cells show at least pass/fail and normalized score for the latest run of that model, with normalized scores displayed to users as percentages (e.g. `1.0` → `100%`)
  - cells also expose a compact recent-history view for the last 6 runs of that model/case combination (sparkline, mini dots, or hover detail)
  - model-level summary information includes total passed cases, total cases, and pass rate
  - historical `gpt-4o` runs appear inline as the `github-models/gpt-4o` column/series, not as a separate legacy bucket

  UI guardrails:
  - default to latest comparison across models, not all-time merged stats
  - backfilled `github-models/gpt-4o` history should participate normally in comparisons
  - only hide/badge truly unknown rows separately if any remain after backfill
  - keep the matrix readable: the latest result is the primary cell content, while last-6-run history is secondary/compact rather than a full expanded list in each cell
  - if there are too many models, default-select the top 3-5 and allow expansion

  Tradeoffs:
  - single-page client grouping is the smallest safe change
  - a precomputed summary JSON could improve load time later, but adds another artifact to maintain
  **Files**: `/Users/pgermishuys/source/weave-website/evals/index.html`
  **Acceptance**: The recommendation defines a concrete normalized row shape and UI pattern for scenario-by-model comparison.

- [x] 7. Phased rollout recommendation
  **What**: Roll out in four steps, smallest safe step first:
  1. **Schema + history backfill**: add optional `runMetadata.provider/model/modelKey`, persist it on new runs, and backfill existing unlabeled `agent-routing` rows as `github-models/gpt-4o`
  2. **CI matrix pilot**: run `agent-routing` for 2-3 curated models, append into the same JSONL, and make sure matrix fan-in preserves the backfilled history
  3. **Reporting + website compare views**: add grouped trend-report output and website multi-model comparison UI, with the primary surface being the scenario-by-model matrix and compact last-6-run history per cell/model
  4. **Derived artifacts if needed**: add generated comparison JSON or per-model convenience files only if page size/perf becomes a real issue

  This is the preferred rollout because it preserves current `gpt-4o` history immediately, yields usable labeled data after step 1, and useful comparisons after step 2 without forcing a storage migration.
  **Files**: `src/features/evals/types.ts`, `src/features/evals/schema.ts`, `src/features/evals/runner.ts`, `script/eval.ts`, `.github/workflows/evals.yml`, `script/eval-trend-report.ts`, `/Users/pgermishuys/source/weave-website/evals/index.html`
  **Acceptance**: The rollout starts with optional schema extension and preserves existing consumers until comparison UI is ready.

- [x] 8. Backward-compatibility and historical-data guidance
  **What**: Treat old rows as first-class historical data and backfill them when provenance is known. Recommended handling:
  - keep schema additions optional
  - keep current main-format detection logic valid
  - backfill the current unlabeled `agent-routing` rows to `github-models/gpt-4o`
  - preserve file order/history semantics while enriching rows with metadata
  - only use `unknown` fallback for rows whose provenance is genuinely uncertain
  - if a cleanup is desired later, add a one-off offline migration script that backfills only when provenance is certain

  Pitfalls to call out:
  - commit races when multiple matrix jobs append/push the same JSONL file
  - misleading trends if different models are merged into one line chart
  - changing matrix membership over time makes “best model” metrics noisy
  - larger JSONL files can slow static-page rendering if every run is plotted client-side
  - provider/model naming drift (`gpt-4o-mini` vs `openai/gpt-4o-mini`) can fragment history unless `modelKey` is normalized centrally
  - incorrect historical backfill would permanently distort comparisons, so the backfill script must be explicit and one-time

  Recommended mitigation for commit races: each matrix job uploads its run artifact, then a single fan-in job downloads and appends/sorts/dedupes the canonical JSONL before one commit. This is preferable to every matrix cell pushing directly.
  **Files**: `.github/workflows/evals.yml`, `script/eval-trend-report.ts`, `/Users/pgermishuys/source/weave-website/evals/index.html`
  **Acceptance**: The plan explicitly addresses known-history backfill to `github-models/gpt-4o`, true-unknown fallback, and matrix-write race conditions.

## Verification
- [x] All tests pass
- [x] No regressions
- [x] Schema validation accepts old rows and new rows with `runMetadata`
- [x] Existing `agent-routing` history is preserved and backfilled to `github-models/gpt-4o`
- [x] CI design avoids concurrent direct pushes from each matrix cell to the same JSONL file
- [x] Website design supports both per-model historical trends and a latest cross-model scenario matrix with pass/fail, normalized score shown as a percentage, pass-rate style summaries, and compact last-6-run history
