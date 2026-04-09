import { describe, it, expect, afterEach } from "bun:test"
import { generateHealthReport } from "./health-report"
import type { ConfigLoadResult } from "../config/loader"
import { getAgentDisplayName, resetDisplayNames, updateBuiltinDisplayName } from "../shared/agent-display-names"

describe("generateHealthReport", () => {
  afterEach(() => {
    resetDisplayNames()
  })

  it("reports healthy when no diagnostics", () => {
    const loadResult: ConfigLoadResult = {
      config: {},
      loadedFiles: ["/home/user/.config/opencode/weave-opencode.jsonc"],
      diagnostics: [],
    }
    const agents = {
      "Loom (Main Orchestrator)": {},
      "Tapestry (Execution Orchestrator)": {},
    }
    const report = generateHealthReport(loadResult, agents)
    expect(report).toContain("✅ Weave Config Health: OK")
    expect(report).toContain("weave-opencode.jsonc")
    expect(report).not.toContain("Validation Issues")
  })

  it("reports issues when diagnostics present", () => {
    const loadResult: ConfigLoadResult = {
      config: {},
      loadedFiles: ["/project/.opencode/weave-opencode.json"],
      diagnostics: [
        {
          level: "warn",
          section: "custom_agents",
          message: 'Section "custom_agents" was dropped due to validation errors',
          fields: [
            { path: "my-agent.mode", message: 'Invalid option: expected one of "subagent"|"primary"|"all"' },
          ],
        },
      ],
    }
    const report = generateHealthReport(loadResult, {})
    expect(report).toContain("⚠ Weave Config Health: Issues Found")
    expect(report).toContain("custom_agents")
    expect(report).toContain("my-agent.mode")
    expect(report).toContain("Invalid option")
    expect(report).toContain("Fix the issues above")
  })

  it("shows loaded and custom agent counts", () => {
    const loadResult: ConfigLoadResult = {
      config: {
        custom_agents: {
          "my-reviewer": { prompt: "Review code", model: "test/v1" },
        },
      },
      loadedFiles: [],
      diagnostics: [],
    }
    const agents = {
      "Loom (Main Orchestrator)": {},
      "shuttle": {},
      "my-reviewer": {},
    }
    const report = generateHealthReport(loadResult, agents)
    expect(report).toContain("Builtin: 2/8")
    expect(report).toContain("Custom: 1")
    expect(report).toContain("my-reviewer")
  })

  it("classifies raw builtin agent keys correctly for /weave-health runtime input", () => {
    const loadResult: ConfigLoadResult = {
      config: {},
      loadedFiles: [],
      diagnostics: [],
    }
    const agents = {
      loom: {},
      tapestry: {},
      shuttle: {},
      pattern: {},
      thread: {},
      spindle: {},
      warp: {},
      weft: {},
    }

    const report = generateHealthReport(loadResult, agents)
    expect(report).toContain("Builtin: 8/8 (loom, tapestry, shuttle, pattern, thread, spindle, warp, weft)")
    expect(report).toContain("Custom: 0")
  })

  it("classifies builtins correctly when display names are overridden", () => {
    updateBuiltinDisplayName("loom", "My Loom")
    updateBuiltinDisplayName("thread", "Codebase explorer (thread)")

    const loadResult: ConfigLoadResult = {
      config: {},
      loadedFiles: [],
      diagnostics: [],
    }
    const agents = {
      loom: {},
      thread: {},
      [getAgentDisplayName("tapestry")]: {},
    }

    const report = generateHealthReport(loadResult, agents)
    expect(report).toContain("Builtin: 3/8")
    expect(report).toContain("Custom: 0")
  })

  it("shows disabled agents", () => {
    const loadResult: ConfigLoadResult = {
      config: { disabled_agents: ["warp", "weft"] },
      loadedFiles: [],
      diagnostics: [],
    }
    const report = generateHealthReport(loadResult, {})
    expect(report).toContain("Disabled Agents")
    expect(report).toContain("warp")
    expect(report).toContain("weft")
  })

  it("reports split continuation defaults and manual resume guidance", () => {
    const loadResult: ConfigLoadResult = {
      config: {},
      loadedFiles: [],
      diagnostics: [],
    }
    const report = generateHealthReport(loadResult, {})
    expect(report).toContain("Continuation Behavior")
    expect(report).toContain("Compaction recovery prompt: enabled")
    expect(report).toContain("Idle work prompts: disabled by default")
    expect(report).toContain("Idle workflow prompts: disabled by default")
    expect(report).toContain("Idle todo fallback prompt: disabled by default")
    expect(report).toContain("/start-work")
    expect(report).toContain("/run-workflow")
  })

  it("reports continuation suppression by hook overrides", () => {
    const loadResult: ConfigLoadResult = {
      config: {
        continuation: {
          recovery: { compaction: true },
          idle: { enabled: true },
        },
        disabled_hooks: ["work-continuation", "workflow", "todo-continuation-enforcer"],
      },
      loadedFiles: [],
      diagnostics: [],
    }
    const report = generateHealthReport(loadResult, {})
    expect(report).toContain("Compaction recovery prompt: disabled by hook: work-continuation")
    expect(report).toContain("Idle workflow prompts: disabled by hook: workflow")
    expect(report).toContain("Idle todo fallback prompt: disabled by hook: todo-continuation-enforcer")
  })

  it("includes log location hint", () => {
    const loadResult: ConfigLoadResult = {
      config: {},
      loadedFiles: [],
      diagnostics: [],
    }
    const report = generateHealthReport(loadResult, {})
    expect(report).toContain("~/.local/share/opencode/log/")
    expect(report).toContain("service=weave")
    expect(report).toContain("--print-logs")
  })

  it("handles null load result", () => {
    const report = generateHealthReport(null, {})
    expect(report).toContain("No config load result available")
  })

  it("reports multiple diagnostics with field details", () => {
    const loadResult: ConfigLoadResult = {
      config: {},
      loadedFiles: [],
      diagnostics: [
        {
          level: "warn",
          section: "custom_agents",
          message: "Section dropped",
          fields: [
            { path: "agent-a.cost", message: "Invalid enum" },
            { path: "agent-b.mode", message: "Expected subagent|primary|all" },
          ],
        },
        {
          level: "error",
          section: "(root)",
          message: "Config validation failed entirely",
        },
      ],
    }
    const report = generateHealthReport(loadResult, {})
    expect(report).toContain("🟡")
    expect(report).toContain("🔴")
    expect(report).toContain("agent-a.cost")
    expect(report).toContain("agent-b.mode")
  })

  it("shows no config files found when loadedFiles is empty", () => {
    const loadResult: ConfigLoadResult = {
      config: {},
      loadedFiles: [],
      diagnostics: [],
    }
    const report = generateHealthReport(loadResult, {})
    expect(report).toContain("No config files found")
  })
})
