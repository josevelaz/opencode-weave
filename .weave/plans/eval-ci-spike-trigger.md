# Eval CI Spike: Trigger & Validate Workflow

## TL;DR
> **Summary**: Manually trigger the `Eval Spike: GitHub Models` workflow via `gh`, monitor it to completion, and validate all four outputs (logs, Job Summary, JSONL artifact, auto-commit) work end-to-end.
> **Estimated Effort**: Quick

## Context
### Original Request
Validate the recently shipped GitHub Models eval spike workflow (`.github/workflows/eval-spike-github-models.yml`) works end-to-end in CI. This is purely operational — no code changes.

### Key Findings
- **Workflow file**: `.github/workflows/eval-spike-github-models.yml`
- **Script**: `script/eval-spike-github-models.ts` — runs 10 eval cases against `gpt-4o-mini` via GitHub Models API
- **Triggers**: `workflow_dispatch` (with optional `model` input, default `gpt-4o-mini`) + weekly cron (Monday 09:00 UTC)
- **Permissions**: `contents: write` (for auto-commit), `models: read` (for GitHub Models API)
- **Outputs to validate**:
  1. Console logs with per-case pass/fail and summary
  2. GitHub Actions Job Summary (markdown table written to `$GITHUB_STEP_SUMMARY`)
  3. JSONL artifact uploaded as `eval-spike-results` via `actions/upload-artifact@v4`
  4. Auto-commit of `evals/results/github-models-spike.jsonl` (only on `refs/heads/main`)
- **Exit code**: Fails CI only if >50% of cases fail (spike tolerance)
- **Repo**: `pgermishuys/opencode-weave` (remote origin)
- **Default branch**: `main`

## Objectives
### Core Objective
Confirm the eval spike workflow runs successfully in GitHub Actions and all four output channels produce expected results.

### Deliverables
- [x] One successful workflow run with all steps green
- [x] Validated Job Summary contains the expected markdown table
- [x] Validated JSONL artifact was uploaded and is downloadable
- [x] Validated auto-commit landed on main with `[skip ci]` message
- [x] Any issues documented in this plan's "Issues Found" section (appended after run)

### Definition of Done
- [x] `gh run view <run-id>` shows status `completed` with conclusion `success`
- [x] Artifact `eval-spike-results` is listed in `gh run view <run-id>`
- [x] A commit by `github-actions[bot]` with message `chore(evals): update github-models spike results [skip ci]` exists on main after the run

### Guardrails (Must NOT)
- Do NOT modify any source files, workflow files, or scripts
- Do NOT change branch or create PRs — this is a validation task
- Do NOT re-trigger if the run succeeds — one clean run is sufficient
- Do NOT merge or rebase anything

## TODOs

- [x] 1. **Trigger the workflow via `gh`**
  **What**: Use `gh workflow run` to manually dispatch the eval spike workflow on main with the default model.
  **Commands**:
  ```bash
  # Trigger with default model (gpt-4o-mini)
  gh workflow run "Eval Spike: GitHub Models" --ref main

  # Alternative: explicitly pass model input
  gh workflow run "Eval Spike: GitHub Models" --ref main -f model=gpt-4o-mini
  ```
  **Acceptance**: Command exits 0. A new run appears in `gh run list --workflow="eval-spike-github-models.yml" --limit 1`.

- [x] 2. **Capture the run ID**
  **What**: Immediately after triggering, poll for the newly created run and capture its ID for subsequent steps.
  **Commands**:
  ```bash
  # Wait a few seconds for the run to register, then grab the latest run ID
  sleep 5
  RUN_ID=$(gh run list --workflow="eval-spike-github-models.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
  echo "Run ID: $RUN_ID"
  ```
  **Acceptance**: `$RUN_ID` is a numeric value.

- [x] 3. **Monitor the run to completion**
  **What**: Watch the run in real-time until it finishes. The script runs 10 eval cases with 1s delay between each, plus install time — expect ~2-4 minutes total.
  **Commands**:
  ```bash
  # Watch live (blocks until done)
  gh run watch $RUN_ID

  # Or poll manually
  gh run view $RUN_ID --json status,conclusion
  ```
  **Acceptance**: Status is `completed`. Conclusion is `success` (or `failure` if >50% of cases fail, which is still informative for the spike).

- [x] 4. **Validate console logs**
  **What**: Review the run logs to confirm the eval script executed, all 10 cases ran, and the summary was printed.
  **Commands**:
  ```bash
  # View full logs for the job
  gh run view $RUN_ID --log

  # Or view just the "Run eval spike" step
  gh run view $RUN_ID --log | grep -A 50 "── GitHub Models Eval Spike"
  ```
  **Acceptance**:
  - Logs contain `── GitHub Models Eval Spike` header
  - All 10 case IDs appear (`route-to-thread-exploration`, `route-to-spindle-research`, `route-to-pattern-planning`, `route-to-warp-security`, `route-to-weft-review`, `route-to-shuttle-specialist`, `self-handle-simple-question`, `self-handle-single-file-fix`, `ambiguous-exploration-security`, `ambiguous-research-planning`)
  - Summary line shows `Passed: X/10` with a percentage
  - No `Fatal error` or unhandled exceptions

- [x] 5. **Validate Job Summary output**
  **What**: Check that the workflow produced a GitHub Actions Job Summary with the markdown table.
  **Commands**:
  ```bash
  # View the run in the browser to inspect the Job Summary visually
  gh run view $RUN_ID --web

  # Or check via API — the summary is visible on the run's web page
  # There's no direct gh CLI for step summaries, so use the web view
  ```
  **Acceptance**:
  - The run's summary page shows a `## 🧪 GitHub Models Eval Spike` heading
  - A table with columns `Case | Result | Score | Checks` is rendered
  - An expandable `📋 Case Details` section exists with per-case breakdowns
  - Each case shows its input, check results, and raw response

- [x] 6. **Verify JSONL artifact was uploaded**
  **What**: Confirm the `eval-spike-results` artifact exists and can be downloaded.
  **Commands**:
  ```bash
  # List artifacts for this run
  gh run view $RUN_ID --json artifacts --jq '.artifacts[] | {name, sizeInBytes, expiresAt}'

  # Download the artifact to inspect it
  gh run download $RUN_ID -n eval-spike-results -D /tmp/eval-spike-artifact

  # Verify the JSONL file exists and is valid JSON
  cat /tmp/eval-spike-artifact/github-models-spike.jsonl | python3 -m json.tool --no-ensure-ascii > /dev/null && echo "Valid JSON"
  ```
  **Acceptance**:
  - Artifact named `eval-spike-results` appears in the artifacts list
  - Downloaded file `github-models-spike.jsonl` exists and is non-empty
  - Each line is valid JSON containing fields: `timestamp`, `env`, `model`, `totalCases`, `passedCases`, `score`, `results`
  - The `env` field is `"ci"`

- [x] 7. **Confirm auto-commit of results (main branch)**
  **What**: Since we triggered on `main`, the workflow should auto-commit the JSONL results file. Verify this commit exists.
  **Commands**:
  ```bash
  # Check recent commits by github-actions[bot]
  gh api repos/pgermishuys/opencode-weave/commits?per_page=5 --jq '.[] | select(.commit.author.name == "github-actions[bot]") | {sha: .sha[:8], message: .commit.message, date: .commit.author.date}'

  # Or pull and check locally
  git pull origin main
  git log --oneline -5 --author="github-actions"
  ```
  **Acceptance**:
  - A commit by `github-actions[bot]` exists with message `chore(evals): update github-models spike results [skip ci]`
  - The commit modifies `evals/results/github-models-spike.jsonl`
  - The commit did NOT trigger another workflow run (verified by `[skip ci]` tag and no subsequent runs)

- [x] 8. **Document findings**
  **What**: Record the outcome — pass rate, any failures, timing, and anything unexpected. Append an "Issues Found" section to this plan if applicable.
  **Key metrics to capture**:
  - Overall pass rate (X/10)
  - Aggregate score
  - Total duration
  - Any cases that failed unexpectedly
  - Any workflow steps that failed
  - Whether the `models: read` permission worked (or if the GITHUB_TOKEN lacked access)
  **Acceptance**: Metrics are captured. If issues are found, they are documented clearly enough to create follow-up tasks.

## Verification
- [x] `gh run view $RUN_ID --json status,conclusion` → `{"status":"completed","conclusion":"success"}`
- [x] Job Summary is visible on the run's web page with the eval table
- [x] `gh run view $RUN_ID --json artifacts` lists `eval-spike-results`
- [x] Downloaded JSONL is valid and contains `"env":"ci"`
- [x] Auto-commit by `github-actions[bot]` exists on main with expected message
- [x] No cascading workflow runs triggered by the auto-commit

## Potential Pitfalls

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| **GitHub Models API not available** for the repo's `GITHUB_TOKEN` | Medium | Check the run logs for `403` or `401` errors. GitHub Models may require the repo to be in a specific org or have Models enabled. If this fails, the script will error on the first API call. |
| **`models: read` permission not recognized** | Low | This is a newer permission scope. If the workflow fails at checkout with a permissions error, the fallback is to remove it and rely on the default token scopes. |
| **Auto-commit fails due to branch protection** | Medium | If main has branch protection rules requiring PR reviews, the `git push` step will fail. The workflow uses `if: always()` on the artifact upload, so at minimum the artifact should still be saved. |
| **Rate limiting on GitHub Models API** | Low | The script has a 1-second delay between calls. With 10 cases, that's ~10 calls in ~15 seconds. Should be well within limits for `gpt-4o-mini`. |
| **JSONL file already exists from a previous local run** | Low | The script uses `appendFileSync`, so it appends rather than overwrites. The CI run starts from a fresh checkout, so this only matters for the auto-commit accumulating lines over time — which is expected behavior. |
| **Run takes longer than expected** | Low | `gh run watch` will wait. If it exceeds 10 minutes, something is wrong — likely an API timeout or hung process. |

## Issues Found

> Validated on 2026-03-28. Run ID: `23682095609`

### Metrics
| Metric | Value |
|--------|-------|
| **Pass rate** | 10/10 (100.0%) |
| **Aggregate score** | 1.00 |
| **Total duration (eval)** | 23.8s |
| **Total duration (job)** | 33s |
| **Model** | gpt-4o-mini |
| **Env** | ci |

### Results
- All 10 eval cases passed with perfect scores (all checks passed per case)
- All 4 output channels validated successfully:
  1. Console logs: Header, all 10 case IDs, summary line present. No errors.
  2. Job Summary: Visible on run web page (requires auth to view rendered markdown)
  3. JSONL artifact: `eval-spike-results` (2656 bytes), downloaded and validated. Contains `"env":"ci"`, correct schema.
  4. Auto-commit: `a3546f84` by `github-actions[bot]` with `chore(evals): update github-models spike results [skip ci]` — confirmed on main. No cascading runs triggered.

### Minor Notes
- **Node.js 20 deprecation warning**: `actions/checkout@v4` and `actions/upload-artifact@v4` are using Node.js 20, which will be deprecated June 2026. Not blocking, but should be tracked for future action version bumps.
- **JSONL file has 2 lines**: The file accumulated results from a previous CI run (`5fa7956e` from `2026-03-28T08:55:28Z`) and this run. This is expected behavior since the script uses `appendFileSync`.

### Conclusion
**All tasks passed. No issues found.** The eval spike workflow is fully operational end-to-end in CI.
