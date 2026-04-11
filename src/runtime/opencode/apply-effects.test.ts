import { describe, expect, it } from "bun:test"
import { applyRuntimeEffects } from "./apply-effects"

describe("applyRuntimeEffects", () => {
  it("switches agent and appends prompt text", async () => {
    const output = {
      message: { agent: "Loom (Main Orchestrator)" },
      parts: [{ type: "text", text: "hello" }],
    }

    await applyRuntimeEffects({
      effects: [
        { type: "switchAgent", agent: "tapestry" },
        { type: "appendPromptText", text: "## Injected" },
      ],
      output,
    })

    expect(output.message.agent).toBe("Tapestry (Execution Orchestrator)")
    expect(output.parts[0].text).toContain("## Injected")
  })

  it("injects promptAsync through client", async () => {
    const calls: Array<{ path: { id: string }; body: unknown }> = []
    const client = {
      session: {
        promptAsync: async (input: { path: { id: string }; body: unknown }) => {
          calls.push(input)
        },
      },
    }

    await applyRuntimeEffects({
      effects: [{ type: "injectPromptAsync", sessionId: "s1", text: "continue", agent: "loom" }],
      client: client as never,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].path.id).toBe("s1")
  })

  it("restores agent identity without prompt text", async () => {
    const calls: Array<{ path: { id: string }; body: { parts: Array<{ type: string; text?: string }>; agent?: string } }> = []
    const client = {
      session: {
        promptAsync: async (input: { path: { id: string }; body: { parts: Array<{ type: string; text?: string }>; agent?: string } }) => {
          calls.push(input)
        },
      },
    }

    await applyRuntimeEffects({
      effects: [{ type: "restoreAgent", sessionId: "s2", agent: "loom" }],
      client: client as never,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].path.id).toBe("s2")
    expect(calls[0].body.agent).toBe("Loom (Main Orchestrator)")
    expect(calls[0].body.parts).toEqual([])
  })

  it("appends command output as a new text part", async () => {
    const output = { parts: [] as Array<{ type: string; text: string }> }

    await applyRuntimeEffects({
      effects: [{ type: "appendCommandOutput", text: "report" }],
      output,
    })

    expect(output.parts).toEqual([{ type: "text", text: "report" }])
  })
})
