import type { AgentConfig } from "@opencode-ai/sdk"
import type { ResolvedContinuationConfig } from "../../config/continuation"
import type { AgentFactory } from "../types"
import { TAPESTRY_DEFAULTS } from "./default"
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
): AgentConfig {
  if (!disabledAgents || disabledAgents.size === 0) {
    if (!continuation) {
      return { ...TAPESTRY_DEFAULTS, tools: { ...TAPESTRY_DEFAULTS.tools }, model, mode: "primary" }
    }
    return {
      ...TAPESTRY_DEFAULTS,
      tools: { ...TAPESTRY_DEFAULTS.tools },
      prompt: composeTapestryPrompt({ continuation }),
      model,
      mode: "primary",
    }
  }
  return {
    ...TAPESTRY_DEFAULTS,
    tools: { ...TAPESTRY_DEFAULTS.tools },
    prompt: composeTapestryPrompt({ disabledAgents, continuation }),
    model,
    mode: "primary",
  }
}

export const createTapestryAgent: AgentFactory = (model: string): AgentConfig => ({
  ...TAPESTRY_DEFAULTS,
  tools: { ...TAPESTRY_DEFAULTS.tools },
  model,
  mode: "primary",
})
createTapestryAgent.mode = "primary"
