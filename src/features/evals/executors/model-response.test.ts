import { describe, expect, it } from "bun:test"
import { executeModelResponse } from "./model-response"

describe("executeModelResponse", () => {
  it("returns mocked response and sanitized provider metadata", () => {
    process.env.WEAVE_EVAL_MOCK_RESPONSES = JSON.stringify({
      "openai/gpt-5": "delegate to thread",
    })

    const artifacts = executeModelResponse(
      {
        target: { kind: "builtin-agent-prompt", agent: "loom" },
        artifacts: { renderedPrompt: "prompt" },
      },
      {
        kind: "model-response",
        provider: "openai",
        model: "gpt-5",
        input: "hello",
      },
      { mode: "local", directory: process.cwd() },
    )

    expect(artifacts.modelOutput).toBe("delegate to thread")
    expect((artifacts.baselineDelta as { provider: string }).provider).toBe("o***i")
  })

  it("fails when no mock mapping env is provided", () => {
    delete process.env.WEAVE_EVAL_MOCK_RESPONSES

    expect(() =>
      executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "prompt" },
        },
        {
          kind: "model-response",
          provider: "openai",
          model: "gpt-5",
          input: "hello",
        },
        { mode: "local", directory: process.cwd() },
      ),
    ).toThrow("WEAVE_EVAL_MOCK_RESPONSES")
  })

  it("does not leak input text into provider metadata artifacts", () => {
    process.env.WEAVE_EVAL_MOCK_RESPONSES = JSON.stringify({
      "openai/gpt-5": "delegate to pattern",
    })

    const artifacts = executeModelResponse(
      {
        target: { kind: "builtin-agent-prompt", agent: "loom" },
        artifacts: { renderedPrompt: "prompt" },
      },
      {
        kind: "model-response",
        provider: "openai",
        model: "gpt-5",
        input: "Bearer sk-secret-token",
      },
      { mode: "local", directory: process.cwd() },
    )

    const serialized = JSON.stringify(artifacts)
    expect(serialized).not.toContain("sk-secret-token")
    expect(serialized).not.toContain("Bearer")
  })
})
