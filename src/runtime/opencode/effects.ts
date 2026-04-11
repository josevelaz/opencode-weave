export type RuntimeEffect =
  | SwitchAgentEffect
  | RestoreAgentEffect
  | AppendPromptTextEffect
  | InjectPromptAsyncEffect
  | PauseExecutionEffect
  | TrackAnalyticsEffect
  | AppendCommandOutputEffect

export interface SwitchAgentEffect {
  type: "switchAgent"
  agent: string
}

export interface RestoreAgentEffect {
  type: "restoreAgent"
  sessionId: string
  agent: string
}

export interface AppendPromptTextEffect {
  type: "appendPromptText"
  text: string
  separator?: string
}

export interface InjectPromptAsyncEffect {
  type: "injectPromptAsync"
  sessionId: string
  text: string
  agent?: string | null
}

export interface PauseExecutionEffect {
  type: "pauseExecution"
  target: "plan" | "workflow" | "both" | "none"
  reason: string
  sessionId?: string
}

export interface TrackAnalyticsEffect {
  type: "trackAnalytics"
  event:
    | { kind: "setAgentName"; sessionId: string; agent: string }
    | { kind: "trackModel"; sessionId: string; modelId: string }
    | { kind: "endSession"; sessionId: string }
    | { kind: "trackCost"; sessionId: string; cost: number }
    | {
        kind: "trackTokenUsage"
        sessionId: string
        usage: { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }
      }
    | { kind: "trackToolStart"; sessionId: string; tool: string; callId: string; agent?: string }
    | { kind: "trackToolEnd"; sessionId: string; tool: string; callId: string; agent?: string }
}

export interface AppendCommandOutputEffect {
  type: "appendCommandOutput"
  text: string
}
