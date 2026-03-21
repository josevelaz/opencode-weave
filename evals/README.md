# Weave Evals

Phase 1 ships a repo-native, deterministic eval harness for prompt and agent contract coverage.

## What Phase 1 Covers

- Deterministic prompt-contract checks only
- Built-in agents only: Loom, Tapestry, Pattern, Thread, Spindle, Weft, Warp
- Local and CI-safe execution with no provider credentials
- Machine-readable run artifacts under `.weave/evals/`

## What Phase 1 Does Not Cover

- No live provider calls
- No CI baseline gating yet
- No trajectory or multi-step replay evals yet
- No Shuttle coverage in the initial suite

Shuttle is intentionally deferred because its behavior is category/config driven, while Phase 1 focuses on the highest-value prompt contracts first.

## Layout

- `evals/suites/*.jsonc` - suite manifests
- `evals/cases/**/*.jsonc` - committed eval cases
- `.weave/evals/runs/*.json` - local run artifacts
- `.weave/evals/latest.json` - latest run convenience copy

## Suite Roles

- `phase1-core`: full deterministic contract suite used for deeper validation in the dedicated eval workflow.
- `pr-smoke`: intentionally tiny deterministic subset for fast PR feedback.

Current `pr-smoke` composition:

- Loom default contract
- Tapestry default contract
- Thread read-only contract
- Warp security-audit contract

Keep deterministic smoke coverage and Fleet end-to-end smoke coverage separate:

- Deterministic eval smoke (this folder) validates prompt-contract behavior quickly and without providers.
- Fleet E2E smoke tests are tracked separately in `.weave/plans/workflow-smoke-tests.md` and validate runtime session behavior.

## Running Evals

```bash
bun run eval --suite phase1-core

# Fast deterministic smoke suite (PR-focused)
bun run eval:smoke
```

Useful filters:

```bash
bun run eval --suite phase1-core --agent loom
bun run eval --suite phase1-core --case loom-default-contract
bun run eval --suite phase1-core --tag composer --json
bun run eval --suite phase1-core --output /tmp/weave-evals.json

# Compare against baseline (defaults to evals/baselines/{suite}.json when present)
bun run eval --suite phase1-core --baseline evals/baselines/phase1-core.json

# Smoke suite baseline comparison
bun run eval --suite pr-smoke --baseline evals/baselines/pr-smoke.json

# Fail command when baseline comparison reports regression
bun run eval --suite phase1-core --baseline evals/baselines/phase1-core.json --fail-on-regression

# Refresh baseline intentionally
bun run eval --suite phase1-core --update-baseline
bun run eval --suite pr-smoke --update-baseline
```

Filter precedence and behavior:

- `--suite` selects the manifest; defaults to `phase1-core`
- `--case` narrows within the selected suite
- `--agent` and `--tag` are intersecting filters
- `--output` overrides the primary artifact path
- `--json` changes stdout formatting only; artifacts are still written

Exit codes:

- `0` all selected cases passed
- `1` one or more selected cases failed
- `2` usage or selector error
- `3` schema/load/config error
- `4` unexpected internal runner error

## Writing Cases

Use structural checks first:

- XML section boundaries
- ordered anchors
- tool policy expectations
- minimum length or intent markers

Prefer stable contract anchors over brittle paragraph equality. If a future prompt needs an eval-only boundary, use:

```html
<!-- weave-eval:anchor-name -->
```

Only use exact phrase checks when wording itself is normative.

## Coverage

Phase 1 coverage threshold for `src/features/evals/**` is 85% for lines and functions, excluding fixtures.

```bash
bun run eval:coverage
```

## CI Strategy

- `ci.yml` runs only the tiny deterministic `pr-smoke` suite for fast blocking feedback
- `evals.yml` runs full deterministic suites with baseline comparison (`phase1-core` + `pr-smoke`), eval coverage, and artifact upload
- Provider-backed judge runs belong in dedicated manual or scheduled workflows later
- Expensive eval classes should not become accidental always-on blockers

### Phase 2 Loom Pilot Trigger (manual)

`evals.yml` includes a manual `workflow_dispatch` path for `phase2-loom-pilot`.

- Set `run_phase2_pilot=true` to run the pilot.
- Optional input `phase2_mock_responses` can override `WEAVE_EVAL_MOCK_RESPONSES` JSON.
- Pilot job is intentionally **non-blocking** (`continue-on-error: true`) and is not part of default PR gating.
- Pilot artifacts are uploaded as `phase2-loom-pilot-artifacts`.

## Future Phases

- `target.kind` is ready for custom-agent, single-turn, and trajectory targets
- `executor.kind` is ready for `model-response` and `trajectory-run`
- `evaluator.kind` is ready for `llm-judge`, `baseline-diff`, and `trajectory-assertion`
- Promptfoo, if adopted later, should be an adapter behind executor/judge layers rather than the canonical schema owner
- Provider-backed evals must use env-only secrets and must never persist raw tokens, keys, or auth headers in artifacts

## Phase 2 Pilot Guardrails

- Phase 2 pilot uses `model-response` + `llm-judge` in a tightly scoped Loom-only suite.
- Current pilot path is intentionally mock-driven via `WEAVE_EVAL_MOCK_RESPONSES` and manual workflow execution.
- Never store provider secrets in case files, suite files, or committed baselines.
- Artifacts must not include auth headers, API keys, bearer tokens, or raw provider secret values.
