import { callGitHubModels } from "./github-models-api"
import { callOpenRouter } from "./openrouter-api"
import type { EvalArtifacts, ExecutionContext, ModelResponseExecutor, ResolvedTarget } from "../types"

function redactProvider(value: string): string {
  return value.length <= 3 ? "***" : `${value.slice(0, 1)}***${value.slice(-1)}`
}

export async function executeModelResponse(
  resolvedTarget: ResolvedTarget,
  executor: ModelResponseExecutor,
  context: ExecutionContext,
): Promise<EvalArtifacts> {
  const provider = context.providerOverride ?? executor.provider
  const model = context.modelOverride ?? executor.model
  const systemPrompt = resolvedTarget.artifacts.renderedPrompt ?? ""
  let content: string
  let durationMs: number

  switch (provider) {
    case "github-models": {
      const token = process.env.GITHUB_TOKEN
      if (!token) {
        throw new Error(
          "Model-response executor requires GITHUB_TOKEN environment variable for GitHub Models API access.",
        )
      }

      ;({ content, durationMs } = await callGitHubModels(systemPrompt, executor.input, model, token))
      break
    }
    case "openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) {
        throw new Error(
          "Model-response executor requires OPENROUTER_API_KEY environment variable for OpenRouter access.",
        )
      }

      ;({ content, durationMs } = await callOpenRouter(systemPrompt, executor.input, model, apiKey))
      break
    }
    default:
      throw new Error(`Model-response executor does not support provider: ${provider}`)
  }

  return {
    ...resolvedTarget.artifacts,
    modelOutput: content,
    judgeOutput: undefined,
    baselineDelta: {
      provider: redactProvider(provider),
      model,
      durationMs,
    },
  }
}
