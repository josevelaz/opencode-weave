import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, statSync } from "fs"
import { join } from "path"
import type { SessionSummary, ProjectFingerprint, MetricsReport } from "./types"
import { ANALYTICS_DIR, SESSION_SUMMARIES_FILE, FINGERPRINT_FILE, METRICS_REPORTS_FILE, MAX_METRICS_ENTRIES } from "./types"

/** Maximum number of session summary entries to keep in the JSONL file */
export const MAX_SESSION_ENTRIES = 1000

/**
 * Ensure the analytics directory exists, creating it if needed.
 * Returns the absolute path to the analytics directory.
 */
export function ensureAnalyticsDir(directory: string): string {
  const dir = join(directory, ANALYTICS_DIR)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

/**
 * Append a session summary to the JSONL file.
 * Auto-creates the analytics directory if needed.
 * Rotates the file to at most MAX_SESSION_ENTRIES when the threshold is exceeded.
 */
export function appendSessionSummary(directory: string, summary: SessionSummary): boolean {
  try {
    const dir = ensureAnalyticsDir(directory)
    const filePath = join(dir, SESSION_SUMMARIES_FILE)
    const line = JSON.stringify(summary) + "\n"
    appendFileSync(filePath, line, { encoding: "utf-8", mode: 0o600 })

    // Rotation check: use file size as a cheap gate before reading the file.
    // The gate is set to 90% of (MAX_SESSION_ENTRIES × typical entry size) to avoid
    // reading the file on every write in the common (well-below-limit) case.
    // A typical session summary JSONL line is ~200–400 bytes.
    try {
      const TYPICAL_ENTRY_BYTES = 200
      const rotationSizeThreshold = MAX_SESSION_ENTRIES * TYPICAL_ENTRY_BYTES * 0.9
      const { size } = statSync(filePath)
      if (size > rotationSizeThreshold) {
        const content = readFileSync(filePath, "utf-8")
        const lines = content.split("\n").filter((l) => l.trim().length > 0)
        if (lines.length > MAX_SESSION_ENTRIES) {
          const trimmed = lines.slice(-MAX_SESSION_ENTRIES).join("\n") + "\n"
          writeFileSync(filePath, trimmed, { encoding: "utf-8", mode: 0o600 })
        }
      }
    } catch {
      // rotation failure is non-fatal
    }

    return true
  } catch {
    return false
  }
}

/**
 * Read all session summaries from the JSONL file.
 * Returns an empty array if the file doesn't exist or is unparseable.
 */
export function readSessionSummaries(directory: string): SessionSummary[] {
  const filePath = join(directory, ANALYTICS_DIR, SESSION_SUMMARIES_FILE)
  try {
    if (!existsSync(filePath)) return []
    const content = readFileSync(filePath, "utf-8")
    const lines = content.split("\n").filter((line) => line.trim().length > 0)
    const summaries: SessionSummary[] = []
    for (const line of lines) {
      try {
        summaries.push(JSON.parse(line) as SessionSummary)
      } catch {
        // skip malformed lines
      }
    }
    return summaries
  } catch {
    return []
  }
}

/**
 * Write a project fingerprint to the analytics directory.
 * Auto-creates the analytics directory if needed.
 */
export function writeFingerprint(directory: string, fingerprint: ProjectFingerprint): boolean {
  try {
    const dir = ensureAnalyticsDir(directory)
    const filePath = join(dir, FINGERPRINT_FILE)
    writeFileSync(filePath, JSON.stringify(fingerprint, null, 2), { encoding: "utf-8", mode: 0o600 })
    return true
  } catch {
    return false
  }
}

/**
 * Read the project fingerprint from the analytics directory.
 * Returns null if the file doesn't exist or is unparseable.
 */
export function readFingerprint(directory: string): ProjectFingerprint | null {
  const filePath = join(directory, ANALYTICS_DIR, FINGERPRINT_FILE)
  try {
    if (!existsSync(filePath)) return null
    const content = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.stack)) return null
    return parsed as ProjectFingerprint
  } catch {
    return null
  }
}

// ── Metrics Reports ─────────────────────────────────────────────

/**
 * Write a metrics report to the JSONL file.
 * Auto-creates the analytics directory if needed.
 * Appends the report and rotates if exceeding MAX_METRICS_ENTRIES.
 */
export function writeMetricsReport(directory: string, report: MetricsReport): boolean {
  try {
    const dir = ensureAnalyticsDir(directory)
    const filePath = join(dir, METRICS_REPORTS_FILE)
    const line = JSON.stringify(report) + "\n"
    appendFileSync(filePath, line, { encoding: "utf-8", mode: 0o600 })

    // Rotation check: use file size as a cheap gate before reading the file.
    try {
      const TYPICAL_ENTRY_BYTES = 200
      const rotationSizeThreshold = MAX_METRICS_ENTRIES * TYPICAL_ENTRY_BYTES * 0.9
      const { size } = statSync(filePath)
      if (size > rotationSizeThreshold) {
        const content = readFileSync(filePath, "utf-8")
        const lines = content.split("\n").filter((l) => l.trim().length > 0)
        if (lines.length > MAX_METRICS_ENTRIES) {
          const trimmed = lines.slice(-MAX_METRICS_ENTRIES).join("\n") + "\n"
          writeFileSync(filePath, trimmed, { encoding: "utf-8", mode: 0o600 })
        }
      }
    } catch {
      // rotation failure is non-fatal
    }

    return true
  } catch {
    return false
  }
}

/**
 * Read all metrics reports from the JSONL file.
 * Returns an empty array if the file doesn't exist or is unparseable.
 */
export function readMetricsReports(directory: string): MetricsReport[] {
  const filePath = join(directory, ANALYTICS_DIR, METRICS_REPORTS_FILE)
  try {
    if (!existsSync(filePath)) return []
    const content = readFileSync(filePath, "utf-8")
    const lines = content.split("\n").filter((line) => line.trim().length > 0)
    const reports: MetricsReport[] = []
    for (const line of lines) {
      try {
        reports.push(JSON.parse(line) as MetricsReport)
      } catch {
        // skip malformed lines
      }
    }
    return reports
  } catch {
    return []
  }
}
