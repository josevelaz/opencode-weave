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

### Phase 2 Agent Routing (live-only)

`evals.yml` runs the `agent-routing` suite automatically every **Monday at 10:00 UTC** via a scheduled cron trigger, supports manual `workflow_dispatch`, and also runs on PR/push when prompt files change.

- Phase 2 is **live-only** — it calls a configured provider backend with Loom's real system prompt. No mock mode.
- Supported providers today: `github-models` and `openrouter`, but routing eval CI now standardizes on `openrouter` for operational simplicity.
- `openrouter` requires `OPENROUTER_API_KEY`.
- Running without the required provider credential produces a clear error for each case — this is expected and correct.
- Routing job is intentionally **non-blocking** (`continue-on-error: true`) and is not part of default PR gating.
- Phase 2 is not part of default PR gating, but it can run on PRs/pushes when prompt files change.
- Baseline comparison will be active once generated via `--update-baseline` from a successful live run.
- Routing artifacts are uploaded as `routing-eval-artifacts`.

#### Running Phase 2 Locally

```bash
OPENROUTER_API_KEY=or_xxx bun run eval:phase2 --provider openrouter --model openai/gpt-4o-mini
```

#### Updating the Phase 2 Baseline

```bash
OPENROUTER_API_KEY=or_xxx bun run eval --suite agent-routing --provider openrouter --model openai/gpt-4o-mini --update-baseline
```

#### Phase 2 Graduation Criteria

Phase 2 graduates from non-blocking to blocking CI gate when ALL of the following are met:

1. **4 consecutive weekly runs pass** with stable baseline (no regressions for 4 weeks).
2. **Case count reaches 6+** (double the initial 3), covering at least 3 distinct routing intents.
3. **Team review**: at least one explicit sign-off that Phase 2 is ready to block PRs.

Upon graduation:

- Add `--fail-on-regression` to the Phase 2 eval command
- Remove `continue-on-error: true` from the job
- Optionally add Phase 2 to the `push`/`pull_request` triggers (or keep weekly-only with blocking exit code)

## Phase 3: Trajectory Evals

Phase 3 adds multi-turn trajectory evals that validate delegation chains — e.g., "user asks complex question → Loom delegates to Pattern → Pattern produces plan → Loom reports back".

### What Phase 3 Covers

- Multi-turn delegation sequence validation
- Correct agent selection across turns
- Delegation chain ordering (exact sequence matching)
- Required/forbidden agent assertions
- Turn count bounds

### Layout

- `evals/scenarios/*.jsonc` — trajectory scenario files (multi-turn conversation scripts)
- `evals/cases/trajectory/*.jsonc` — trajectory eval case files
- `evals/suites/phase3-trajectory-pilot.jsonc` — pilot suite manifest

### Running Phase 3

```bash
# Run the full trajectory pilot suite
bun run eval --suite phase3-trajectory-pilot

# Run a single trajectory case
bun run eval --suite phase3-trajectory-pilot --case trajectory-loom-delegates-to-pattern
```

No environment variables or API credentials are needed — trajectory evals use mock responses embedded in scenario files.

### Scenario File Format

Scenarios live in `evals/scenarios/` as `.jsonc` files. Each scenario defines a multi-turn conversation:

```jsonc
{
  "id": "scenario-id",
  "title": "Human-readable title",
  "description": "What this scenario tests",
  "agents": ["loom", "pattern"],  // agents involved
  "turns": [
    { "turn": 1, "role": "user", "content": "User message" },
    {
      "turn": 2,
      "role": "assistant",
      "agent": "loom",           // which agent produces this turn
      "content": "Description",
      "mockResponse": "Canned response for mock mode",
      "expectedDelegation": "pattern"  // optional: expected delegation target
    }
  ]
}
```

### Writing Trajectory Cases

Each eval case references a scenario via `scenarioRef` and uses `trajectory-assertion` evaluators:

```jsonc
{
  "id": "trajectory-example",
  "title": "Trajectory: Example",
  "phase": "phase3",
  "target": {
    "kind": "trajectory-agent",
    "agent": "loom",
    "scenarioRef": "evals/scenarios/example.jsonc"
  },
  "executor": {
    "kind": "trajectory-run",
    "scenarioRef": "evals/scenarios/example.jsonc"
  },
  "evaluators": [
    {
      "kind": "trajectory-assertion",
      "expectedSequence": ["loom", "pattern", "loom"],
      "requiredAgents": ["pattern"],
      "forbiddenAgents": ["spindle"],
      "minTurns": 4,
      "maxTurns": 10
    }
  ]
}
```

### Trajectory Assertion Types

| Assertion | What it checks |
|-----------|---------------|
| `expectedSequence` | Observed delegation sequence matches exactly (ordered) |
| `requiredAgents` | Each listed agent appears at least once in the delegation sequence |
| `forbiddenAgents` | None of the listed agents appear in the delegation sequence |
| `minTurns` | Completed turn count is at or above the threshold |
| `maxTurns` | Completed turn count is at or below the limit |

### Current Pilot Scenarios

1. **Loom → Pattern** — Complex feature planning delegation
2. **Loom → Thread** — Codebase exploration delegation
3. **Loom → Pattern → Warp** — Planning with mandatory security review
4. **Loom self-handle** — Simple question answered without delegation
5. **Loom → Warp** — Security audit delegation

## Future Phases

- `target.kind` is ready for custom-agent and single-turn targets
- Promptfoo, if adopted later, should be an adapter behind executor/judge layers rather than the canonical schema owner
- Provider-backed evals must use env-only secrets and must never persist raw tokens, keys, or auth headers in artifacts

## Phase 2 Guardrails

- Phase 2 routing uses `model-response` + `llm-judge` in a tightly scoped Loom-only suite.
- Phase 2 is live-only: it calls the selected provider directly and requires provider credentials (typically `OPENROUTER_API_KEY` for the standard routing workflow).
- Never store provider secrets in case files, suite files, or committed baselines.
- Artifacts must not include auth headers, API keys, bearer tokens, or raw provider secret values.
