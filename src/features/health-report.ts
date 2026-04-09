import type { WeaveConfig } from "../config/schema"
import type { ConfigLoadResult, ConfigDiagnostic } from "../config/loader"
import { resolveContinuationConfig } from "../config/continuation"
import { getAgentConfigKey } from "../shared/agent-display-names"

/**
 * Generate a human-readable health report from the config load result.
 * Surfaced via the /weave-health command so the user can diagnose
 * config issues directly in the TUI.
 */
export function generateHealthReport(
  loadResult: ConfigLoadResult | null,
  agents: Record<string, unknown>,
): string {
  if (!loadResult) {
    return "⚠ No config load result available — Weave may not have initialized properly."
  }

  const lines: string[] = []
  const { config, loadedFiles, diagnostics } = loadResult

  // ── Status ──
  const hasIssues = diagnostics.length > 0
  lines.push(hasIssues ? "## ⚠ Weave Config Health: Issues Found" : "## ✅ Weave Config Health: OK")
  lines.push("")

  // ── Config files ──
  lines.push("### Config Files")
  if (loadedFiles.length === 0) {
    lines.push("No config files found (using defaults)")
  } else {
    for (const f of loadedFiles) {
      lines.push(`- \`${f}\``)
    }
  }
  lines.push("")

  // ── Diagnostics ──
  if (diagnostics.length > 0) {
    lines.push("### Validation Issues")
    lines.push("")
    for (const d of diagnostics) {
      const icon = d.level === "error" ? "🔴" : "🟡"
      lines.push(`${icon} **${d.section}**: ${d.message}`)
      if (d.fields?.length) {
        for (const f of d.fields) {
          const fieldLabel = f.path || "(root)"
          lines.push(`  - \`${fieldLabel}\`: ${f.message}`)
        }
      }
      lines.push("")
    }
    lines.push("Fix the issues above in your config file and restart opencode.")
    lines.push("")
  }

  // ── Agents ──
  lines.push("### Loaded Agents")
  const builtinKeys = new Set(["loom", "tapestry", "shuttle", "pattern", "thread", "spindle", "warp", "weft"])
  const agentNames = Object.keys(agents)
  const builtinAgents = agentNames.filter((n) => builtinKeys.has(getAgentConfigKey(n)))
  const customAgents = agentNames.filter((n) => !builtinKeys.has(getAgentConfigKey(n)))

  lines.push(`- Builtin: ${builtinAgents.length}/8 (${builtinAgents.join(", ")})`)
  if (customAgents.length > 0) {
    lines.push(`- Custom: ${customAgents.length} (${customAgents.join(", ")})`)
  } else {
    lines.push("- Custom: 0")
  }
  lines.push("")

  // ── Custom agents config ──
  if (config.custom_agents && Object.keys(config.custom_agents).length > 0) {
    lines.push("### Custom Agent Config")
    for (const [name, agentConfig] of Object.entries(config.custom_agents)) {
      const mode = agentConfig.mode ?? "subagent"
      const model = agentConfig.model ?? "(default)"
      lines.push(`- **${agentConfig.display_name ?? name}** — mode: ${mode}, model: ${model}`)
    }
    lines.push("")
  }

  // ── Disabled ──
  const disabled = config.disabled_agents ?? []
  if (disabled.length > 0) {
    lines.push(`### Disabled Agents: ${disabled.join(", ")}`)
    lines.push("")
  }

  // ── Continuation behavior ──
  lines.push("### Continuation Behavior")
  const continuation = resolveContinuationConfig(config.continuation)
  const disabledHooks = new Set(config.disabled_hooks ?? [])
  lines.push(`- Compaction recovery prompt: ${describeContinuationState({
    enabled: continuation.recovery.compaction,
    hookDisabled: disabledHooks.has("work-continuation"),
    enabledReason: continuation.recovery.compaction ? "enabled" : "disabled by config",
    disabledReason: "disabled by config",
    hookReason: "disabled by hook: work-continuation",
    defaultReason: "enabled",
  })}`)
  lines.push(`- Idle work prompts: ${describeContinuationState({
    enabled: continuation.idle.work,
    hookDisabled: disabledHooks.has("work-continuation"),
    enabledReason: "enabled",
    disabledReason: "disabled by config/default",
    hookReason: "disabled by hook: work-continuation",
    defaultReason: "disabled by default",
  })}`)
  lines.push(`- Idle workflow prompts: ${describeContinuationState({
    enabled: continuation.idle.workflow,
    hookDisabled: disabledHooks.has("workflow"),
    enabledReason: "enabled",
    disabledReason: "disabled by config/default",
    hookReason: "disabled by hook: workflow",
    defaultReason: "disabled by default",
  })}`)
  lines.push(`- Idle todo fallback prompt: ${describeContinuationState({
    enabled: continuation.idle.todo_prompt,
    hookDisabled: disabledHooks.has("todo-continuation-enforcer"),
    enabledReason: "enabled",
    disabledReason: "disabled by config/default",
    hookReason: "disabled by hook: todo-continuation-enforcer",
    defaultReason: "disabled by default",
  })}`)
  lines.push("- Manual resume remains available via `/start-work` and `/run-workflow`.")
  lines.push("")

  // ── Log location hint ──
  lines.push("### Logs")
  lines.push("Detailed logs: `~/.local/share/opencode/log/` (grep for `service=weave`)")
  lines.push("Real-time: `opencode --print-logs --log-level WARN`")

  return lines.join("\n")
}

function describeContinuationState(input: {
  enabled: boolean
  hookDisabled: boolean
  enabledReason: string
  disabledReason: string
  hookReason: string
  defaultReason: string
}): string {
  if (input.hookDisabled) {
    return input.hookReason
  }

  if (input.enabled) {
    return input.enabledReason
  }

  return input.disabledReason === "disabled by config/default"
    ? input.defaultReason
    : input.disabledReason
}
