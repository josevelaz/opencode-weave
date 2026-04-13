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

    expect(hooks).toHaveProperty("contextWindowThresholds")
    expect(hooks).toHaveProperty("writeGuard")
    expect(hooks).toHaveProperty("rulesInjectorEnabled")
    expect(hooks).toHaveProperty("firstMessageVariant")
    expect(hooks).toHaveProperty("processMessageForKeywords")
    expect(hooks).toHaveProperty("patternMdOnlyEnabled")
    expect(hooks).toHaveProperty("verificationReminderEnabled")
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

    expect(hooks.contextWindowThresholds).toBeNull()
  })

  it("disabled hooks return null for rules-injector", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: disableHook("rules-injector"),
      directory: "",
    })

    expect(hooks.rulesInjectorEnabled).toBe(false)
  })

  it("enabled hooks return non-null values", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    expect(hooks.contextWindowThresholds).not.toBeNull()
    expect(hooks.writeGuard).not.toBeNull()
    expect(hooks.rulesInjectorEnabled).toBe(true)
    expect(hooks.firstMessageVariant).not.toBeNull()
    expect(hooks.processMessageForKeywords).not.toBeNull()
    expect(hooks.patternMdOnlyEnabled).toBe(true)
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

    expect(hooks.contextWindowThresholds).toBeNull()
    expect(hooks.writeGuard).toBeNull()
    expect(hooks.rulesInjectorEnabled).toBe(false)
    expect(hooks.firstMessageVariant).toBeNull()
    expect(hooks.processMessageForKeywords).toBeNull()
    expect(hooks.patternMdOnlyEnabled).toBe(false)
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

  it("returns configured context-window thresholds when enabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    expect(hooks.contextWindowThresholds).toEqual({
      warningPct: 0.8,
      criticalPct: 0.95,
    })
  })

  it("verificationReminderEnabled is false when verification-reminder disabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: disableHook("verification-reminder"),
      directory: "",
    })
    expect(hooks.verificationReminderEnabled).toBe(false)
  })

  it("verificationReminderEnabled is true when enabled", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })
    expect(hooks.verificationReminderEnabled).toBe(true)
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

    expect(hooks.contextWindowThresholds).toEqual({
      warningPct: 0.6,
      criticalPct: 0.9,
    })
  })

  it("default thresholds (80%/95%) used when not configured", () => {
    const hooks = createHooks({
      pluginConfig: baseConfig,
      continuation: DEFAULT_CONTINUATION_CONFIG,
      isHookEnabled: allEnabled,
      directory: "",
    })

    expect(hooks.contextWindowThresholds).toEqual({
      warningPct: 0.8,
      criticalPct: 0.95,
    })
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

    expect(hooks.contextWindowThresholds).toEqual({
      warningPct: 0.6,
      criticalPct: 0.9,
    })
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
    it("todoDescriptionOverrideEnabled is true when enabled", () => {
      const hooks = createHooks({
        pluginConfig: baseConfig,
        continuation: DEFAULT_CONTINUATION_CONFIG,
        isHookEnabled: allEnabled,
        directory: "",
      })
      expect(hooks.todoDescriptionOverrideEnabled).toBe(true)
    })

    it("todoDescriptionOverrideEnabled is false when disabled", () => {
      const hooks = createHooks({
        pluginConfig: baseConfig,
        continuation: DEFAULT_CONTINUATION_CONFIG,
        isHookEnabled: disableHook("todo-description-override"),
        directory: "",
      })
      expect(hooks.todoDescriptionOverrideEnabled).toBe(false)
    })
  })

  describe("policy enablement metadata", () => {
    it("patternMdOnlyEnabled is true when enabled", () => {
      const hooks = createHooks({
        pluginConfig: baseConfig,
        continuation: DEFAULT_CONTINUATION_CONFIG,
        isHookEnabled: allEnabled,
        directory: "",
      })

      expect(hooks.patternMdOnlyEnabled).toBe(true)
    })

    it("verificationReminderEnabled follows hook enablement", () => {
      const enabled = createHooks({
        pluginConfig: baseConfig,
        continuation: DEFAULT_CONTINUATION_CONFIG,
        isHookEnabled: allEnabled,
        directory: "",
      })
      const disabled = createHooks({
        pluginConfig: baseConfig,
        continuation: DEFAULT_CONTINUATION_CONFIG,
        isHookEnabled: disableHook("verification-reminder"),
        directory: "",
      })

      expect(enabled.verificationReminderEnabled).toBe(true)
      expect(disabled.verificationReminderEnabled).toBe(false)
    })

    it("does not expose legacy executable policy callbacks", () => {
      const hooks = createHooks({
        pluginConfig: baseConfig,
        continuation: DEFAULT_CONTINUATION_CONFIG,
        isHookEnabled: allEnabled,
        directory: "",
      })

      expect(hooks).not.toHaveProperty("checkContextWindow")
      expect(hooks).not.toHaveProperty("shouldInjectRules")
      expect(hooks).not.toHaveProperty("getRulesForFile")
      expect(hooks).not.toHaveProperty("patternMdOnly")
      expect(hooks).not.toHaveProperty("verificationReminder")
      expect(hooks).not.toHaveProperty("todoDescriptionOverride")
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
