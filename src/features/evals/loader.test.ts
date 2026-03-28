import { describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { EvalConfigError, loadEvalCaseFile, loadEvalSuiteManifest, loadTrajectoryScenario } from "./loader"

describe("eval loader", () => {
  it("loads a valid suite manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-loader-"))
    try {
      const suitesDir = join(dir, "evals", "suites")
      mkdirSync(suitesDir, { recursive: true })
      writeFileSync(
        join(suitesDir, "prompt-contracts.jsonc"),
        '{ "id": "prompt-contracts", "title": "Prompt contracts", "phase": "prompt", "caseFiles": ["evals/cases/a.jsonc"] }',
      )
      const suite = loadEvalSuiteManifest(dir, "prompt-contracts")
      expect(suite.id).toBe("prompt-contracts")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("surfaces allowed values for unknown kinds", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-loader-"))
    try {
      const casesDir = join(dir, "evals", "cases")
      mkdirSync(casesDir, { recursive: true })
      const casePath = join(casesDir, "bad.jsonc")
      writeFileSync(
        casePath,
        '{ "id": "bad", "title": "Bad", "phase": "prompt", "target": { "kind": "wrong", "agent": "loom" }, "executor": { "kind": "prompt-render" }, "evaluators": [{ "kind": "contains-all", "patterns": ["x"] }] }',
      )
      expect(() => loadEvalCaseFile(dir, casePath)).toThrow(EvalConfigError)
      try {
        loadEvalCaseFile(dir, casePath)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        expect(message).toContain("Allowed target.kind values")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("loadTrajectoryScenario", () => {
  it("loads a valid trajectory scenario", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-loader-scenario-"))
    try {
      const scenarioDir = join(dir, "evals", "scenarios")
      mkdirSync(scenarioDir, { recursive: true })
      writeFileSync(
        join(scenarioDir, "test-scenario.jsonc"),
        JSON.stringify({
          id: "test-scenario",
          title: "Test Scenario",
          agents: ["loom", "pattern"],
          turns: [
            { turn: 1, role: "user", content: "Build a feature" },
            { turn: 2, role: "assistant", agent: "loom", content: "Delegating", mockResponse: "Delegating to Pattern" },
          ],
        }),
      )
      const scenario = loadTrajectoryScenario(dir, "evals/scenarios/test-scenario.jsonc")
      expect(scenario.id).toBe("test-scenario")
      expect(scenario.agents).toEqual(["loom", "pattern"])
      expect(scenario.turns).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("throws EvalConfigError for missing scenario file", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-loader-scenario-"))
    try {
      expect(() => loadTrajectoryScenario(dir, "evals/scenarios/nonexistent.jsonc")).toThrow(EvalConfigError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("throws EvalConfigError for invalid scenario schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "weave-evals-loader-scenario-"))
    try {
      const scenarioDir = join(dir, "evals", "scenarios")
      mkdirSync(scenarioDir, { recursive: true })
      writeFileSync(
        join(scenarioDir, "bad-scenario.jsonc"),
        JSON.stringify({
          id: "bad",
          title: "Bad",
          agents: [],
          turns: [{ turn: 1, role: "user", content: "Hi" }],
        }),
      )
      expect(() => loadTrajectoryScenario(dir, "evals/scenarios/bad-scenario.jsonc")).toThrow(EvalConfigError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
