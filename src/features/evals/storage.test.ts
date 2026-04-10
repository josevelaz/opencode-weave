import { describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { ensureEvalStorageDir, writeEvalRunResult, appendEvalRunJsonl, getDefaultJsonlPath } from "./storage"
import fixture from "./__fixtures__/phase1-run-result.json"
import type { EvalRunResult } from "./types"

describe("eval storage", () => {
  it("creates storage directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-storage-"))
    try {
      const path = ensureEvalStorageDir(dir)
      expect(existsSync(path)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("writes run result and latest pointer copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-storage-"))
    try {
      const outputPath = writeEvalRunResult(dir, fixture as EvalRunResult)
      expect(existsSync(outputPath)).toBe(true)
      expect(existsSync(join(dir, ".weave", "evals", "latest.json"))).toBe(true)
      const saved = JSON.parse(readFileSync(outputPath, "utf-8"))
      expect(Object.keys(saved)).toEqual(Object.keys(fixture))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("appends JSONL lines without overwriting", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-jsonl-"))
    try {
      const jsonlPath = join(dir, "results.jsonl")
      const result = fixture as EvalRunResult

      appendEvalRunJsonl(dir, result, jsonlPath)
      appendEvalRunJsonl(dir, result, jsonlPath)

      const content = readFileSync(jsonlPath, "utf-8")
      const lines = content.trim().split("\n")
      expect(lines.length).toBe(2)

      const parsed = JSON.parse(lines[0])
      expect(parsed.runId).toBe(result.runId)
      expect(parsed.suiteId).toBe(result.suiteId)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("uses default JSONL path based on suiteId", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-jsonl-"))
    try {
      const result = fixture as EvalRunResult
      const defaultPath = getDefaultJsonlPath(dir, result.suiteId)

      appendEvalRunJsonl(dir, result)

      expect(existsSync(defaultPath)).toBe(true)
      const content = readFileSync(defaultPath, "utf-8")
      const lines = content.trim().split("\n")
      expect(lines.length).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("persists run metadata in JSONL output", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-jsonl-metadata-"))
    try {
      const result = {
        ...(fixture as EvalRunResult),
        runMetadata: {
          provider: "openrouter",
          model: "anthropic/claude-3.5-sonnet",
          modelKey: "openrouter/anthropic/claude-3.5-sonnet",
          source: "local",
        },
      } satisfies EvalRunResult

      const jsonlPath = join(dir, "results.jsonl")
      appendEvalRunJsonl(dir, result, jsonlPath)

      const content = readFileSync(jsonlPath, "utf-8")
      const parsed = JSON.parse(content.trim())
      expect(parsed.runMetadata.modelKey).toBe("openrouter/anthropic/claude-3.5-sonnet")
      expect(parsed.runMetadata.provider).toBe("openrouter")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("persists optional suite metadata in JSONL output", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-jsonl-suite-meta-"))
    try {
      const result = {
        ...(fixture as EvalRunResult),
        suiteMetadata: {
          title: "Prompt Contracts",
          routingKind: "other",
        },
      } satisfies EvalRunResult

      const jsonlPath = join(dir, "results.jsonl")
      appendEvalRunJsonl(dir, result, jsonlPath)

      const content = readFileSync(jsonlPath, "utf-8")
      const parsed = JSON.parse(content.trim())
      expect(parsed.suiteMetadata.title).toBe("Prompt Contracts")
      expect(parsed.suiteMetadata.routingKind).toBe("other")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
