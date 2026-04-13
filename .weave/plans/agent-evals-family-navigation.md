# Refactor Agent Evals Website into Evaluation-Family Navigation

## TL;DR
> **Summary**: Rework the eval section from a flat suite-first dashboard into a family-first section with a landing page plus dedicated family pages, while keeping `weave` as the source of canonical per-suite JSONL feeds and adding just enough family metadata to make those feeds self-describing. Keep Loom Routing and Tapestry Execution isolated so each family can present its own model matrix without polluting the other.
> **Estimated Effort**: Large

## Context
### Original Request
Refactor the Agent Evaluations website section across `/Users/pgermishuys/source/weave` and `/Users/pgermishuys/source/weave-website` so navigation is based on evaluation families rather than one global Loom-first overview. Initial target families are:
- Loom Routing: family overview + Identity + Intent + Trajectory
- Tapestry Execution: family overview + Execution Contracts
- Tapestry Review: reserved/future only if it improves the design now

### Key Findings
- `weave` already split Loom routing into `agent-routing-identity`, `agent-routing-intent`, and `agent-trajectory`, and keeps `tapestry-execution-contracts` isolated with its own dedicated model set (`openai/gpt-5.4`, `anthropic/claude-sonnet-4.6`).
- Current suite metadata in `weave` includes `title` and optional `routingKind`, but nothing that identifies a broader evaluation family or family view.
- Current website logic in `/Users/pgermishuys/source/weave-website/evals/index.html` already hardcodes suite feeds and a `group` string, but it is still one monolithic page with flat tabs, not a real family-first information architecture.
- The website Overview is currently Loom-only and intentionally excludes Tapestry Execution because the model matrices differ; that separation is correct and should become a first-class family rule rather than an ad hoc exception.
- CI in `weave` already uses separate behavioral lanes and a dedicated Tapestry execution fan-in job, but published history still includes legacy artifacts such as `evals/results/agent-routing.jsonl` that must remain readable during migration.
- `tapestry-review-routing` and `tapestry-review-trajectory` already exist in `weave`, so the design can support a reserved Tapestry Review family now without forcing it into the public website nav before it is ready.
- Recommended website data model: keep per-suite JSONL feeds canonical in `weave`, add optional family/view identifiers to suite metadata, and introduce a website-owned family registry that defines IA, ordering, visibility, overview rules, and feed-to-view mapping.

## Objectives
### Core Objective
Create a family-driven eval section where each evaluation family owns its own overview, sub-navigation, model matrix, and copy, with Loom Routing and Tapestry Execution presented as separate top-level families rather than squeezed into one global dashboard.

### Deliverables
- [ ] Family-first eval IA defined and implemented for `/evals/`, `/evals/loom-routing/`, and `/evals/tapestry-execution/`
- [ ] Backward-compatible family/view metadata added to `weave` suite output so published feeds are self-describing
- [ ] Website family registry added so navigation and overview logic are driven by family config rather than hardcoded flat suite tabs
- [ ] Tapestry Execution feed publishing completed and validated with its dedicated model set only
- [ ] Legacy feeds remain readable during transition, especially `evals/results/agent-routing.jsonl`
- [ ] Reserved Tapestry Review support decided explicitly: either hidden registry entry now or deferred cleanly without blocking the redesign

### Definition of Done
- [ ] `bun test /Users/pgermishuys/source/weave/src/features/evals/**/*.test.ts` passes
- [ ] `bun run eval --suite agent-routing-identity --provider openrouter --model openai/gpt-5.4 --json` succeeds in `/Users/pgermishuys/source/weave`
- [ ] `bun run eval --suite agent-routing-intent --provider openrouter --model openai/gpt-5.4 --json` succeeds in `/Users/pgermishuys/source/weave`
- [ ] `bun run eval --suite agent-trajectory --json` succeeds in `/Users/pgermishuys/source/weave`
- [ ] `bun run eval --suite tapestry-execution-contracts --provider openrouter --model openai/gpt-5.4 --json` succeeds in `/Users/pgermishuys/source/weave`
- [ ] `bun run eval --suite tapestry-execution-contracts --provider openrouter --model anthropic/claude-sonnet-4.6 --json` succeeds in `/Users/pgermishuys/source/weave`
- [ ] `bun run script/eval-trend-report.ts --suite tapestry-execution-contracts --model-key openrouter/openai/gpt-5.4` succeeds in `/Users/pgermishuys/source/weave`
- [ ] A local static serve of `/Users/pgermishuys/source/weave-website` renders `/evals/`, `/evals/loom-routing/`, and `/evals/tapestry-execution/` with correct family-specific feeds and overview behavior

### Guardrails (Must NOT)
- [ ] Must NOT re-merge Loom Routing and Tapestry Execution into one shared overview or shared model matrix
- [ ] Must NOT break existing JSONL readers by making new suite/run metadata mandatory
- [ ] Must NOT require a new backend, API, or database for the website redesign
- [ ] Must NOT distort Loom Routing trends with Tapestry-only model coverage
- [ ] Must NOT delete or silently repurpose `evals/results/agent-routing.jsonl` during the first rollout
- [ ] Must NOT expose a public Tapestry Review family page unless its content and feed story are intentionally defined

## TODOs

- [ ] 1. Phase 1 — Define the family contract and target IA
  **What**: Lock the family-driven architecture before changing code. Recommended model:
  - `weave` keeps canonical storage as one JSONL per suite.
  - `weave` suite metadata grows optional family/view identity fields such as `familyId`, `familyTitle`, `viewId`, and `viewTitle` in addition to the existing `routingKind`.
  - `weave-website` owns a family registry that maps families to routes, view order, visibility, copy, overview rules, and feed URLs.
  - `/evals/` becomes a landing page listing active families; `/evals/loom-routing/` and `/evals/tapestry-execution/` become dedicated family pages with local subnav for Overview and child views.
  - Tapestry Review is modeled as `status: "reserved"` in the registry if the team wants the schema ready now, but it stays hidden from public nav until there is enough content to justify the page.
  **Files**: `/Users/pgermishuys/source/weave/src/features/evals/types.ts`, `/Users/pgermishuys/source/weave/src/features/evals/schema.ts`, `/Users/pgermishuys/source/weave/src/features/evals/schema.test.ts`, `/Users/pgermishuys/source/weave/src/features/evals/runner.test.ts`, `/Users/pgermishuys/source/weave-website/evals/index.html`, `/Users/pgermishuys/source/weave-website/evals/shared/family-config.js`
  **Acceptance**: The metadata shape is documented in code/tests, the website has one authoritative family registry, and the planned routes clearly separate family landing from family detail pages.

- [ ] 2. Phase 2 — Annotate `weave` suites with family/view metadata and preserve backward compatibility
  **What**: Update suite manifests and emitted run metadata so each feed can declare which family/view it belongs to without relying on brittle suite-id parsing. Annotate at least:
  - `agent-routing-identity` → family `loom-routing`, view `identity`
  - `agent-routing-intent` → family `loom-routing`, view `intent`
  - `agent-trajectory` → family `loom-routing`, view `trajectory`
  - `tapestry-execution-contracts` → family `tapestry-execution`, view `execution-contracts`
  - `tapestry-review-routing` and `tapestry-review-trajectory` → family `tapestry-review` only if reserved support is kept
  Keep all new fields optional in schemas and storage so old JSONL lines continue to validate. Keep `agent-routing.jsonc` and `agent-routing.jsonl` as legacy compatibility artifacts for one migration window.
  **Files**: `/Users/pgermishuys/source/weave/src/features/evals/types.ts`, `/Users/pgermishuys/source/weave/src/features/evals/schema.ts`, `/Users/pgermishuys/source/weave/src/features/evals/runner.ts`, `/Users/pgermishuys/source/weave/src/features/evals/storage.test.ts`, `/Users/pgermishuys/source/weave/src/features/evals/schema.test.ts`, `/Users/pgermishuys/source/weave/src/features/evals/runner.test.ts`, `/Users/pgermishuys/source/weave/evals/suites/agent-routing-identity.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/agent-routing-intent.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/agent-trajectory.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/tapestry-execution-contracts.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/tapestry-review-routing.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/tapestry-review-trajectory.jsonc`, `/Users/pgermishuys/source/weave/evals/suites/agent-routing.jsonc`
  **Acceptance**: New runs emit optional family/view metadata, old JSONL rows still parse, and no consumer is forced to understand family metadata on day one.

- [ ] 3. Phase 3 — Finish family-safe publishing rules in CI and trend tooling
  **What**: Ensure CI publishing and reporting align with the new family model. Publish and retain canonical per-suite JSONLs, including `evals/results/tapestry-execution-contracts.jsonl`, but never compute cross-family summaries in CI that mix Loom Routing and Tapestry Execution. Preserve separate fan-in behavior, and explicitly keep the Tapestry execution model set limited to `openai/gpt-5.4` and `anthropic/claude-sonnet-4.6`. If useful, extend trend-report output to surface family/view labels while remaining suite-keyed under the hood.
  **Files**: `/Users/pgermishuys/source/weave/.github/workflows/evals.yml`, `/Users/pgermishuys/source/weave/script/eval.ts`, `/Users/pgermishuys/source/weave/script/eval-trend-report.ts`, `/Users/pgermishuys/source/weave/evals/README.md`
  **Acceptance**: CI produces the suite feeds required by the website, Tapestry execution history is published without affecting Loom routing history, and trend tooling can analyze the execution-contract stream by its dedicated models.

- [ ] 4. Phase 4 — Replace the monolithic website page with family-first routes and shared client modules
  **What**: Redesign the static website section instead of layering more tabs onto the current one-file dashboard. Recommended structure:
  - `/Users/pgermishuys/source/weave-website/evals/index.html` → family landing page
  - `/Users/pgermishuys/source/weave-website/evals/loom-routing/index.html` → Loom Routing family page
  - `/Users/pgermishuys/source/weave-website/evals/tapestry-execution/index.html` → Tapestry Execution family page
  - optional `/Users/pgermishuys/source/weave-website/evals/tapestry-review/index.html` → reserved/coming-soon page only if the team wants explicit future signaling
  - shared JS/CSS modules for registry loading, JSONL normalization, chart rendering, table rendering, and graceful 404 handling
  Move the current inline feed config and rendering helpers out of the single HTML file into shared modules so each family page can declare its own overview and child views cleanly.
  **Files**: `/Users/pgermishuys/source/weave-website/evals/index.html`, `/Users/pgermishuys/source/weave-website/evals/loom-routing/index.html`, `/Users/pgermishuys/source/weave-website/evals/tapestry-execution/index.html`, `/Users/pgermishuys/source/weave-website/evals/tapestry-review/index.html`, `/Users/pgermishuys/source/weave-website/evals/shared/family-config.js`, `/Users/pgermishuys/source/weave-website/evals/shared/dashboard-data.js`, `/Users/pgermishuys/source/weave-website/evals/shared/dashboard-ui.js`, `/Users/pgermishuys/source/weave-website/evals/shared/dashboard.css`
  **Acceptance**: The website no longer depends on one monolithic eval page, each active family has its own route and local subnav, and missing/reserved feeds do not break the whole section.

- [ ] 5. Phase 5 — Implement family-specific overview behavior and model-matrix rules
  **What**: Encode overview behavior per family rather than globally:
  - Loom Routing overview combines Identity + Intent + Trajectory only when the latest runs for a model share the same `commitSha` or `runGroup`.
  - Tapestry Execution overview is built only from `tapestry-execution-contracts` and only across its dedicated execution models.
  - Reserved Tapestry Review, if present, should either show a clear coming-soon state or remain hidden; it must not display partial metrics as if the family were complete.
  - The website should use family registry rules first, and feed metadata second, to decide labels, visibility, alignment rules, and explanatory copy.
  - 404 or empty feeds should degrade to a scoped “not published yet” card instead of a fatal page-level error.
  **Files**: `/Users/pgermishuys/source/weave-website/evals/shared/family-config.js`, `/Users/pgermishuys/source/weave-website/evals/shared/dashboard-data.js`, `/Users/pgermishuys/source/weave-website/evals/shared/dashboard-ui.js`, `/Users/pgermishuys/source/weave-website/evals/loom-routing/index.html`, `/Users/pgermishuys/source/weave-website/evals/tapestry-execution/index.html`, `/Users/pgermishuys/source/weave-website/evals/tapestry-review/index.html`
  **Acceptance**: Loom Routing overview never includes Tapestry execution runs, Tapestry Execution shows only its dedicated matrix, commit-misaligned Loom rows are withheld or marked partial, and empty feeds fail soft at the family level.

- [ ] 6. Phase 6 — Migrate safely, validate published feeds, and stage legacy cleanup
  **What**: Roll out in this order:
  1. Add optional family/view metadata and suite annotations in `weave`.
  2. Ensure `tapestry-execution-contracts.jsonl` is publishing reliably from CI.
  3. Ship the new website family registry and route structure while still tolerating legacy rows with no family metadata.
  4. Validate family pages against published raw GitHub feeds.
  5. Only after stability is proven, decide whether to de-emphasize `agent-routing.jsonl` in docs/UI; keep the file readable until all known consumers are off it.

  Key migration notes and risks to manage:
  - Existing published JSONL feeds may contain rows without family metadata; the website must map those feeds by registry rather than requiring historical rewrites.
  - Deleting or renaming feed paths too early would break bookmarked raw URLs and any external consumers.
  - Family overviews can become misleading if they use “latest run wins” without commit/run-group alignment.
  - Tapestry Review already has suite artifacts, but publishing it as a visible family too early could imply a level of maturity or coverage that does not yet exist.
  - The execution-contract suite must stay isolated so its smaller, stronger model set does not skew Loom Routing coverage narratives.
  **Files**: `/Users/pgermishuys/source/weave/evals/README.md`, `/Users/pgermishuys/source/weave/.github/workflows/evals.yml`, `/Users/pgermishuys/source/weave-website/evals/index.html`, `/Users/pgermishuys/source/weave-website/evals/loom-routing/index.html`, `/Users/pgermishuys/source/weave-website/evals/tapestry-execution/index.html`, `/Users/pgermishuys/source/weave-website/evals/tapestry-review/index.html`
  **Acceptance**: The new family section works against live published feeds, legacy feed paths remain readable, and any cleanup of old feed references is postponed until after a verified transition window.

## Verification
- [ ] All tests pass
- [ ] No regressions
- [ ] `bun test /Users/pgermishuys/source/weave/src/features/evals/**/*.test.ts`
- [ ] `bun run eval --suite agent-routing-identity --provider openrouter --model openai/gpt-5.4 --json`
- [ ] `bun run eval --suite agent-routing-intent --provider openrouter --model openai/gpt-5.4 --json`
- [ ] `bun run eval --suite agent-trajectory --json`
- [ ] `bun run eval --suite tapestry-execution-contracts --provider openrouter --model openai/gpt-5.4 --json`
- [ ] `bun run eval --suite tapestry-execution-contracts --provider openrouter --model anthropic/claude-sonnet-4.6 --json`
- [ ] `bun run script/eval-trend-report.ts --suite tapestry-execution-contracts --model-key openrouter/openai/gpt-5.4`
- [ ] `bun run script/eval-trend-report.ts --suite tapestry-execution-contracts --model-key openrouter/anthropic/claude-sonnet-4.6`
- [ ] Serve `/Users/pgermishuys/source/weave-website` locally and verify `/evals/`, `/evals/loom-routing/`, and `/evals/tapestry-execution/` against published raw GitHub JSONL endpoints
- [ ] Confirm `https://raw.githubusercontent.com/pgermishuys/opencode-weave/main/evals/results/agent-routing.jsonl` remains readable during migration
