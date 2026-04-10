import { getLastConfigLoadResult } from "../../config/loader"
import { generateHealthReport } from "../../features/health-report"
import type { RuntimeEffect } from "../../runtime/opencode/effects"
import type { AgentConfig } from "@opencode-ai/sdk"

export function executeWeaveHealthCommand(agents: Record<string, AgentConfig>): RuntimeEffect[] {
  return [{
    type: "appendCommandOutput",
    text: generateHealthReport(getLastConfigLoadResult(), agents),
  }]
}
