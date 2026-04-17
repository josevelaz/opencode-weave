import type { AgentConfig } from "@opencode-ai/sdk"
import type { ResolvedContinuationConfig } from "../../config/continuation"
import type { AgentFactory } from "../types"
import { buildTapestryToolPolicy, TAPESTRY_DEFAULTS } from "./default"
import { composeTapestryPrompt } from "./prompt-composer"

export { composeTapestryPrompt } from "./prompt-composer"
export type { TapestryPromptOptions } from "./prompt-composer"

/**
 * Create a Tapestry agent config with optional disabled agents for prompt composition.
 */
export function createTapestryAgentWithOptions(
  model: string,
  disabledAgents?: Set<string>,
  continuation?: ResolvedContinuationConfig,
  experimentalSubagentOrchestration = false,
): AgentConfig {
  const tools = buildTapestryToolPolicy(experimentalSubagentOrchestration)

  if (!disabledAgents || disabledAgents.size === 0) {
    if (!continuation && !experimentalSubagentOrchestration) {
      return { ...TAPESTRY_DEFAULTS, tools, model, mode: "primary" }
    }
    return {
      ...TAPESTRY_DEFAULTS,
      tools,
      prompt: composeTapestryPrompt({ continuation, experimentalSubagentOrchestration }),
      model,
      mode: "primary",
    }
  }
  return {
    ...TAPESTRY_DEFAULTS,
    tools,
    prompt: composeTapestryPrompt({
      disabledAgents,
      continuation,
      experimentalSubagentOrchestration,
    }),
    model,
    mode: "primary",
  }
}

export const createTapestryAgent: AgentFactory = (model: string): AgentConfig => ({
  ...TAPESTRY_DEFAULTS,
  tools: buildTapestryToolPolicy(),
  model,
  mode: "primary",
})
createTapestryAgent.mode = "primary"
