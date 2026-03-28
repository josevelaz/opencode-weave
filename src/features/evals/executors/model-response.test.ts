import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { executeModelResponse } from "./model-response"

describe("executeModelResponse", () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedEnv.GITHUB_TOKEN = process.env.GITHUB_TOKEN
  })

  afterEach(() => {
    if (savedEnv.GITHUB_TOKEN !== undefined) {
      process.env.GITHUB_TOKEN = savedEnv.GITHUB_TOKEN
    } else {
      delete process.env.GITHUB_TOKEN
    }
  })

  it("throws when GITHUB_TOKEN is missing", async () => {
    delete process.env.GITHUB_TOKEN

    expect(
      executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "system prompt" },
        },
        {
          kind: "model-response",
          provider: "github-models",
          model: "gpt-4o-mini",
          input: "test input",
        },
        { mode: "local", directory: process.cwd() },
      ),
    ).rejects.toThrow("GITHUB_TOKEN")
  })

  it("calls GitHub Models API and returns model output with sanitized metadata", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "I will delegate to thread for exploration." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    })
    process.env.GITHUB_TOKEN = "test-token"

    try {
      const artifacts = await executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "system prompt" },
        },
        {
          kind: "model-response",
          provider: "github-models",
          model: "gpt-4o-mini",
          input: "find auth files",
        },
        { mode: "local", directory: process.cwd() },
      )

      expect(artifacts.modelOutput).toBe("I will delegate to thread for exploration.")
      expect((artifacts.baselineDelta as { provider: string }).provider).toBe("g***s")
      expect((artifacts.baselineDelta as { model: string }).model).toBe("gpt-4o-mini")
      expect((artifacts.baselineDelta as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("does not leak input text into provider metadata artifacts", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "delegate to pattern" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    })
    process.env.GITHUB_TOKEN = "test-token"

    try {
      const artifacts = await executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "prompt" },
        },
        {
          kind: "model-response",
          provider: "openai",
          model: "gpt-4o-mini",
          input: "Bearer sk-secret-token",
        },
        { mode: "local", directory: process.cwd() },
      )

      const serialized = JSON.stringify(artifacts)
      expect(serialized).not.toContain("sk-secret-token")
      expect(serialized).not.toContain("Bearer")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("passes executor.model directly to the API (no model name resolution)", async () => {
    const originalFetch = globalThis.fetch
    let capturedBody: unknown

    Object.assign(globalThis, {
      fetch: async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    })
    process.env.GITHUB_TOKEN = "test-token"

    try {
      await executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "system" },
        },
        {
          kind: "model-response",
          provider: "github-models",
          model: "gpt-4o-mini",
          input: "test",
        },
        { mode: "local", directory: process.cwd() },
      )

      expect((capturedBody as { model: string }).model).toBe("gpt-4o-mini")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("redacts short provider names completely", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    })
    process.env.GITHUB_TOKEN = "test-token"

    try {
      const artifacts = await executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "prompt" },
        },
        {
          kind: "model-response",
          provider: "ai",
          model: "gpt-4o-mini",
          input: "test",
        },
        { mode: "local", directory: process.cwd() },
      )

      expect((artifacts.baselineDelta as { provider: string }).provider).toBe("***")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
