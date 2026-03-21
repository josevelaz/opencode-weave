import type { EvalArtifacts, ExecutionContext, ModelResponseExecutor, ResolvedTarget } from "../types"

function resolveMockResponse(executor: ModelResponseExecutor): string {
  const mappingEnv = process.env.WEAVE_EVAL_MOCK_RESPONSES
  if (!mappingEnv) {
    throw new Error(
      "Model-response execution requires WEAVE_EVAL_MOCK_RESPONSES mapping for Phase 2 pilot safety",
    )
  }

  let mapping: Record<string, string>
  try {
    mapping = JSON.parse(mappingEnv) as Record<string, string>
  } catch {
    throw new Error("Invalid WEAVE_EVAL_MOCK_RESPONSES JSON mapping")
  }

  const key = `${executor.provider}/${executor.model}`
  const response = mapping[key]
  if (!response) {
    throw new Error(`No mock response configured for model-response executor key: ${key}`)
  }
  return response
}

function redactProvider(value: string): string {
  return value.length <= 3 ? "***" : `${value.slice(0, 1)}***${value.slice(-1)}`
}

export function executeModelResponse(
  resolvedTarget: ResolvedTarget,
  executor: ModelResponseExecutor,
  _context: ExecutionContext,
): EvalArtifacts {
  const response = resolveMockResponse(executor)

  return {
    ...resolvedTarget.artifacts,
    modelOutput: response,
    judgeOutput: undefined,
    // keep provider/model metadata sanitized and never include secrets
    baselineDelta: {
      provider: redactProvider(executor.provider),
      model: executor.model,
    },
  }
}
