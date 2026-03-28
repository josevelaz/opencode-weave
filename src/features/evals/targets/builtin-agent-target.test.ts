import { describe, expect, it } from "bun:test"
import { resolveBuiltinAgentTarget } from "./builtin-agent-target"

describe("resolveBuiltinAgentTarget", () => {
  it("renders loom via composer", () => {
    const result = resolveBuiltinAgentTarget({ kind: "builtin-agent-prompt", agent: "loom" })
    expect(result.artifacts.agentMetadata?.sourceKind).toBe("composer")
    expect(result.artifacts.renderedPrompt).toContain("<PlanWorkflow>")
  })

  it("supports disabled-agent variants", () => {
    const result = resolveBuiltinAgentTarget({
      kind: "builtin-agent-prompt",
      agent: "loom",
      variant: { disabledAgents: ["warp"] },
    })
    expect(result.artifacts.renderedPrompt).not.toContain("MUST use Warp")
  })

  it("resolves default-agent prompts", () => {
    const result = resolveBuiltinAgentTarget({ kind: "builtin-agent-prompt", agent: "thread" })
    expect(result.artifacts.agentMetadata?.sourceKind).toBe("default")
    expect(result.artifacts.toolPolicy).toEqual({
      write: false,
      edit: false,
      task: false,
      call_weave_agent: false,
    })
  })

  it("resolves shuttle with default prompt and tool deny-list", () => {
    const result = resolveBuiltinAgentTarget({ kind: "builtin-agent-prompt", agent: "shuttle" })
    expect(result.artifacts.agentMetadata?.sourceKind).toBe("default")
    expect(result.artifacts.agentMetadata?.agent).toBe("shuttle")
    expect(result.artifacts.toolPolicy).toEqual({ call_weave_agent: false })
    expect(result.artifacts.renderedPrompt).toBeTruthy()
    expect(result.artifacts.renderedPrompt!.length).toBeGreaterThan(0)
    expect(result.artifacts.renderedPrompt).toContain("<Role>")
    expect(result.artifacts.renderedPrompt).toContain("Never spawn subagents")
  })
})
