import type { PluginInput } from "@opencode-ai/plugin"

export function makePluginContext(directory: string, client: unknown = {}): PluginInput {
  return {
    directory,
    client: client as PluginInput["client"],
    project: { root: directory },
    serverUrl: "http://localhost:3000",
  } as unknown as PluginInput
}

export function makeMockCtx(directory: string): PluginInput {
  return makePluginContext(directory)
}
