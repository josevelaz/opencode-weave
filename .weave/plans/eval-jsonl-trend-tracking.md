# Eval JSONL Trend Tracking

## TL;DR
> **Summary**: Build a reporting script (`script/eval-trend-report.ts`) that reads the eval spike JSONL file and produces trend analysis — score trajectories, flaky case detection, regression alerts — with console output and GitHub Actions Job Summary integration.
> **Estimated Effort**: Medium

## Context
### Original Request
The GitHub Models eval spike writes `RunSummary` objects to `evals/results/github-models-spike.jsonl` — one JSON line per eval run. As weekly CI runs accumulate data, we need a way to visualize trends, detect regressions, and surface insights. The solution must be a pure reporting tool that reads the JSONL as its only data source.

### Key Findings
- **JSONL schema** is already established in `script/eval-spike-github-models.ts` (lines 50–60): `RunSummary` contains `timestamp`, `env`, `model`, `totalCases`, `passedCases`, `failedCases`, `score`, `durationMs`, and per-case `results[]` with individual `caseId`, `passed`, `score`, `checks[]`, `modelResponse`, and `durationMs`.
- **Current JSONL has 3 runs** — small dataset now, but designed to grow weekly via the Monday 09:00 UTC cron in `.github/workflows/eval-spike-github-models.yml`.
- **Existing script patterns**: All scripts in `script/` are standalone `#!/usr/bin/env bun` files with manual CLI arg parsing (no library), `picocolors` for terminal output, and `process.env.GITHUB_STEP_SUMMARY` for Job Summary markdown. The trend report should follow this exact pattern.
- **`package.json` already has** `eval:spike` — the trend report should get `eval:trend` as its alias.
- **No new dependencies allowed**: The script can use `fs.readFileSync`, `picocolors`, and Bun built-ins. No charting libraries — use ASCII sparklines and markdown tables.
- **The eval workflow** (`.github/workflows/eval-spike-github-models.yml`) auto-commits JSONL to main and uploads as artifact. The trend report can be added as a post-eval step in the same workflow.
- **Existing baseline comparison pattern** (`src/features/evals/baseline.ts`) uses `outcome: "no-regression" | "informational-diff" | "regression"` with per-case delta tracking — the trend report should adopt similar terminology for consistency.
- **The `RunSummary` type** is defined inline in the spike script, not exported. The trend report will need its own type definition (duplicated, since we must not modify the spike script).
- **Windows compatibility**: JSONL uses `\n` explicitly (confirmed in spike script line 342). The report must split on `\n` and handle potential empty trailing lines.
- **Per-case results include `caseId`** — each run may have different sets of cases (e.g., `--case` filter runs 1 case, full runs have 10). Trend analysis must handle variable case sets gracefully.

## Objectives
### Core Objective
Enable the team to track eval quality over time, catch regressions early, and identify flaky/unstable test cases — all from a single JSONL file with zero additional infrastructure.

### Deliverables
- [x] `script/eval-trend-report.ts` — Standalone trend analysis script
- [x] GitHub Actions workflow integration — Add trend report step to existing eval spike workflow
- [x] `package.json` script alias — `eval:trend`

### Definition of Done
- [x] `bun run script/eval-trend-report.ts` reads the JSONL and prints a formatted trend report to console
- [x] `bun run script/eval-trend-report.ts --check --threshold 0.8` exits non-zero if latest score is below threshold
- [x] When `GITHUB_STEP_SUMMARY` is set, appends a markdown trend report with tables and sparklines
- [x] `bun run typecheck` passes
- [x] `bun test` passes (no regressions)

### Guardrails (Must NOT)
- Must NOT introduce new npm dependencies (use Bun built-ins, `picocolors`, `fs`)
- Must NOT modify existing eval infrastructure (`script/eval-spike-github-models.ts`, `src/features/evals/*`, `script/eval.ts`)
- Must NOT modify the existing `.github/workflows/eval-spike-github-models.yml` workflow structure (only append new steps)
- Must NOT create additional storage files — JSONL is the sole source of truth
- Must NOT import from the spike script (types are self-contained to keep decoupling)

---

## Design

### Data Model

The script reads the JSONL and parses each line into a `RunSummary`. From the full history, it derives:

```
TrendData {
  runs: RunSummary[]              // All runs, sorted by timestamp ascending
  latestRun: RunSummary           // Most recent run
  previousRun: RunSummary | null  // Second most recent (for delta comparison)
  caseHistory: Map<caseId, CaseHistory>  // Per-case pass/fail over time
}

CaseHistory {
  caseId: string
  appearances: number             // How many runs included this case
  passes: number
  failures: number
  passRate: number                // passes / appearances
  isFlaky: boolean                // 0 < passRate < 1 and appearances >= 3
  lastResult: "pass" | "fail"
  trend: ("pass" | "fail")[]     // Ordered results for sparkline
}
```

### Console Output Format

```
── Eval Trend Report ─────────────────────────────────
JSONL: evals/results/github-models-spike.jsonl (12 runs)
Model: gpt-4o-mini | Period: 2026-03-28 → 2026-06-15

── Score Trend ───────────────────────────────────────
  ▁▃▅▇█▇█████▇  (0.80 → 0.95)
  Latest: 0.95 (9/10 passed) | Previous: 0.90 (+0.05)
  Best: 1.00 (run #5) | Worst: 0.80 (run #1)
  Average: 0.93

── Duration Trend ────────────────────────────────────
  ▅▇▃▃▃▃▃▃▃▃▃▃  (28.2s → 25.9s)
  Latest: 25.9s | Average: 26.4s

── Per-Case Stability ────────────────────────────────
  Case                                   Pass Rate  Trend      Status
  route-to-thread-exploration            100% (12/12) ✅✅✅✅✅✅  stable
  route-to-spindle-research              100% (12/12) ✅✅✅✅✅✅  stable
  route-to-pattern-planning               92% (11/12) ✅✅✅❌✅✅  flaky ⚠️
  self-handle-simple-question              83% (10/12) ✅❌✅✅❌✅  flaky ⚠️
  ambiguous-research-planning             100% (12/12) ✅✅✅✅✅✅  stable

── Flaky Cases ───────────────────────────────────────
  ⚠️  route-to-pattern-planning  (92% — failed in runs #4)
  ⚠️  self-handle-simple-question (83% — failed in runs #2, #5)

── Regressions ───────────────────────────────────────
  ❌  self-handle-single-file-fix: was passing, now failing (since run #11)
```

### GitHub Actions Job Summary Format

Appended as markdown after the existing spike summary:

```markdown
## 📈 Eval Trend Report

**Runs analyzed**: 12 | **Period**: 2026-03-28 → 2026-06-15 | **Model**: gpt-4o-mini

### Score Trend
`▁▃▅▇█▇█████▇` 0.80 → **0.95** (avg: 0.93)

| Metric | Latest | Previous | Delta | Best | Worst |
|--------|--------|----------|-------|------|-------|
| Score  | 0.95   | 0.90     | +0.05 | 1.00 | 0.80  |
| Pass Rate | 90% | 90% | — | 100% | 80% |
| Duration | 25.9s | 26.1s | -0.2s | 24.8s | 28.2s |

### Per-Case Stability

| Case | Pass Rate | Last 6 | Status |
|------|-----------|--------|--------|
| route-to-thread-exploration | 100% (12/12) | ✅✅✅✅✅✅ | 🟢 stable |
| route-to-pattern-planning | 92% (11/12) | ✅✅✅❌✅✅ | 🟡 flaky |
| self-handle-single-file-fix | 92% (11/12) | ✅✅✅✅✅❌ | 🔴 regressed |

### Alerts
> ⚠️ **Flaky**: `route-to-pattern-planning` (92%), `self-handle-simple-question` (83%)
> 🔴 **Regression**: `self-handle-single-file-fix` — was passing, now failing
```

### CLI Interface

```
Usage: bun run script/eval-trend-report.ts [options]

Options:
  --file <path>       JSONL file path (default: evals/results/github-models-spike.jsonl)
  --last <n>          Only analyze the last N runs (default: all)
  --check             Enable regression checking (exit 1 on regression)
  --threshold <n>     Minimum acceptable score (default: 0.80)
  --json              Output raw trend data as JSON
  --help              Show this help message
```

### Regression Detection Logic

A "regression" is detected when any of these conditions are true:
1. **Score drop**: Latest run score < `--threshold` (default 0.80)
2. **Score decline**: Latest score is lower than the average of the last 3 runs by more than 0.10
3. **Case regression**: A case that passed in the last 3 consecutive runs now fails
4. **New failure**: A case that has never failed before fails for the first time

Regression detection only triggers exit code 1 when `--check` flag is passed (safe by default).

### Flaky Case Detection

A case is "flaky" when:
- It has appeared in at least 3 runs
- Its pass rate is strictly between 0% and 100% (i.e., sometimes passes, sometimes fails)
- It is NOT classified as a regression (regressions are a separate, more urgent category)

### ASCII Sparkline Implementation

Map score values (0.0–1.0) to block characters: `▁▂▃▄▅▆▇█`. No external library needed — just `Math.round(score * 7)` to index into the character array. Show the last 12 data points (or fewer if less data exists).

---

## TODOs

- [x] 1. **Define types and JSONL parser**
  **What**: Create the type definitions for `RunSummary`, `CaseResult`, `CheckResult`, `TrendData`, and `CaseHistory`. Implement `parseJsonl(filePath: string): RunSummary[]` that reads the file, splits on `\n`, filters empty lines, parses each as JSON, and sorts by timestamp ascending. Handle edge cases: file not found (exit with message), empty file (report "no data"), malformed lines (skip with warning).
  **Files**: `script/eval-trend-report.ts` (create — types and parser section)
  **Acceptance**: Types match the schema from the spike script; parser handles the existing 3-line JSONL file correctly

- [x] 2. **Implement trend analysis engine**
  **What**: Build the core analysis functions that derive insights from the parsed runs:
  - `analyzeTrend(runs: RunSummary[]): TrendData` — main entry point
  - `buildCaseHistory(runs: RunSummary[]): Map<string, CaseHistory>` — per-case stability tracking
  - `detectRegressions(data: TrendData, threshold: number): Regression[]` — implements the 4 regression rules
  - `detectFlakyCases(data: TrendData): CaseHistory[]` — filters for flaky cases
  - `sparkline(values: number[]): string` — maps values to `▁▂▃▄▅▆▇█`
  - `formatDelta(current: number, previous: number): string` — "+0.05" / "-0.10" / "—"
  **Files**: `script/eval-trend-report.ts` (analysis section)
  **Acceptance**: Each function is pure (no I/O), operates on parsed data, returns structured results

- [x] 3. **Implement console output renderer**
  **What**: Build `printConsoleReport(data: TrendData, regressions: Regression[], flakyCases: CaseHistory[]): void` that prints the formatted console output using `picocolors`. Sections: header, score trend with sparkline, duration trend, per-case stability table, flaky cases list, regressions list. Use `pc.green`/`pc.red`/`pc.yellow`/`pc.dim`/`pc.bold` following the same style as the spike script. Handle single-run edge case (no "previous" to compare against).
  **Files**: `script/eval-trend-report.ts` (console output section)
  **Acceptance**: Output matches the design format; single-run case shows "N/A" for deltas; colors are applied correctly

- [x] 4. **Implement GitHub Actions Job Summary renderer**
  **What**: Build `writeJobSummary(data: TrendData, regressions: Regression[], flakyCases: CaseHistory[]): void` that appends markdown to `process.env.GITHUB_STEP_SUMMARY`. Sections: score trend table with sparkline (using raw unicode — renders fine in GitHub markdown), per-case stability table with emoji trend (last 6 results), and alerts callout block. Truncate sparklines and trends to avoid overflowing the summary. Handle single-run case (omit trend-dependent sections, show only "First run" summary).
  **Files**: `script/eval-trend-report.ts` (job summary section)
  **Acceptance**: Generates valid GitHub-flavored markdown; `GITHUB_STEP_SUMMARY=/tmp/test.md bun run script/eval-trend-report.ts` writes parseable markdown

- [x] 5. **Implement CLI argument parsing and main function**
  **What**: Build `parseArgs(argv: string[]): ParsedArgs` and `main(): void` following the exact pattern from the spike script (manual arg parsing, no deps). Implement `--file`, `--last`, `--check`, `--threshold`, `--json`, `--help` flags. The main function: parse args → read JSONL → analyze → detect regressions → output (console and/or job summary) → exit code (1 if `--check` and regression detected, 0 otherwise). Add `--json` output mode that dumps the full `TrendData` as JSON for programmatic consumption.
  **Files**: `script/eval-trend-report.ts` (CLI section)
  **Acceptance**: `bun run script/eval-trend-report.ts --help` prints usage; `--check --threshold 0.5` exits 0 with current data; `--json` outputs valid JSON

- [x] 6. **Add package.json script alias**
  **What**: Add `"eval:trend": "bun run script/eval-trend-report.ts"` to the `scripts` section of `package.json`, immediately after the existing `"eval:spike"` entry.
  **Files**: `package.json` (modify — scripts section only)
  **Acceptance**: `bun run eval:trend -- --help` prints usage

- [x] 7. **Integrate into GitHub Actions workflow**
  **What**: Add a new step to `.github/workflows/eval-spike-github-models.yml` that runs the trend report after the eval spike completes. The step runs _after_ the eval step and _before_ the commit step so it can read the freshly-appended JSONL. Use `if: always()` so the report runs even if the eval had failures. Set `--check --threshold 0.80` but use `continue-on-error: true` so regressions are visible but don't block the workflow (the spike already has its own 50% fail-rate gate).
  **Files**: `.github/workflows/eval-spike-github-models.yml` (modify — add step)
  **Acceptance**: The workflow YAML is syntactically valid; the trend report step appears between "Run eval spike" and "Commit JSONL results"

  New step to insert after the "Run eval spike" step:
  ```yaml
  - name: Generate trend report
    if: always()
    continue-on-error: true
    run: bun run script/eval-trend-report.ts --check --threshold 0.80
  ```

- [x] 8. **Test with existing JSONL data**
  **What**: Verify the script works end-to-end with the existing 3-run JSONL file. Confirm: console output renders correctly with sparse data (3 runs, some with 1 case), sparklines are very short but render, per-case history shows correct pass rates, no regressions are false-positived, `--json` output is valid, and `--check` exits 0 (since current scores are all ≥0.80).
  **Files**: None (verification only)
  **Acceptance**: All commands complete successfully; output is human-readable and correct for the 3 existing runs

---

## Verification

- [x] `bun run typecheck` passes
- [x] `bun test` passes (no regressions to existing tests)
- [x] `bun run eval:trend` reads existing JSONL and prints a formatted report
- [x] `bun run eval:trend -- --json` outputs valid JSON
- [x] `bun run eval:trend -- --check --threshold 0.80` exits 0 with current data
- [x] `bun run eval:trend -- --check --threshold 1.0` exits 1 (current best score is 0.95, below 1.0)
- [x] `bun run eval:trend -- --last 1` analyzes only the most recent run
- [x] `bun run eval:trend -- --help` prints usage
- [x] `GITHUB_STEP_SUMMARY=/tmp/test.md bun run eval:trend` writes valid markdown
- [x] Existing eval commands still work: `bun run eval:spike -- --dry-run` succeeds
- [x] No existing workflow files are broken: YAML syntax check passes

## Potential Pitfalls

| Risk | Mitigation |
|------|------------|
| **Variable case sets across runs** | The trend report tracks per-case history independently. A case that only appears in 1 of 12 runs won't be flagged as flaky — the "appearances ≥ 3" threshold prevents this. |
| **Single-run JSONL** | All display code handles the edge case of 1 run: no deltas, no sparklines, no flakiness detection. Just show the single run's metrics. |
| **Large JSONL file** | JSONL files grow by ~2KB per full run. At weekly cadence, 1 year = ~104KB. `readFileSync` is fine. If concerned, `--last N` limits analysis to recent runs. |
| **Timestamp parsing** | `RunSummary.timestamp` is ISO-8601 which `new Date()` parses natively. No timezone library needed. |
| **Unicode sparklines in CI** | GitHub Actions uses UTF-8 terminals and markdown rendering, so `▁▂▃▄▅▆▇█` characters render correctly in both console output and Job Summary. |
| **Runs with different models** | The script should group/filter by model if the JSONL contains runs with different `--model` values. Default behavior: show all models together. Could add `--model <name>` filter later. For now, the report header shows the model from the latest run. |
| **JSONL with partial runs** | Runs where `--case` was used (e.g., only 1 case) have `totalCases: 1`. The trend report should include these in aggregate score tracking but note them in the output. Per-case history handles this naturally since it only tracks cases that appeared in each run. |
