/**
 * Phase 1 eval harness for deterministic prompt-contract coverage.
 *
 * Extension points are intentionally registry-based:
 * - add new target `kind` values in `types.ts` + `schema.ts`
 * - add new executor handlers in `runner.ts`
 * - add new evaluator handlers in `evaluators/`
 * - keep `EvalRunResult` top-level keys stable for future baselines
 *
 * Promptfoo, if adopted later, should plug in behind executor/judge adapters.
 */

export type {
  EvalPhase,
  EvalTarget,
  ExecutorSpec,
  EvaluatorSpec,
  EvalSuiteManifest,
  EvalCase,
  LoadedEvalCase,
  LoadedEvalSuiteManifest,
  EvalArtifacts,
  AssertionResult,
  EvalCaseResult,
  EvalRunResult,
  EvalRunSummary,
  RunEvalSuiteOptions,
  RunnerFilters,
} from "./types"

export { EvalCaseSchema, EvalSuiteManifestSchema, EvalRunResultSchema } from "./schema"
export { EvalConfigError, loadEvalSuiteManifest, loadEvalCasesForSuite, resolveSuitePath } from "./loader"
export { resolveBuiltinAgentTarget } from "./targets/builtin-agent-target"
export { executePromptRender } from "./executors/prompt-renderer"
export { executeModelResponse } from "./executors/model-response"
export { runDeterministicEvaluator } from "./evaluators/deterministic"
export { runLlmJudgeEvaluator } from "./evaluators/llm-judge"
export { deriveDeterministicBaseline, readDeterministicBaseline, compareDeterministicBaseline } from "./baseline"
export { ensureEvalStorageDir, getDefaultEvalRunPath, writeEvalRunResult } from "./storage"
export { formatEvalSummary } from "./reporter"
export type { RunEvalSuiteOutput } from "./runner"
export { runEvalSuite } from "./runner"
