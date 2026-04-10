import type { AgentConfig } from "@opencode-ai/sdk"
import type { CreatedHooks } from "../../hooks/create-hooks"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import { executeMetricsCommand } from "./metrics-command"
import { executeTokenReportCommand } from "./token-report-command"
import { executeWeaveHealthCommand } from "./weave-health-command"

export function routeCommandExecuteBefore(input: {
  command: string
  argumentsText: string
  directory: string
  hooks: CreatedHooks
  agents: Record<string, AgentConfig>
}): RuntimeEffect[] {
  switch (input.command) {
    case "token-report":
      return executeTokenReportCommand(input.directory)
    case "metrics":
      return executeMetricsCommand({
        directory: input.directory,
        argumentsText: input.argumentsText,
        analyticsEnabled: input.hooks.analyticsEnabled,
      })
    case "weave-health":
      return executeWeaveHealthCommand(input.agents)
    default:
      return []
  }
}
