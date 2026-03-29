import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs"
import { join, normalize } from "path"
import { tmpdir } from "os"
import { loadWorkflowDefinition, discoverWorkflows } from "./discovery"
import { WORKFLOWS_DIR_PROJECT } from "./constants"

let testDir: string

const VALID_JSONC = `{
  // This is a comment
  "name": "test-workflow",
  "description": "A test workflow",
  "version": 1,
  "steps": [
    {
      "id": "gather",
      "name": "Gather",
      "type": "interactive",
      "agent": "loom",
      "prompt": "Gather info.",
      "completion": { "method": "user_confirm" }
    }
  ]
}`

const ANOTHER_WORKFLOW_JSONC = `{
  "name": "another-workflow",
  "version": 1,
  "steps": [
    {
      "id": "do-it",
      "name": "Do It",
      "type": "autonomous",
      "agent": "tapestry",
      "prompt": "Do the thing.",
      "completion": { "method": "agent_signal" }
    }
  ]
}`

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "weave-discovery-test-"))
})

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors on Windows
  }
})

describe("loadWorkflowDefinition", () => {
  it("loads and validates a valid JSONC file", () => {
    const filePath = join(testDir, "test.jsonc")
    writeFileSync(filePath, VALID_JSONC, "utf-8")
    const def = loadWorkflowDefinition(filePath)
    expect(def).not.toBeNull()
    expect(def!.name).toBe("test-workflow")
    expect(def!.steps).toHaveLength(1)
    expect(def!.steps[0].id).toBe("gather")
  })

  it("loads a valid .json file", () => {
    const filePath = join(testDir, "test.json")
    writeFileSync(filePath, JSON.stringify({
      name: "json-workflow",
      version: 1,
      steps: [{
        id: "step-one",
        name: "Step One",
        type: "autonomous",
        agent: "loom",
        prompt: "Do it.",
        completion: { method: "agent_signal" },
      }],
    }), "utf-8")
    const def = loadWorkflowDefinition(filePath)
    expect(def).not.toBeNull()
    expect(def!.name).toBe("json-workflow")
  })

  it("returns null for non-existent file", () => {
    expect(loadWorkflowDefinition(join(testDir, "nope.jsonc"))).toBeNull()
  })

  it("returns null for invalid JSON", () => {
    const filePath = join(testDir, "bad.jsonc")
    writeFileSync(filePath, "not json at all {{{{", "utf-8")
    expect(loadWorkflowDefinition(filePath)).toBeNull()
  })

  it("returns null for valid JSON that fails schema", () => {
    const filePath = join(testDir, "invalid.jsonc")
    writeFileSync(filePath, '{"name": "BAD", "version": 1, "steps": []}', "utf-8")
    expect(loadWorkflowDefinition(filePath)).toBeNull()
  })

  it("handles JSONC comments correctly", () => {
    const jsonc = `{
      // top comment
      "name": "commented",
      "version": 1,
      /* block comment */
      "steps": [{
        "id": "step",
        "name": "Step",
        "type": "autonomous",
        "agent": "loom",
        "prompt": "Do it.",
        "completion": { "method": "agent_signal" }
      }]
    }`
    const filePath = join(testDir, "commented.jsonc")
    writeFileSync(filePath, jsonc, "utf-8")
    const def = loadWorkflowDefinition(filePath)
    expect(def).not.toBeNull()
    expect(def!.name).toBe("commented")
  })
})

describe("discoverWorkflows", () => {
  it("returns empty array when no workflows directory exists", () => {
    expect(discoverWorkflows(testDir)).toEqual([])
  })

  it("discovers workflows from project directory", () => {
    const wfDir = join(testDir, WORKFLOWS_DIR_PROJECT)
    mkdirSync(wfDir, { recursive: true })
    writeFileSync(join(wfDir, "test.jsonc"), VALID_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir)
    expect(workflows).toHaveLength(1)
    expect(workflows[0].definition.name).toBe("test-workflow")
    expect(workflows[0].scope).toBe("project")
  })

  it("discovers multiple workflows", () => {
    const wfDir = join(testDir, WORKFLOWS_DIR_PROJECT)
    mkdirSync(wfDir, { recursive: true })
    writeFileSync(join(wfDir, "test.jsonc"), VALID_JSONC, "utf-8")
    writeFileSync(join(wfDir, "another.jsonc"), ANOTHER_WORKFLOW_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir)
    expect(workflows).toHaveLength(2)
    const names = workflows.map((w) => w.definition.name).sort()
    expect(names).toEqual(["another-workflow", "test-workflow"])
  })

  it("skips non-jsonc/json files", () => {
    const wfDir = join(testDir, WORKFLOWS_DIR_PROJECT)
    mkdirSync(wfDir, { recursive: true })
    writeFileSync(join(wfDir, "test.jsonc"), VALID_JSONC, "utf-8")
    writeFileSync(join(wfDir, "readme.md"), "# Not a workflow", "utf-8")
    writeFileSync(join(wfDir, "notes.txt"), "notes", "utf-8")
    const workflows = discoverWorkflows(testDir)
    expect(workflows).toHaveLength(1)
  })

  it("skips invalid workflow files", () => {
    const wfDir = join(testDir, WORKFLOWS_DIR_PROJECT)
    mkdirSync(wfDir, { recursive: true })
    writeFileSync(join(wfDir, "valid.jsonc"), VALID_JSONC, "utf-8")
    writeFileSync(join(wfDir, "invalid.jsonc"), '{"not":"a workflow"}', "utf-8")
    const workflows = discoverWorkflows(testDir)
    expect(workflows).toHaveLength(1)
    expect(workflows[0].definition.name).toBe("test-workflow")
  })

  it("skips directories inside workflows dir", () => {
    const wfDir = join(testDir, WORKFLOWS_DIR_PROJECT)
    mkdirSync(join(wfDir, "subdir"), { recursive: true })
    writeFileSync(join(wfDir, "test.jsonc"), VALID_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir)
    expect(workflows).toHaveLength(1)
  })
})

describe("discoverWorkflows with custom directories", () => {
  it("discovers workflows from a custom relative directory", () => {
    const customDir = join(testDir, "custom-workflows")
    mkdirSync(customDir, { recursive: true })
    writeFileSync(join(customDir, "custom.jsonc"), VALID_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir, ["custom-workflows"])
    expect(workflows).toHaveLength(1)
    expect(workflows[0].definition.name).toBe("test-workflow")
    expect(workflows[0].scope).toBe("project")
  })

  it("resolves relative custom directories against project root", () => {
    const customDir = join(testDir, "my-workflows")
    mkdirSync(customDir, { recursive: true })
    writeFileSync(join(customDir, "custom.jsonc"), VALID_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir, ["my-workflows"])
    expect(workflows).toHaveLength(1)
    expect(workflows[0].definition.name).toBe("test-workflow")
  })

  it("project workflows override custom directory workflows with same name", () => {
    // Custom dir has "test-workflow"
    const customDir = join(testDir, "custom-workflows")
    mkdirSync(customDir, { recursive: true })
    writeFileSync(join(customDir, "custom.jsonc"), VALID_JSONC, "utf-8")
    // Project dir also has "test-workflow"
    const projectDir = join(testDir, WORKFLOWS_DIR_PROJECT)
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, "project.jsonc"), VALID_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir, ["custom-workflows"])
    // Only one — project wins
    expect(workflows).toHaveLength(1)
    expect(workflows[0].scope).toBe("project")
    expect(workflows[0].path).toContain(normalize(WORKFLOWS_DIR_PROJECT))
  })

  it("custom directory workflows override user workflows with same name", () => {
    // Only a custom dir — no project dir — so custom wins over user (user has none in test)
    const customDir = join(testDir, "custom-workflows")
    mkdirSync(customDir, { recursive: true })
    writeFileSync(join(customDir, "custom.jsonc"), VALID_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir, ["custom-workflows"])
    expect(workflows).toHaveLength(1)
    expect(workflows[0].scope).toBe("project")
  })

  it("skips non-existent custom directories gracefully", () => {
    const workflows = discoverWorkflows(testDir, ["does-not-exist"])
    expect(workflows).toHaveLength(0)
  })

  it("works with empty customDirs array", () => {
    const workflows = discoverWorkflows(testDir, [])
    expect(workflows).toHaveLength(0)
  })

  it("merges workflows from multiple custom directories", () => {
    mkdirSync(join(testDir, "custom1"), { recursive: true })
    mkdirSync(join(testDir, "custom2"), { recursive: true })
    writeFileSync(join(testDir, "custom1", "wf1.jsonc"), VALID_JSONC, "utf-8")
    writeFileSync(join(testDir, "custom2", "wf2.jsonc"), ANOTHER_WORKFLOW_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir, ["custom1", "custom2"])
    expect(workflows).toHaveLength(2)
    const names = workflows.map((w) => w.definition.name).sort()
    expect(names).toEqual(["another-workflow", "test-workflow"])
  })

  it("existing behavior unchanged when no customDirs provided", () => {
    const wfDir = join(testDir, WORKFLOWS_DIR_PROJECT)
    mkdirSync(wfDir, { recursive: true })
    writeFileSync(join(wfDir, "test.jsonc"), VALID_JSONC, "utf-8")
    const withoutCustom = discoverWorkflows(testDir)
    const withUndefined = discoverWorkflows(testDir, undefined)
    expect(withoutCustom).toHaveLength(1)
    expect(withUndefined).toHaveLength(1)
    expect(withoutCustom[0].definition.name).toBe(withUndefined[0].definition.name)
  })

  it("rejects absolute paths in customDirs (path traversal protection)", () => {
    // Even if the absolute path points to a valid directory with workflows,
    // it should be rejected for security
    const absDir = join(testDir, "abs-workflows")
    mkdirSync(absDir, { recursive: true })
    writeFileSync(join(absDir, "wf.jsonc"), VALID_JSONC, "utf-8")
    const workflows = discoverWorkflows(testDir, [absDir])
    expect(workflows).toHaveLength(0)
  })

  it("rejects paths with .. traversal above project root", () => {
    const workflows = discoverWorkflows(testDir, ["../../../etc"])
    expect(workflows).toHaveLength(0)
  })

  it("rejects paths that resolve outside project root via nested ..", () => {
    const workflows = discoverWorkflows(testDir, ["subdir/../../outside"])
    expect(workflows).toHaveLength(0)
  })
})
