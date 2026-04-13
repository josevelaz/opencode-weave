import type { WeaveConfig } from "../config/schema"
import type { ResolvedContinuationConfig } from "../config/continuation"
import type { ContextWindowThresholds } from "./context-window-monitor"
import { createWriteGuardState, createWriteGuard } from "./write-existing-file-guard"
import { shouldApplyVariant, markApplied, markSessionCreated, clearSession } from "./first-message-variant"
import { processMessageForKeywords } from "./keyword-detector"
import { handleStartWork } from "./start-work-hook"
import { checkCompactionRecovery } from "./compaction-recovery"
import { checkContinuation } from "./work-continuation"
import { handleRunWorkflow, checkWorkflowContinuation } from "../features/workflow"
import { handleWorkflowCommand } from "../features/workflow"

export type CreatedHooks = ReturnType<typeof createHooks>

export function createHooks(args: {
  pluginConfig: WeaveConfig
  continuation: ResolvedContinuationConfig
  isHookEnabled: (hookName: string) => boolean
  directory: string
  analyticsEnabled?: boolean
}) {
  const { pluginConfig, continuation, isHookEnabled, directory, analyticsEnabled = false } = args

  const workflowDirs = pluginConfig.workflows?.directories

  const writeGuardState = createWriteGuardState()
  const writeGuard = createWriteGuard(writeGuardState)

  const contextWindowThresholds: ContextWindowThresholds = {
    warningPct: pluginConfig.experimental?.context_window_warning_threshold ?? 0.8,
    criticalPct: pluginConfig.experimental?.context_window_critical_threshold ?? 0.95,
  }

  return {
    contextWindowThresholds: isHookEnabled("context-window-monitor")
      ? contextWindowThresholds
      : null,

    rulesInjectorEnabled: isHookEnabled("rules-injector"),

    writeGuard: isHookEnabled("write-existing-file-guard") ? writeGuard : null,

    firstMessageVariant: isHookEnabled("first-message-variant")
      ? { shouldApplyVariant, markApplied, markSessionCreated, clearSession }
      : null,

    processMessageForKeywords: isHookEnabled("keyword-detector")
      ? processMessageForKeywords
      : null,

    patternMdOnlyEnabled: isHookEnabled("pattern-md-only"),

    startWork: isHookEnabled("start-work")
      ? (promptText: string, sessionId: string) =>
          handleStartWork({ promptText, sessionId, directory })
      : null,

    workContinuation: isHookEnabled("work-continuation")
      ? (sessionId: string) => checkContinuation({ sessionId, directory })
      : null,

    compactionRecovery: isHookEnabled("work-continuation")
      ? (sessionId: string, enabledAgents?: ReadonlySet<string>) => checkCompactionRecovery({ sessionId, directory, enabledAgents })
      : null,

    workflowStart: isHookEnabled("workflow")
      ? (promptText: string, sessionId: string) =>
          handleRunWorkflow({ promptText, sessionId, directory, workflowDirs })
      : null,

    workflowContinuation: isHookEnabled("workflow")
      ? (sessionId: string, lastAssistantMessage?: string, lastUserMessage?: string) =>
          checkWorkflowContinuation({ sessionId, directory, lastAssistantMessage, lastUserMessage, workflowDirs })
      : null,

    workflowCommand: isHookEnabled("workflow")
      ? (message: string, sessionId: string) => handleWorkflowCommand(message, directory, sessionId)
      : null,

    verificationReminderEnabled: isHookEnabled("verification-reminder"),

    todoDescriptionOverrideEnabled: isHookEnabled("todo-description-override"),

    compactionTodoPreserverEnabled: isHookEnabled("compaction-todo-preserver"),

    todoContinuationEnforcerEnabled: isHookEnabled("todo-continuation-enforcer"),

    continuation,

    analyticsEnabled,
  }
}
