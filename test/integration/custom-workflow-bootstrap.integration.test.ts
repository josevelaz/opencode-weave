import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import WeavePlugin from "../../src/index"
import { resetNameVariants } from "../../src/agents/agent-builder"
import { resetDisplayNames, getAgentDisplayName } from "../../src/shared/agent-display-names"
import { createProjectFixture, type ProjectFixture } from "../testkit/fixtures/project-fixture"
import { makeMockCtx } from "../testkit/plugin-context"

describe("Integration: custom workflow bootstrap", () => {
  let fixture: ProjectFixture

  beforeEach(() => {
    fixture = createProjectFixture("weave-integration-custom-workflow-")
    fixture.writeFile("package.json", JSON.stringify({ name: "custom-workflow-test" }))
    fixture.writeFile(
      ".opencode/prompts/orchestrator.md",
      [
        "You are the lead orchestrator for a data pipeline team.",
        "",
        "Your job is to coordinate between the data-validator and report-writer agents.",
        "Always validate data before generating reports.",
      ].join("\n"),
    )
  })

  afterEach(() => {
    fixture.cleanup()
    resetDisplayNames()
    resetNameVariants()
  })

  it("boots a user-defined workflow with custom roles and builtin fallbacks", async () => {
    fixture.writeProjectConfig({
      disabled_agents: ["loom", "tapestry", "shuttle", "pattern", "spindle", "warp", "weft"],
      custom_agents: {
        "pipeline-lead": {
          prompt_file: "prompts/orchestrator.md",
          display_name: "Pipeline Lead",
          mode: "primary",
          model: "anthropic/claude-sonnet-4",
          category: "utility",
          cost: "EXPENSIVE",
          description: "Orchestrates the data pipeline workflow",
          triggers: [
            { domain: "Orchestration", trigger: "Coordinate data pipeline tasks" },
            { domain: "Planning", trigger: "Plan data processing steps" },
          ],
        },
        "data-validator": {
          prompt: "You validate data quality. Check schemas, detect anomalies, report issues.",
          display_name: "Data Validator",
          mode: "subagent",
          category: "specialist",
          cost: "CHEAP",
          tools: { read: true, glob: true, grep: true, write: false, edit: false, bash: false },
          description: "Validates data quality and schema conformance",
          triggers: [
            { domain: "Data Quality", trigger: "When data needs validation or schema checking" },
          ],
        },
        "report-writer": {
          prompt: "You generate reports from validated data. Write clear, structured markdown reports.",
          display_name: "Report Writer",
          mode: "subagent",
          category: "specialist",
          cost: "CHEAP",
          tools: { read: true, write: true, edit: true, bash: false, glob: true, grep: true },
          description: "Generates structured reports from data",
          triggers: [
            { domain: "Reporting", trigger: "When reports need to be generated from data" },
          ],
        },
      },
    })

    const plugin = await WeavePlugin(makeMockCtx(fixture.directory))
    const configObj: Record<string, unknown> = {}
    await (plugin.config as (config: Record<string, unknown>) => Promise<void>)(configObj)

    const agents = configObj.agent as Record<string, {
      prompt?: string
      model?: string
      mode?: string
      tools?: Record<string, boolean>
    }>

    const disabledBuiltins = ["loom", "tapestry", "shuttle", "pattern", "spindle", "warp", "weft"]
    for (const name of disabledBuiltins) {
      expect(agents[getAgentDisplayName(name)]).toBeUndefined()
    }

    expect(agents[getAgentDisplayName("thread")]).toBeDefined()

    const lead = agents["Pipeline Lead"]
    expect(lead).toBeDefined()
    expect(lead.prompt).toContain("lead orchestrator for a data pipeline team")
    expect(lead.prompt).toContain("data-validator and report-writer")
    expect(lead.model).toBe("anthropic/claude-sonnet-4")
    expect(lead.mode).toBe("primary")

    const validator = agents["Data Validator"]
    expect(validator).toBeDefined()
    expect(validator.prompt).toContain("validate data quality")
    expect(validator.mode).toBe("subagent")
    expect((validator.tools as Record<string, boolean>).read).toBe(true)
    expect((validator.tools as Record<string, boolean>).write).toBe(false)
    expect((validator.tools as Record<string, boolean>).bash).toBe(false)

    const writer = agents["Report Writer"]
    expect(writer).toBeDefined()
    expect(writer.prompt).toContain("generate reports")
    expect((writer.tools as Record<string, boolean>).write).toBe(true)
    expect((writer.tools as Record<string, boolean>).bash).toBe(false)

    const defaultAgent = configObj.default_agent as string
    expect(defaultAgent).toBeDefined()
    expect(defaultAgent).not.toBe(getAgentDisplayName("loom"))

    const agentKeys = Object.keys(agents)
    expect(agentKeys.length).toBeGreaterThanOrEqual(4)
    expect(agents[getAgentDisplayName("thread")]).toBeDefined()
    expect(agents["Pipeline Lead"]).toBeDefined()
    expect(agents["Data Validator"]).toBeDefined()
    expect(agents["Report Writer"]).toBeDefined()
  })
})
