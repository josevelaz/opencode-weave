# Automate Phase 2 Loom Pilot Eval Schedule

## TL;DR
> **Summary**: Move Phase 2 loom pilot from manual-only workflow_dispatch to a weekly scheduled run with dedicated mock-response file, structured reporting, and clear graduation criteria — all without touching Phase 1 CI gating.
> **Estimated Effort**: Short

## Context

### Original Request
Automate the Phase 2 loom pilot (`phase2-loom-pilot` suite, 3 cases) so it runs on a schedule rather than only via manual `workflow_dispatch`. Keep it non-blocking, add proper mock-response management, surface results alongside Phase 1 artifacts, and define when Phase 2 graduates to blocking.

### Key Findings

1. **3 Phase 2 cases** exist in `evals/cases/loom/phase2/` — delegation-intent-{planning,security,exploration}. All use `model-response` executor (mock-only, keyed by `openai/gpt-5`) and `llm-judge` evaluator with `expectedContains`/`forbiddenContains` string checks.

2. **Mock response is currently hardcoded in workflow YAML** (line 69 of `evals.yml`): a single catch-all string for `openai/gpt-5` that passes all 3 cases simultaneously. This is fragile — a single string must satisfy 3 different routing intents.

3. **The `model-response` executor** reads `WEAVE_EVAL_MOCK_RESPONSES` env var, parses it as `Record<string, string>` JSON keyed by `{provider}/{model}`. Currently all 3 cases share the same key (`openai/gpt-5`), so they get the same mock response.

4. **No baseline exists** for `phase2-loom-pilot`. The eval CLI supports `--baseline` and `--fail-on-regression` flags, but Phase 2 doesn't use them yet.

5. **Existing schedule precedent**: `eval-spike-github-models.yml` runs weekly on `cron: "0 9 * * 1"` (Monday 09:00 UTC). The Phase 2 pilot should follow the same weekly cadence.

6. **Phase 1 is fully isolated**: `deterministic-evals` job in `evals.yml` runs `phase1-core` and `pr-smoke` with `--fail-on-regression`. The `phase2-loom-pilot` job is completely separate and gated by `if: github.event_name == 'workflow_dispatch' && inputs.run_phase2_pilot == 'true'`. Adding a schedule trigger won't touch the Phase 1 job.

7. **`ci.yml` runs `eval:smoke`** (pr-smoke suite) on every PR/push. Phase 2 must NOT be added here.

8. **Per-case mock granularity gap**: The executor resolves mocks by `{provider}/{model}` — all 3 cases use `openai/gpt-5`, so they get identical responses. For proper per-case testing, either (a) vary the model field per case, or (b) extend the mock key to include case ID. Option (a) is simpler and requires no code changes.

## Objectives

### Core Objective
Run Phase 2 pilot automatically on a weekly schedule with proper mock management and reporting, while keeping it strictly non-blocking and isolated from Phase 1 gating.

### Deliverables
- [x] Weekly scheduled Phase 2 pilot run in CI
- [x] Mock responses extracted from YAML into a trackable JSON fixture file
- [x] Per-case mock responses (not one string for all 3 cases)
- [x] Phase 2 baseline file for regression tracking (non-blocking)
- [x] Unified artifact upload for cross-phase visibility
- [x] Documented graduation criteria

### Definition of Done
- [x] `bun run eval --suite phase2-loom-pilot` passes locally with `WEAVE_EVAL_MOCK_RESPONSES` loaded from fixture file
- [x] Phase 1 `deterministic-evals` job is completely unchanged in behavior
- [x] `evals.yml` Phase 2 job triggers on both `workflow_dispatch` and `schedule`
- [x] Phase 2 job remains `continue-on-error: true`
- [x] `evals/baselines/phase2-loom-pilot.json` exists and is committed

### Guardrails (Must NOT)
- Must NOT modify the `deterministic-evals` job or its triggers
- Must NOT add Phase 2 to `ci.yml` or `pr-smoke` suite
- Must NOT introduce new npm dependencies
- Must NOT store provider secrets in fixture files or baselines
- Must NOT hardcode mock responses in workflow YAML (move to file)

## TODOs

- [x] 1. **Create per-case mock response fixture file**
  **What**: Create `evals/fixtures/phase2-loom-pilot-mocks.json` containing a JSON object keyed by `{provider}/{model}` with per-case mock responses. To enable per-case granularity without code changes, differentiate the 3 cases by using distinct model identifiers (e.g., `gpt-5-planning`, `gpt-5-security`, `gpt-5-exploration`). Update the 3 case files' `executor.model` fields to match.

  **Design detail**: The fixture file structure:
  ```json
  {
    "openai/gpt-5-planning": "I will use pattern for strategic planning and kick off implementation with /start-work to coordinate the multi-file changes.",
    "openai/gpt-5-security": "I will engage warp for a thorough security review of the authentication and token handling changes before shipping.",
    "openai/gpt-5-exploration": "I will delegate to thread for codebase exploration to find and summarize all authentication-related files."
  }
  ```
  Each response is tailored to pass only its corresponding case's `expectedContains`/`forbiddenContains` checks, making failures per-case diagnostic rather than all-or-nothing.

  **Files**:
  - Create `evals/fixtures/phase2-loom-pilot-mocks.json`
  - Edit `evals/cases/loom/phase2/delegation-intent-planning.jsonc` — change `executor.model` from `"gpt-5"` to `"gpt-5-planning"`
  - Edit `evals/cases/loom/phase2/delegation-intent-security.jsonc` — change `executor.model` from `"gpt-5"` to `"gpt-5-security"`
  - Edit `evals/cases/loom/phase2/delegation-intent-exploration.jsonc` — change `executor.model` from `"gpt-5"` to `"gpt-5-exploration"`

  **Acceptance**: `cat evals/fixtures/phase2-loom-pilot-mocks.json | bun -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))"` parses without error; each key matches the updated case executor model field.

- [x] 2. **Add schedule trigger to evals.yml Phase 2 job**
  **What**: Modify the `on:` block in `evals.yml` to add a `schedule` trigger. Update the `phase2-loom-pilot` job's `if:` condition to run on both `workflow_dispatch` (when `run_phase2_pilot == 'true'`) and `schedule` events. Keep `continue-on-error: true`.

  Use the same weekly Monday cadence as the GitHub Models spike but offset by 1 hour to avoid resource contention: `cron: "0 10 * * 1"` (Monday 10:00 UTC).

  **Files**:
  - Edit `.github/workflows/evals.yml`

  **Changes**:
  ```yaml
  on:
    pull_request:
      branches: [main]
    push:
      branches: [main]
    schedule:
      - cron: "0 10 * * 1"   # Weekly Monday 10:00 UTC — Phase 2 pilot
    workflow_dispatch:
      inputs:
        run_phase2_pilot:
          # ... unchanged
  ```

  Update the `phase2-loom-pilot` job condition from:
  ```yaml
  if: github.event_name == 'workflow_dispatch' && inputs.run_phase2_pilot == 'true'
  ```
  to:
  ```yaml
  if: >-
    github.event_name == 'schedule' ||
    (github.event_name == 'workflow_dispatch' && inputs.run_phase2_pilot == 'true')
  ```

  **Acceptance**: Job triggers on schedule and manual dispatch; does NOT trigger on `pull_request` or `push`.

- [x] 3. **Load mock responses from fixture file in workflow**
  **What**: Replace the inline YAML mock JSON with a step that reads the fixture file. Use `cat` + env file syntax to load the fixture into `WEAVE_EVAL_MOCK_RESPONSES`. Keep the `workflow_dispatch` input override as a fallback for ad-hoc testing.

  **Files**:
  - Edit `.github/workflows/evals.yml` (the `phase2-loom-pilot` job steps)

  **Changes**: Replace the hardcoded env in the "Run phase2 loom pilot" step:
  ```yaml
  - name: Load mock responses
    id: mocks
    run: |
      if [ -n "${{ inputs.phase2_mock_responses }}" ]; then
        echo "WEAVE_EVAL_MOCK_RESPONSES=${{ inputs.phase2_mock_responses }}" >> "$GITHUB_ENV"
      else
        echo "WEAVE_EVAL_MOCK_RESPONSES=$(cat evals/fixtures/phase2-loom-pilot-mocks.json | tr -d '\n')" >> "$GITHUB_ENV"
      fi

  - name: Run phase2 loom pilot (mocked)
    run: bun run eval --suite phase2-loom-pilot
  ```

  This keeps the manual override path working but defaults to the committed fixture file.

  **Acceptance**: `WEAVE_EVAL_MOCK_RESPONSES` is populated from the fixture file during scheduled/default runs; manual override still works when `phase2_mock_responses` input is provided.

- [x] 4. **Generate and commit Phase 2 baseline**
  **What**: Run the Phase 2 suite locally and generate an initial baseline file. This enables future `--fail-on-regression` tracking (non-blocking for now).

  **Files**:
  - Create `evals/baselines/phase2-loom-pilot.json` (generated by running the eval with `--update-baseline`)

  **Steps**:
  ```bash
  WEAVE_EVAL_MOCK_RESPONSES="$(cat evals/fixtures/phase2-loom-pilot-mocks.json)" \
    bun run eval --suite phase2-loom-pilot --update-baseline
  ```

  **Acceptance**: `evals/baselines/phase2-loom-pilot.json` exists, has `suiteId: "phase2-loom-pilot"`, `normalizedScore: 1`, and 3 case entries all with `status: "passed"`.

- [x] 5. **Add baseline comparison to Phase 2 workflow step (non-blocking)**
  **What**: Update the Phase 2 eval run command in the workflow to include `--baseline evals/baselines/phase2-loom-pilot.json`. Do NOT add `--fail-on-regression` yet — that happens at graduation. The baseline comparison output will appear in the job log for observability.

  **Files**:
  - Edit `.github/workflows/evals.yml`

  **Change the run command to**:
  ```yaml
  - name: Run phase2 loom pilot (mocked)
    run: bun run eval --suite phase2-loom-pilot --baseline evals/baselines/phase2-loom-pilot.json
  ```

  **Acceptance**: Phase 2 job logs show baseline comparison output; job still passes even if baseline drift is detected (because `continue-on-error: true` and no `--fail-on-regression`).

- [x] 6. **Add eval:phase2 convenience script to package.json**
  **What**: Add a package.json script alias for running Phase 2 locally, parallel to `eval:smoke`.

  **Files**:
  - Edit `package.json`

  **Change**:
  ```json
  "eval:phase2": "bun run script/eval.ts --suite phase2-loom-pilot"
  ```

  **Acceptance**: `bun run eval:phase2` runs (requires `WEAVE_EVAL_MOCK_RESPONSES` env var to be set).

- [x] 7. **Update evals/README.md with schedule and mock management docs**
  **What**: Update the Phase 2 section in `evals/README.md` to document:
  - Weekly schedule (Monday 10:00 UTC)
  - Mock fixture file location and format
  - How to run Phase 2 locally (`WEAVE_EVAL_MOCK_RESPONSES="$(cat evals/fixtures/phase2-loom-pilot-mocks.json)" bun run eval:phase2`)
  - How to update the baseline
  - Graduation criteria (see below)

  **Files**:
  - Edit `evals/README.md`

  **Acceptance**: README accurately reflects the new automated schedule, fixture-based mocks, and graduation path.

- [x] 8. **Document graduation criteria in README**
  **What**: Add a "Phase 2 Graduation Criteria" subsection defining when Phase 2 becomes blocking. Proposed criteria:

  > Phase 2 graduates from non-blocking pilot to blocking CI gate when ALL of the following are met:
  > 1. **4 consecutive weekly runs pass** with stable baseline (no regressions for 4 weeks).
  > 2. **Case count reaches 6+** (double the initial 3), covering at least 3 distinct routing intents.
  > 3. **Mock responses are replaced with live model calls** (or a representative replay cache), removing the single-string mock limitation.
  > 4. **Team review**: at least one explicit sign-off that Phase 2 is ready to block PRs.
  >
  > Upon graduation:
  > - Add `--fail-on-regression` to the Phase 2 eval command
  > - Remove `continue-on-error: true` from the job
  > - Optionally add Phase 2 to the `push`/`pull_request` triggers (or keep weekly-only with blocking exit code)

  **Files**:
  - Edit `evals/README.md`

  **Acceptance**: Graduation criteria are documented and specific (not vague "when ready").

## Verification

- [x] `bun test` passes (no unit test regressions)
- [x] `bun run eval --suite phase1-core --baseline evals/baselines/phase1-core.json --fail-on-regression` passes unchanged
- [x] `bun run eval --suite pr-smoke --baseline evals/baselines/pr-smoke.json --fail-on-regression` passes unchanged
- [x] `WEAVE_EVAL_MOCK_RESPONSES="$(cat evals/fixtures/phase2-loom-pilot-mocks.json)" bun run eval --suite phase2-loom-pilot --baseline evals/baselines/phase2-loom-pilot.json` passes with 3/3 cases
- [x] `evals.yml` Phase 2 job `if:` condition does NOT trigger on `pull_request` or `push` events
- [x] `evals.yml` `deterministic-evals` job is completely unchanged
- [x] No new entries in `package.json` dependencies or devDependencies
- [x] Mock fixture file contains no secrets (only synthetic model responses)
