import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"

export type PluginContext = Parameters<Plugin>[0]
export type PluginInstance = Awaited<ReturnType<Plugin>>

export interface RuntimeFailoverModelRef {
  providerID: string
  modelID: string
}

export interface RuntimeFailoverPromptBody {
  parts: Array<Record<string, unknown>>
  agent?: string
  model?: RuntimeFailoverModelRef
  messageID?: string
  variant?: string
  system?: unknown
  tools?: unknown
  format?: unknown
}

export interface RuntimeFailoverClient {
  session: {
    promptAsync: (opts: { path: { id: string }; body: RuntimeFailoverPromptBody }) => Promise<unknown>
  }
}

export type PluginInterface = Required<
  Pick<
    PluginInstance,
    | "tool"
    | "config"
    | "chat.message"
    | "chat.params"
    | "chat.headers"
    | "event"
    | "tool.execute.before"
    | "tool.execute.after"
    | "command.execute.before"
    | "tool.definition"
    | "experimental.session.compacting"
  >
>

export type ToolsRecord = Record<string, ToolDefinition>
