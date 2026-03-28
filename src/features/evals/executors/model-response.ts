import { callGitHubModels } from "./github-models-api"
import type { EvalArtifacts, ExecutionContext, ModelResponseExecutor, ResolvedTarget } from "../types"

function redactProvider(value: string): string {
  return value.length <= 3 ? "***" : `${value.slice(0, 1)}***${value.slice(-1)}`
}

/**
 * Executes a model-response eval case by calling the GitHub Models API.
 *
 * Phase 2 is live-only — requires GITHUB_TOKEN env var.
 */
export async function executeModelResponse(
  resolvedTarget: ResolvedTarget,
  executor: ModelResponseExecutor,
  _context: ExecutionContext,
): Promise<EvalArtifacts> {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error(
      "Model-response executor requires GITHUB_TOKEN environment variable for GitHub Models API access.",
    )
  }

  const systemPrompt = resolvedTarget.artifacts.renderedPrompt ?? ""
  const { content, durationMs } = await callGitHubModels(systemPrompt, executor.input, executor.model, token)

  return {
    ...resolvedTarget.artifacts,
    modelOutput: content,
    judgeOutput: undefined,
    baselineDelta: {
      provider: redactProvider(executor.provider),
      model: executor.model,
      durationMs,
    },
  }
}
