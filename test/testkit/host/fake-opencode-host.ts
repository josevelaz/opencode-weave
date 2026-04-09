import WeavePlugin from "../../../src/index"
import { BUILTIN_COMMANDS } from "../../../src/features/builtin-commands/commands"
import type { PluginInterface } from "../../../src/plugin/types"
import { getAgentDisplayName } from "../../../src/shared/agent-display-names"
import { makePluginContext } from "../plugin-context"
import { FakePluginClient } from "./fake-plugin-client"

export interface HostOutputPart {
  type: string
  text?: string
}

export interface HostOutput {
  message: Record<string, unknown>
  parts: HostOutputPart[]
}

export interface MessageUpdatedEventInfo {
  role?: string
  sessionID?: string
  cost?: number
  tokens?: {
    input?: number
    output?: number
    reasoning?: number
    cache?: { read?: number; write?: number }
  }
}

export interface ChatParamsInput {
  sessionID: string
  agent?: string
  modelID?: string
  contextLimit?: number
}

export interface ToolExecutionInput {
  sessionID: string
  tool: string
  callID: string
  args?: Record<string, unknown>
}

export class FakeOpencodeHost {
  static async boot(args: { directory: string; client?: FakePluginClient }): Promise<FakeOpencodeHost> {
    const client = args.client ?? new FakePluginClient()
    const plugin = await WeavePlugin(makePluginContext(args.directory, client))
    return new FakeOpencodeHost(args.directory, client, plugin as PluginInterface)
  }

  private readonly outputs = new Map<string, HostOutput>()

  private constructor(
    readonly directory: string,
    readonly client: FakePluginClient,
    private readonly plugin: PluginInterface,
  ) {}

  async sendChatMessage(args: {
    sessionID: string
    parts: HostOutputPart[]
    agent?: string
    message?: Record<string, unknown>
  }): Promise<HostOutput> {
    const output: HostOutput = {
      message: {
        agent: args.agent ?? getAgentDisplayName("loom"),
        ...(args.message ?? {}),
      },
      parts: args.parts.map(part => ({ ...part })),
    }

    await this.plugin["chat.message"]({ sessionID: args.sessionID }, output as never)
    this.outputs.set(args.sessionID, output)
    return output
  }

  async sendStartWork(args: {
    sessionID: string
    planName?: string
    timestamp?: string
    agent?: string
  }): Promise<HostOutput> {
    return this.sendChatMessage({
      sessionID: args.sessionID,
      agent: args.agent,
      parts: [
        {
          type: "text",
          text: BUILTIN_COMMANDS["start-work"].template
            .replace(/\$SESSION_ID/g, args.sessionID)
            .replace(/\$TIMESTAMP/g, args.timestamp ?? new Date().toISOString())
            .replace(/\$ARGUMENTS/g, args.planName ?? ""),
        },
      ],
    })
  }

  async sendChatParams(args: ChatParamsInput): Promise<void> {
    await this.plugin["chat.params"](
      {
        sessionID: args.sessionID,
        ...(args.agent ? { agent: args.agent } : {}),
        ...(args.modelID || args.contextLimit
          ? {
              model: {
                ...(args.modelID ? { id: args.modelID } : {}),
                ...(args.contextLimit ? { limit: { context: args.contextLimit } } : {}),
              },
            }
          : {}),
      } as never,
      {} as never,
    )
  }

  async executeTool(args: ToolExecutionInput): Promise<void> {
    await this.plugin["tool.execute.before"](
      {
        sessionID: args.sessionID,
        tool: args.tool,
        callID: args.callID,
        ...(args.args ? { args: args.args } : {}),
      } as never,
      {} as never,
    )

    await this.plugin["tool.execute.after"](
      {
        sessionID: args.sessionID,
        tool: args.tool,
        callID: args.callID,
        ...(args.args ? { args: args.args } : {}),
      } as never,
      {} as never,
    )
  }

  async emitSessionIdle(sessionID: string): Promise<void> {
    await this.emitEvent({ type: "session.idle", properties: { sessionID } })
  }

  async emitCommandExecute(command: string): Promise<void> {
    await this.emitEvent({ type: "tui.command.execute", properties: { command } })
  }

  async emitSessionDeleted(sessionID: string): Promise<void> {
    await this.emitEvent({ type: "session.deleted", properties: { info: { id: sessionID } } })
  }

  async emitMessageUpdated(info: MessageUpdatedEventInfo): Promise<void> {
    await this.emitEvent({ type: "message.updated", properties: { info } })
  }

  async emitMessagePartUpdated(args: { sessionID: string; text: string; messageID?: string }): Promise<void> {
    await this.emitEvent({
      type: "message.part.updated",
      properties: {
        part: {
          type: "text",
          sessionID: args.sessionID,
          messageID: args.messageID ?? `msg-${args.sessionID}`,
          text: args.text,
        },
      },
    })
  }

  getOutput(sessionID: string): HostOutput | undefined {
    return this.outputs.get(sessionID)
  }

  getCurrentAgent(sessionID: string): string | undefined {
    return this.getOutput(sessionID)?.message.agent as string | undefined
  }

  getTextParts(sessionID: string): string[] {
    return (this.getOutput(sessionID)?.parts ?? [])
      .filter(part => part.type === "text" && typeof part.text === "string")
      .map(part => part.text as string)
  }

  private async emitEvent(event: unknown): Promise<void> {
    await this.plugin.event({ event: event as never })
  }
}
