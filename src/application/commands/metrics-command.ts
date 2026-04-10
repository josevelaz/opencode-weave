import { readMetricsReports, readSessionSummaries } from "../../features/analytics"
import { formatMetricsMarkdown } from "../../features/analytics/format-metrics"
import type { RuntimeEffect } from "../../runtime/opencode/effects"

export function executeMetricsCommand(input: {
  directory: string
  argumentsText: string
  analyticsEnabled: boolean
}): RuntimeEffect[] {
  if (!input.analyticsEnabled) {
    return [{
      type: "appendCommandOutput",
      text: "Analytics is not enabled. To enable it, set `\"analytics\": { \"enabled\": true }` in your `weave.json`.",
    }]
  }

  const reports = readMetricsReports(input.directory)
  const summaries = readSessionSummaries(input.directory)
  return [{
    type: "appendCommandOutput",
    text: formatMetricsMarkdown(reports, summaries, input.argumentsText),
  }]
}
