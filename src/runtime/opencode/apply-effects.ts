import { getAgentDisplayName } from "../../shared/agent-display-names"
import { createSessionClient } from "../../infrastructure/opencode/session-client"
import type { PluginContext } from "../../plugin/types"
import type { SessionTracker } from "../../features/analytics"
import type { RuntimeEffect } from "./effects"

export async function applyRuntimeEffects(args: {
  effects: RuntimeEffect[]
  output?: { message?: Record<string, unknown>; parts?: Array<{ type: string; text?: string }> }
  client?: PluginContext["client"]
  tracker?: SessionTracker
  pausePlan?: () => void
  pauseWorkflow?: (reason: string) => void
}): Promise<void> {
  const { effects, output, client, tracker, pausePlan, pauseWorkflow } = args
  const sessionClient = client ? createSessionClient(client) : null

  for (const effect of effects) {
    switch (effect.type) {
      case "switchAgent": {
        if (output?.message) {
          output.message.agent = getAgentDisplayName(effect.agent)
        }
        break
      }
      case "appendPromptText": {
        if (output?.parts) {
          appendToTextParts(output.parts, effect.text, effect.separator ?? "\n\n---\n")
        }
        break
      }
      case "appendCommandOutput": {
        if (output?.parts) {
          output.parts.push({ type: "text", text: effect.text })
        }
        break
      }
      case "injectPromptAsync": {
        if (sessionClient) {
          await sessionClient.promptAsync({
            sessionId: effect.sessionId,
            parts: [{ type: "text", text: effect.text }],
            ...(effect.agent ? { agent: getAgentDisplayName(effect.agent) } : {}),
          })
        }
        break
      }
      case "restoreAgent": {
        if (sessionClient) {
          await sessionClient.restoreAgent({
            sessionId: effect.sessionId,
            agent: getAgentDisplayName(effect.agent),
          })
        }
        break
      }
      case "pauseExecution": {
        if (effect.target === "plan" || effect.target === "both") {
          pausePlan?.()
        }
        if (effect.target === "workflow" || effect.target === "both") {
          pauseWorkflow?.(effect.reason)
        }
        break
      }
      case "trackAnalytics": {
        if (!tracker) {
          break
        }
        const event = effect.event
        switch (event.kind) {
          case "setAgentName":
            tracker.setAgentName(event.sessionId, event.agent)
            break
          case "trackModel":
            tracker.trackModel(event.sessionId, event.modelId)
            break
          case "endSession":
            tracker.endSession(event.sessionId)
            break
          case "trackCost":
            tracker.trackCost(event.sessionId, event.cost)
            break
          case "trackTokenUsage":
            tracker.trackTokenUsage(event.sessionId, event.usage)
            break
          case "trackToolStart":
            tracker.trackToolStart(event.sessionId, event.tool, event.callId, event.agent)
            break
          case "trackToolEnd":
            tracker.trackToolEnd(event.sessionId, event.tool, event.callId, event.agent)
            break
        }
        break
      }
    }
  }
}

function appendToTextParts(parts: Array<{ type: string; text?: string }>, text: string, separator: string): void {
  const idx = parts.findIndex((part) => part.type === "text" && part.text)
  if (idx >= 0 && parts[idx].text) {
    parts[idx].text += `${separator}${text}`
    return
  }

  parts.push({ type: "text", text })
}
