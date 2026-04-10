import type { MetricsReport, ProjectFingerprint, SessionSummary } from "../../features/analytics/types"

export interface AnalyticsService {
  ensureAnalyticsDir(directory: string): string
  appendSessionSummary(directory: string, summary: SessionSummary): boolean
  readSessionSummaries(directory: string): SessionSummary[]
  writeFingerprint(directory: string, fingerprint: ProjectFingerprint): boolean
  readFingerprint(directory: string): ProjectFingerprint | null
  writeMetricsReport(directory: string, report: MetricsReport): boolean
  readMetricsReports(directory: string): MetricsReport[]
}
