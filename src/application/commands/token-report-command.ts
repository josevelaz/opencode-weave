import { readSessionSummaries } from "../../features/analytics/storage"
import { generateTokenReport } from "../../features/analytics/token-report"
import type { RuntimeEffect } from "../../runtime/opencode/effects"

export function executeTokenReportCommand(directory: string): RuntimeEffect[] {
  const reportText = generateTokenReport(readSessionSummaries(directory))
  return [{ type: "appendCommandOutput", text: reportText }]
}
