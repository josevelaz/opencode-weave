import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { join } from "path"
import type { AnalyticsService } from "../../domain/analytics/analytics-service"
import {
  ANALYTICS_DIR,
  FINGERPRINT_FILE,
  MAX_METRICS_ENTRIES,
  type MetricsReport,
  METRICS_REPORTS_FILE,
  type ProjectFingerprint,
  SESSION_SUMMARIES_FILE,
  type SessionSummary,
} from "../../features/analytics/types"

export const MaxSessionEntries = 1000

function ensureAnalyticsDir(directory: string): string {
  const analyticsDir = join(directory, ANALYTICS_DIR)
  mkdirSync(analyticsDir, { recursive: true, mode: 0o700 })
  return analyticsDir
}

function appendSessionSummary(directory: string, summary: SessionSummary): boolean {
  try {
    const analyticsDir = ensureAnalyticsDir(directory)
    const filePath = join(analyticsDir, SESSION_SUMMARIES_FILE)
    appendFileSync(filePath, `${JSON.stringify(summary)}\n`, { encoding: "utf-8", mode: 0o600 })

    try {
      const typicalEntryBytes = 200
      const rotationSizeThreshold = MaxSessionEntries * typicalEntryBytes * 0.9
      if (statSync(filePath).size > rotationSizeThreshold) {
        const lines = readFileSync(filePath, "utf-8")
          .split("\n")
          .filter((line) => line.trim().length > 0)
        if (lines.length > MaxSessionEntries) {
          writeFileSync(filePath, `${lines.slice(-MaxSessionEntries).join("\n")}\n`, { encoding: "utf-8", mode: 0o600 })
        }
      }
    } catch {
      // non-fatal rotation failure
    }

    return true
  } catch {
    return false
  }
}

function readSessionSummaries(directory: string): SessionSummary[] {
  const filePath = join(directory, ANALYTICS_DIR, SESSION_SUMMARIES_FILE)
  try {
    if (!existsSync(filePath)) {
      return []
    }

    return readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as SessionSummary]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

function writeFingerprint(directory: string, fingerprint: ProjectFingerprint): boolean {
  try {
    const analyticsDir = ensureAnalyticsDir(directory)
    writeFileSync(join(analyticsDir, FINGERPRINT_FILE), JSON.stringify(fingerprint, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    })
    return true
  } catch {
    return false
  }
}

function readFingerprint(directory: string): ProjectFingerprint | null {
  const filePath = join(directory, ANALYTICS_DIR, FINGERPRINT_FILE)
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const parsed = JSON.parse(readFileSync(filePath, "utf-8"))
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.stack)) {
      return null
    }

    return parsed as ProjectFingerprint
  } catch {
    return null
  }
}

function writeMetricsReport(directory: string, report: MetricsReport): boolean {
  try {
    const analyticsDir = ensureAnalyticsDir(directory)
    const filePath = join(analyticsDir, METRICS_REPORTS_FILE)
    appendFileSync(filePath, `${JSON.stringify(report)}\n`, { encoding: "utf-8", mode: 0o600 })

    try {
      const typicalEntryBytes = 200
      const rotationSizeThreshold = MAX_METRICS_ENTRIES * typicalEntryBytes * 0.9
      if (statSync(filePath).size > rotationSizeThreshold) {
        const lines = readFileSync(filePath, "utf-8")
          .split("\n")
          .filter((line) => line.trim().length > 0)
        if (lines.length > MAX_METRICS_ENTRIES) {
          writeFileSync(filePath, `${lines.slice(-MAX_METRICS_ENTRIES).join("\n")}\n`, { encoding: "utf-8", mode: 0o600 })
        }
      }
    } catch {
      // non-fatal rotation failure
    }

    return true
  } catch {
    return false
  }
}

function readMetricsReports(directory: string): MetricsReport[] {
  const filePath = join(directory, ANALYTICS_DIR, METRICS_REPORTS_FILE)
  try {
    if (!existsSync(filePath)) {
      return []
    }

    return readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as MetricsReport]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

export function createAnalyticsFsStore(): AnalyticsService {
  return {
    ensureAnalyticsDir,
    appendSessionSummary,
    readSessionSummaries,
    writeFingerprint,
    readFingerprint,
    writeMetricsReport,
    readMetricsReports,
  }
}
