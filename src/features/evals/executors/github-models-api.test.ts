import { describe, expect, it } from "bun:test"
import { callGitHubModels, GITHUB_MODELS_API_URL, DELAY_BETWEEN_CALLS_MS } from "./github-models-api"

describe("github-models-api", () => {
  it("exports the expected API URL constant", () => {
    expect(GITHUB_MODELS_API_URL).toBe("https://models.inference.ai.azure.com/chat/completions")
  })

  it("exports the expected delay constant", () => {
    expect(DELAY_BETWEEN_CALLS_MS).toBe(1000)
  })

  it("throws on non-200 API response", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () => new Response("Rate limit exceeded", { status: 429 }),
    })

    try {
      await expect(
        callGitHubModels("system", "user", "gpt-4o-mini", "fake-token"),
      ).rejects.toThrow("GitHub Models API error 429")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("throws on 401 unauthorized", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () => new Response("Unauthorized", { status: 401 }),
    })

    try {
      await expect(
        callGitHubModels("system", "user", "gpt-4o-mini", "bad-token"),
      ).rejects.toThrow("GitHub Models API error 401")
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
      const result = await callGitHubModels("system prompt", "user message", "gpt-4o-mini", "test-token")
      expect(result.content).toBe("I will delegate to thread.")
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("returns empty string when API response has no content", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: async () =>
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    })

    try {
      const result = await callGitHubModels("system", "user", "gpt-4o-mini", "test-token")
      expect(result.content).toBe("")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("sends correct request body to the API", async () => {
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

    try {
      await callGitHubModels("my system", "my user msg", "gpt-4o-mini", "tok123")
      expect(capturedBody).toEqual({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "my system" },
          { role: "user", content: "my user msg" },
        ],
        temperature: 0,
        max_tokens: 1024,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("sends authorization header with bearer token", async () => {
    const originalFetch = globalThis.fetch
    let capturedHeaders: Record<string, string> = {}

    Object.assign(globalThis, {
      fetch: async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>
        capturedHeaders = { ...headers }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    })

    try {
      await callGitHubModels("sys", "usr", "gpt-4o-mini", "ghp_mysecret")
      expect(capturedHeaders["Authorization"]).toBe("Bearer ghp_mysecret")
      expect(capturedHeaders["Content-Type"]).toBe("application/json")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
