import { describe, it, expect, beforeEach } from "bun:test"
import { createHooks } from "./create-hooks"
import { clearAll } from "./first-message-variant"
import type { WeaveConfig } from "../config/schema"
import { DEFAULT_CONTINUATION_CONFIG } from "../config/continuation"

const baseConfig: WeaveConfig = {}

function allEnabled(_hookName: string): boolean {
  return true
}

function noneEnabled(_hookName: string): boolean {
  return false
}

function disableHook(disabled: string) {
  return (hookName: string) => hookName !== disabled
}

beforeEach(() => {
  clearAll()
})

describe("createHooks", () => {
  it("returns all hook keys when all enabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    expect(hooks).toHaveProperty("checkContextWindow")
    expect(hooks).toHaveProperty("writeGuard")
    expect(hooks).toHaveProperty("shouldInjectRules")
    expect(hooks).toHaveProperty("getRulesForFile")
    expect(hooks).toHaveProperty("firstMessageVariant")
    expect(hooks).toHaveProperty("processMessageForKeywords")
    expect(hooks).toHaveProperty("verificationReminder")
    expect(hooks).toHaveProperty("todoDescriptionOverride")
    expect(hooks).toHaveProperty("compactionTodoPreserverEnabled")
    expect(hooks).toHaveProperty("todoContinuationEnforcerEnabled")
    expect(hooks).toHaveProperty("continuation")
  })

  it("disabled hooks return null for context-window-monitor", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: disableHook("context-window-monitor"),
      directory: "",
    })

    expect(hooks.checkContextWindow).toBeNull()
  })

  it("disabled hooks return null for rules-injector", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: disableHook("rules-injector"),
      directory: "",
    })

    expect(hooks.shouldInjectRules).toBeNull()
    expect(hooks.getRulesForFile).toBeNull()
  })

  it("enabled hooks return non-null values", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    expect(hooks.checkContextWindow).not.toBeNull()
    expect(hooks.writeGuard).not.toBeNull()
    expect(hooks.shouldInjectRules).not.toBeNull()
    expect(hooks.getRulesForFile).not.toBeNull()
    expect(hooks.firstMessageVariant).not.toBeNull()
    expect(hooks.processMessageForKeywords).not.toBeNull()
  })

  it("writeGuard is null when write-existing-file-guard disabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: disableHook("write-existing-file-guard"),
      directory: "",
    })

    expect(hooks.writeGuard).toBeNull()
  })

  it("all hooks null when none enabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: noneEnabled,
      directory: "",
    })

    expect(hooks.checkContextWindow).toBeNull()
    expect(hooks.writeGuard).toBeNull()
    expect(hooks.shouldInjectRules).toBeNull()
    expect(hooks.getRulesForFile).toBeNull()
    expect(hooks.firstMessageVariant).toBeNull()
    expect(hooks.processMessageForKeywords).toBeNull()
  })

  it("firstMessageVariant is null when first-message-variant disabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: disableHook("first-message-variant"),
      directory: "",
    })

    expect(hooks.firstMessageVariant).toBeNull()
  })

  it("checkContextWindow calls through correctly when enabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    const result = hooks.checkContextWindow!({
      sessionId: "test-session",
      usedTokens: 100,
      maxTokens: 1000,
    })

    expect(result.action).toBe("none")
    expect(result.usagePct).toBeCloseTo(0.1)
  })

  it("verificationReminder exists in returned hooks when all enabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })
    expect(hooks).toHaveProperty("verificationReminder")
  })

  it("verificationReminder is null when verification-reminder hook disabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: disableHook("verification-reminder"),
      directory: "",
    })
    expect(hooks.verificationReminder).toBeNull()
  })

  it("verificationReminder is non-null when enabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })
    expect(hooks.verificationReminder).not.toBeNull()
  })

  it("custom context_window_warning_threshold is applied from config", () => {
    const configWithCustomThresholds: WeaveConfig = {
      experimental: {
        context_window_warning_threshold: 0.6,
        context_window_critical_threshold: 0.9,
      },
    }
    const hooks = createHooks({
      pluginConfig: configWithCustomThresholds,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    // 65% usage — below default 80% but above custom 60% → should warn with custom config
    const result = hooks.checkContextWindow!({
      sessionId: "test-session",
      usedTokens: 65_000,
      maxTokens: 100_000,
    })
    expect(result.action).toBe("warn")
  })

  it("default thresholds (80%/95%) used when not configured", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    // 65% usage — below default 80% → should return none
    const result = hooks.checkContextWindow!({
      sessionId: "test-session",
      usedTokens: 65_000,
      maxTokens: 100_000,
    })
    expect(result.action).toBe("none")
  })

  it("custom critical threshold triggers recover action", () => {
    const configWithCustomThresholds: WeaveConfig = {
      experimental: {
        context_window_warning_threshold: 0.6,
        context_window_critical_threshold: 0.9,
      },
    }
    const hooks = createHooks({
      pluginConfig: configWithCustomThresholds,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    // 92% usage — above custom 90% critical threshold → should recover
    const result = hooks.checkContextWindow!({
      sessionId: "test-session",
      usedTokens: 92_000,
      maxTokens: 100_000,
    })
    expect(result.action).toBe("recover")
  })

  it("analyticsEnabled defaults to false when not passed", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })
    expect(hooks.analyticsEnabled).toBe(false)
  })

  it("analyticsEnabled is true when explicitly passed", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
      analyticsEnabled: true,
    })
    expect(hooks.analyticsEnabled).toBe(true)
  })

  it("analyticsEnabled is false even when all hooks enabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })
    expect(hooks.analyticsEnabled).toBe(false)
  })

  describe("todo-description-override hook", () => {
    it("todoDescriptionOverride is non-null when enabled", () => {
        const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: allEnabled,
          directory: "",
        })
      expect(hooks.todoDescriptionOverride).not.toBeNull()
    })

    it("todoDescriptionOverride is null when disabled", () => {
      const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: disableHook("todo-description-override"),
          directory: "",
      })
      expect(hooks.todoDescriptionOverride).toBeNull()
    })

    it("todoDescriptionOverride when enabled mutates description for todowrite", () => {
        const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: allEnabled,
          directory: "",
        })
      const output = { description: "original", parameters: {} }
      hooks.todoDescriptionOverride!({ toolID: "todowrite" }, output)
      expect(output.description).not.toBe("original")
    })
  })

  describe("compaction-todo-preserver enablement", () => {
    it("compactionTodoPreserverEnabled is true when enabled", () => {
        const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: allEnabled,
          directory: "",
        })
      expect(hooks.compactionTodoPreserverEnabled).toBe(true)
    })

    it("compactionTodoPreserverEnabled is false when disabled", () => {
      const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: disableHook("compaction-todo-preserver"),
          directory: "",
      })
      expect(hooks.compactionTodoPreserverEnabled).toBe(false)
    })

    it("compactionTodoPreserverEnabled is false when all hooks disabled", () => {
        const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: noneEnabled,
          directory: "",
        })
      expect(hooks.compactionTodoPreserverEnabled).toBe(false)
    })
  })

  describe("todo-continuation-enforcer enablement", () => {
    it("todoContinuationEnforcerEnabled is true when enabled", () => {
        const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: allEnabled,
          directory: "",
        })
      expect(hooks.todoContinuationEnforcerEnabled).toBe(true)
    })

    it("todoContinuationEnforcerEnabled is false when disabled", () => {
      const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: disableHook("todo-continuation-enforcer"),
          directory: "",
      })
      expect(hooks.todoContinuationEnforcerEnabled).toBe(false)
    })

    it("todoContinuationEnforcerEnabled is false when all hooks disabled", () => {
        const hooks = createHooks({
          pluginConfig: baseConfig,
          continuation: DEFAULT_CONTINUATION_CONFIG,
          isHookEnabled: noneEnabled,
          directory: "",
        })
        expect(hooks.todoContinuationEnforcerEnabled).toBe(false)
      })
    })

  it("returns the provided resolved continuation config", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: {
        recovery: { compaction: false },
        idle: { enabled: true, work: true, workflow: false, todo_prompt: true },
      },
      isHookEnabled: allEnabled,
      directory: "",
    })

    expect(hooks.continuation).toEqual({
      recovery: { compaction: false },
      idle: { enabled: true, work: true, workflow: false, todo_prompt: true },
    })
  })
})
