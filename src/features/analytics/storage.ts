import { createAnalyticsFsStore, MaxSessionEntries } from "../../infrastructure/fs/analytics-fs-store"
import type { MetricsReport, ProjectFingerprint, SessionSummary } from "./types"

/** Maximum number of session summary entries to keep in the JSONL file */
export const MAX_SESSION_ENTRIES = MaxSessionEntries

const Store = createAnalyticsFsStore()

/**
 * Ensure the analytics directory exists, creating it if needed.
 * Returns the absolute path to the analytics directory.
 */
export function ensureAnalyticsDir(directory: string): string {
  return Store.ensureAnalyticsDir(directory)
}

/**
 * Append a session summary to the JSONL file.
 * Auto-creates the analytics directory if needed.
 * Rotates the file to at most MAX_SESSION_ENTRIES when the threshold is exceeded.
 */
export function appendSessionSummary(directory: string, summary: SessionSummary): boolean {
  return Store.appendSessionSummary(directory, summary)
}

/**
 * Read all session summaries from the JSONL file.
 * Returns an empty array if the file doesn't exist or is unparseable.
 */
export function readSessionSummaries(directory: string): SessionSummary[] {
  return Store.readSessionSummaries(directory)
}

/**
 * Write a project fingerprint to the analytics directory.
 * Auto-creates the analytics directory if needed.
 */
export function writeFingerprint(directory: string, fingerprint: ProjectFingerprint): boolean {
  return Store.writeFingerprint(directory, fingerprint)
}

/**
 * Read the project fingerprint from the analytics directory.
 * Returns null if the file doesn't exist or is unparseable.
 */
export function readFingerprint(directory: string): ProjectFingerprint | null {
  return Store.readFingerprint(directory)
}

// ── Metrics Reports ─────────────────────────────────────────────

/**
 * Write a metrics report to the JSONL file.
 * Auto-creates the analytics directory if needed.
 * Appends the report and rotates if exceeding MAX_METRICS_ENTRIES.
 */
export function writeMetricsReport(directory: string, report: MetricsReport): boolean {
  return Store.writeMetricsReport(directory, report)
}

/**
 * Read all metrics reports from the JSONL file.
 * Returns an empty array if the file doesn't exist or is unparseable.
 */
export function readMetricsReports(directory: string): MetricsReport[] {
  return Store.readMetricsReports(directory)
}
