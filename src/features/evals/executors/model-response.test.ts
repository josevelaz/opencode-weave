import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { executeModelResponse } from "./model-response"

describe("executeModelResponse", () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedEnv.GITHUB_TOKEN = process.env.GITHUB_TOKEN
    savedEnv.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  })

  afterEach(() => {
    if (savedEnv.GITHUB_TOKEN !== undefined) {
      process.env.GITHUB_TOKEN = savedEnv.GITHUB_TOKEN
    } else {
      delete process.env.GITHUB_TOKEN
    }

    if (savedEnv.OPENROUTER_API_KEY !== undefined) {
      process.env.OPENROUTER_API_KEY = savedEnv.OPENROUTER_API_KEY
    } else {
      delete process.env.OPENROUTER_API_KEY
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
    process.env.OPENROUTER_API_KEY = "test-key"

    try {
      const artifacts = await executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "prompt" },
        },
        {
          kind: "model-response",
          provider: "openrouter",
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

  it("throws when OPENROUTER_API_KEY is missing", async () => {
    delete process.env.OPENROUTER_API_KEY

    expect(
      executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "system prompt" },
        },
        {
          kind: "model-response",
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          input: "test input",
        },
        { mode: "local", directory: process.cwd() },
      ),
    ).rejects.toThrow("OPENROUTER_API_KEY")
  })

  it("calls OpenRouter when provider is openrouter", async () => {
    const originalFetch = globalThis.fetch
    let capturedUrl: string | undefined

    Object.assign(globalThis, {
      fetch: async (url: string | URL | Request) => {
        capturedUrl = String(url)
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Use thread for repo exploration." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    })
    process.env.OPENROUTER_API_KEY = "test-key"

    try {
      const artifacts = await executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "system prompt" },
        },
        {
          kind: "model-response",
          provider: "openrouter",
          model: "anthropic/claude-3.5-sonnet",
          input: "find auth files",
        },
        { mode: "local", directory: process.cwd() },
      )

      expect(capturedUrl).toBe("https://openrouter.ai/api/v1/chat/completions")
      expect(artifacts.modelOutput).toBe("Use thread for repo exploration.")
      expect((artifacts.baselineDelta as { provider: string }).provider).toBe("o***r")
      expect((artifacts.baselineDelta as { model: string }).model).toBe("anthropic/claude-3.5-sonnet")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("uses provider override instead of executor provider", async () => {
    const originalFetch = globalThis.fetch
    let capturedHeaders: Record<string, string> = {}

    Object.assign(globalThis, {
      fetch: async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = { ...(init?.headers as Record<string, string>) }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    })
    process.env.OPENROUTER_API_KEY = "override-key"

    try {
      const artifacts = await executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "prompt" },
        },
        {
          kind: "model-response",
          provider: "github-models",
          model: "anthropic/claude-3.5-sonnet",
          input: "test",
        },
        { mode: "local", directory: process.cwd(), providerOverride: "openrouter" },
      )

      expect(capturedHeaders["Authorization"]).toBe("Bearer override-key")
      expect((artifacts.baselineDelta as { provider: string }).provider).toBe("o***r")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("throws on unsupported provider override", async () => {
    await expect(
      executeModelResponse(
        {
          target: { kind: "builtin-agent-prompt", agent: "loom" },
          artifacts: { renderedPrompt: "prompt" },
        },
        {
          kind: "model-response",
          provider: "github-models",
          model: "gpt-4o-mini",
          input: "test",
        },
        { mode: "local", directory: process.cwd(), providerOverride: "ai" },
      ),
    ).rejects.toThrow("does not support provider: ai")
  })
})
