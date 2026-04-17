import type { AgentConfig } from "@opencode-ai/sdk"
import { composeTapestryPrompt } from "./prompt-composer"

export function buildTapestryToolPolicy(
  experimentalSubagentOrchestration = false,
): Record<string, boolean> {
  return {
    call_weave_agent: experimentalSubagentOrchestration,
  }
}

export const TAPESTRY_DEFAULTS: AgentConfig = {
  temperature: 0.1,
  description: "Tapestry (Execution Orchestrator)",
  tools: buildTapestryToolPolicy(),
  prompt: composeTapestryPrompt(),
}
