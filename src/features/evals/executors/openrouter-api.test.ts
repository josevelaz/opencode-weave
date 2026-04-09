import { describe, expect, it } from "bun:test"
import { callOpenRouter, OPENROUTER_API_URL } from "./openrouter-api"

describe("openrouter-api", () => {
  it("exports the expected API URL constant", () => {
    expect(OPENROUTER_API_URL).toBe("https://openrouter.ai/api/v1/chat/completions")
  })

  it("throws on non-200 API response", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () => new Response("Insufficient credits", { status: 402 }),
    })

    try {
      await expect(callOpenRouter("system", "user", "openai/gpt-4o-mini", "fake-key")).rejects.toThrow(
        "OpenRouter API error 402",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("parses a valid API response", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "I will delegate to thread." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    })

    try {
      const result = await callOpenRouter("system prompt", "user message", "openai/gpt-4o-mini", "test-key")
      expect(result.content).toBe("I will delegate to thread.")
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("parses array content responses", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: [{ type: "text", text: "delegate" }, { type: "text", text: " now" }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    })

    try {
      const result = await callOpenRouter("system", "user", "anthropic/claude-3.5-sonnet", "test-key")
      expect(result.content).toBe("delegate now")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("sends correct request body and headers", async () => {
    const originalFetch = globalThis.fetch
    let capturedBody: unknown
    let capturedHeaders: Record<string, string> = {}

    Object.assign(globalThis, {
      fetch: async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        capturedHeaders = { ...(init?.headers as Record<string, string>) }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    })

    try {
      await callOpenRouter("my system", "my user msg", "anthropic/claude-3.5-sonnet", "or-key")
      expect(capturedBody).toEqual({
        model: "anthropic/claude-3.5-sonnet",
        messages: [
          { role: "system", content: "my system" },
          { role: "user", content: "my user msg" },
        ],
        temperature: 0,
        max_tokens: 1024,
        stream: false,
      })
      expect(capturedHeaders["Authorization"]).toBe("Bearer or-key")
      expect(capturedHeaders["Content-Type"]).toBe("application/json")
      expect(capturedHeaders["X-OpenRouter-Title"]).toBe("Weave Agent Evals")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
