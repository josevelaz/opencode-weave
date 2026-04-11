import { describe, expect, it } from "bun:test"
import { executeStartWorkCommand } from "./start-work-command"
import { executeRunWorkflowCommand } from "./run-workflow-command"

describe("agent restore command effects", () => {
  it("emits restoreAgent alongside switchAgent for /start-work", () => {
    const effects = executeStartWorkCommand({
      hooks: {
        startWork: () => ({ contextInjection: "plan", switchAgent: "tapestry" }),
      } as never,
      promptText: "/start-work",
      sessionId: "sess-start",
      isWorkflowCommand: false,
    })

    expect(effects).toEqual([
      { type: "switchAgent", agent: "tapestry" },
      { type: "restoreAgent", sessionId: "sess-start", agent: "tapestry" },
      { type: "appendPromptText", text: "plan" },
    ])
  })

  it("emits restoreAgent alongside switchAgent for /run-workflow", () => {
    const effects = executeRunWorkflowCommand({
      hooks: {
        workflowStart: () => ({ contextInjection: "workflow", switchAgent: "weft" }),
      } as never,
      promptText: "/run-workflow",
      sessionId: "sess-wf",
      isRunWorkflowCommand: true,
    })

    expect(effects).toEqual([
      { type: "switchAgent", agent: "weft" },
      { type: "restoreAgent", sessionId: "sess-wf", agent: "weft" },
      { type: "appendPromptText", text: "workflow" },
    ])
  })
})
