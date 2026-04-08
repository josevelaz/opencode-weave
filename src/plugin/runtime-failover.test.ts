import { describe, expect, it } from "bun:test"
import { classifyRuntimeFailoverError, createRuntimeFailoverCoordinator } from "./runtime-failover"
import type { RuntimeModelPlanRegistry } from "../agents/types"

describe("classifyRuntimeFailoverError", () => {
  it("retries on retryable HTTP statuses", () => {
    expect(classifyRuntimeFailoverError({ name: "APIError", data: { statusCode: 429 } })).toEqual({
      action: "retry",
      reason: "status:429",
    })

    expect(classifyRuntimeFailoverError({ name: "APIError", data: { statusCode: 503 } })).toEqual({
      action: "retry",
      reason: "status:503",
    })
  })

  it("hard-fails on auth and request statuses", () => {
    expect(classifyRuntimeFailoverError({ name: "ProviderAuthError", message: "bad key" })).toEqual({
      action: "hard-fail",
      reason: "provider-auth",
    })

    expect(classifyRuntimeFailoverError({ name: "APIError", data: { statusCode: 401 } })).toEqual({
      action: "hard-fail",
      reason: "status:401",
    })
  })

  it("uses provider retryable flags before message heuristics", () => {
    expect(classifyRuntimeFailoverError({
      name: "APIError",
      data: { isRetryable: true, message: "backend overloaded" },
    })).toEqual({
      action: "retry",
      reason: "provider-retryable",
    })
  })

  it("falls back to retryable message/code heuristics", () => {
    expect(classifyRuntimeFailoverError({
      name: "UnknownError",
      message: "socket hang up while contacting provider",
    })).toEqual({
      action: "retry",
      reason: "term:socket hang up",
    })

    expect(classifyRuntimeFailoverError({
      name: "APIError",
      code: "rate_limit_exceeded",
    })).toEqual({
      action: "retry",
      reason: "term:rate_limit_exceeded",
    })
  })

  it("hard-fails on context and unsupported-model heuristics", () => {
    expect(classifyRuntimeFailoverError({
      name: "APIError",
      message: "maximum context length exceeded",
    })).toEqual({
      action: "hard-fail",
      reason: "term:context length",
    })

    expect(classifyRuntimeFailoverError({
      name: "APIError",
      data: { message: "unsupported model requested" },
    })).toEqual({
      action: "hard-fail",
      reason: "term:unsupported model",
    })
  })

  it("hard-fails user-aborted errors", () => {
    expect(classifyRuntimeFailoverError({ name: "MessageAbortedError" })).toEqual({
      action: "hard-fail",
      reason: "user-aborted",
    })
  })

  it("ignores missing errors", () => {
    expect(classifyRuntimeFailoverError(undefined)).toEqual({
      action: "ignore",
      reason: "missing-error",
    })
  })
})

describe("createRuntimeFailoverCoordinator", () => {
  function makePlans(): RuntimeModelPlanRegistry {
    return {
      loom: {
        agentName: "loom",
        selectedModel: "github-copilot/claude-opus-4.6",
        orderedModels: [
          "github-copilot/claude-opus-4.6",
          "openai/gpt-5",
          "openai/gpt-5",
          "anthropic/claude-sonnet-4",
        ],
        fallbackModels: ["openai/gpt-5", "anthropic/claude-sonnet-4"],
        resolutionSource: "fallback-chain",
      },
      "Loom (Main Orchestrator)": {
        agentName: "loom",
        selectedModel: "github-copilot/claude-opus-4.6",
        orderedModels: [
          "github-copilot/claude-opus-4.6",
          "openai/gpt-5",
          "openai/gpt-5",
          "anthropic/claude-sonnet-4",
        ],
        fallbackModels: ["openai/gpt-5", "anthropic/claude-sonnet-4"],
        resolutionSource: "fallback-chain",
      },
    }
  }

  it("traverses the chain once, dedupes repeated models, and stops when exhausted", async () => {
    const promptAsyncCalls: Array<{ path: { id: string }; body: { model?: { providerID: string; modelID: string } } }> = []
    const coordinator = createRuntimeFailoverCoordinator({
      runtimeModelPlans: makePlans(),
      client: {
        session: {
          promptAsync: async (opts) => {
            promptAsyncCalls.push(opts)
          },
        },
      },
    })

    coordinator.captureChatMessage({
      sessionId: "sess-1",
      agent: "Loom (Main Orchestrator)",
      model: { providerID: "github-copilot", modelID: "claude-opus-4.6" },
      messageId: "msg-1",
      parts: [{ type: "text", text: "hello" }],
    })
    coordinator.captureResolvedModel({ sessionId: "sess-1", agent: "Loom (Main Orchestrator)", model: { id: "github-copilot/claude-opus-4.6" } })

    const firstReplay = await coordinator.handleSessionError({
      sessionId: "sess-1",
      error: { name: "APIError", data: { statusCode: 429 } },
    })
    expect(firstReplay.replayed).toBe(true)
    expect(promptAsyncCalls.length).toBe(1)
    expect(promptAsyncCalls[0].body.model).toEqual({ providerID: "openai", modelID: "gpt-5" })

    const duplicateError = await coordinator.handleSessionError({
      sessionId: "sess-1",
      error: { name: "APIError", data: { statusCode: 429 } },
    })
    expect(duplicateError.replayed).toBe(false)
    expect(promptAsyncCalls.length).toBe(1)

    expect(coordinator.markReplayConsumed("sess-1")).toBe(true)
    coordinator.captureChatMessage({
      sessionId: "sess-1",
      agent: "Loom (Main Orchestrator)",
      model: { providerID: "openai", modelID: "gpt-5" },
      messageId: "msg-1",
      parts: [{ type: "text", text: "hello" }],
    })
    coordinator.captureResolvedModel({ sessionId: "sess-1", agent: "Loom (Main Orchestrator)", model: { id: "openai/gpt-5" } })

    const secondReplay = await coordinator.handleSessionError({
      sessionId: "sess-1",
      error: { name: "APIError", data: { statusCode: 503 } },
    })
    expect(secondReplay.replayed).toBe(true)
    expect(promptAsyncCalls.length).toBe(2)
    expect(promptAsyncCalls[1].body.model).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-4" })

    expect(coordinator.markReplayConsumed("sess-1")).toBe(true)
    coordinator.captureChatMessage({
      sessionId: "sess-1",
      agent: "Loom (Main Orchestrator)",
      model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
      messageId: "msg-1",
      parts: [{ type: "text", text: "hello" }],
    })
    coordinator.captureResolvedModel({ sessionId: "sess-1", agent: "Loom (Main Orchestrator)", model: { id: "anthropic/claude-sonnet-4" } })

    const exhausted = await coordinator.handleSessionError({
      sessionId: "sess-1",
      error: { name: "APIError", data: { statusCode: 504 } },
    })
    expect(exhausted.replayed).toBe(false)
    expect(promptAsyncCalls.length).toBe(2)
  })

  it("marks hard-fail attempts terminal and suppresses later replay", async () => {
    const promptAsyncCalls: unknown[] = []
    const coordinator = createRuntimeFailoverCoordinator({
      runtimeModelPlans: makePlans(),
      client: {
        session: {
          promptAsync: async (opts) => {
            promptAsyncCalls.push(opts)
          },
        },
      },
    })

    coordinator.captureChatMessage({
      sessionId: "sess-2",
      agent: "Loom (Main Orchestrator)",
      model: { providerID: "github-copilot", modelID: "claude-opus-4.6" },
      parts: [{ type: "text", text: "hello" }],
    })
    coordinator.captureResolvedModel({ sessionId: "sess-2", agent: "Loom (Main Orchestrator)", model: { id: "github-copilot/claude-opus-4.6" } })

    const hardFail = await coordinator.handleSessionError({
      sessionId: "sess-2",
      error: { name: "APIError", data: { statusCode: 401 } },
    })
    expect(hardFail.replayed).toBe(false)

    const laterRetryable = await coordinator.handleSessionError({
      sessionId: "sess-2",
      error: { name: "APIError", data: { statusCode: 429 } },
    })
    expect(laterRetryable.replayed).toBe(false)
    expect(promptAsyncCalls.length).toBe(0)
  })

  it("treats idle-finalized attempts as terminal success", async () => {
    const promptAsyncCalls: unknown[] = []
    const coordinator = createRuntimeFailoverCoordinator({
      runtimeModelPlans: makePlans(),
      client: {
        session: {
          promptAsync: async (opts) => {
            promptAsyncCalls.push(opts)
          },
        },
      },
    })

    coordinator.captureChatMessage({
      sessionId: "sess-3",
      agent: "Loom (Main Orchestrator)",
      model: { providerID: "github-copilot", modelID: "claude-opus-4.6" },
      parts: [{ type: "text", text: "hello" }],
    })
    coordinator.captureResolvedModel({ sessionId: "sess-3", agent: "Loom (Main Orchestrator)", model: { id: "github-copilot/claude-opus-4.6" } })
    coordinator.markAttemptSucceeded("sess-3")

    const afterSuccess = await coordinator.handleSessionError({
      sessionId: "sess-3",
      error: { name: "APIError", data: { statusCode: 429 } },
    })
    expect(afterSuccess.replayed).toBe(false)
    expect(promptAsyncCalls.length).toBe(0)
  })
})
