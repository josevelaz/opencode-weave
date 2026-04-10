import type { PluginContext } from "../../plugin/types"

export interface SessionClient {
  promptAsync(input: { sessionId: string; parts: Array<{ type: "text"; text: string }>; agent?: string }): Promise<void>
  todo(sessionId: string): Promise<{ data?: unknown[] }>
}

export function createSessionClient(client: PluginContext["client"]): SessionClient {
  return {
    async promptAsync(input) {
      await client.session.promptAsync({
        path: { id: input.sessionId },
        body: {
          parts: input.parts,
          ...(input.agent ? { agent: input.agent } : {}),
        },
      })
    },
    async todo(sessionId) {
      return client.session.todo({ path: { id: sessionId } })
    },
  }
}
