export const WEAVE_COMMAND_ENVELOPE_TAG = "weave-command-envelope"
export const WEAVE_CONTINUATION_ENVELOPE_TAG = "weave-continuation-envelope"
export const WEAVE_PROTOCOL_VERSION = "1"

export type BuiltinCommandEnvelopeName =
  | "start-work"
  | "run-workflow"
  | "metrics"
  | "token-report"
  | "weave-health"

export type ContinuationEnvelopeKind = "work" | "workflow" | "todo-finalize"

export interface BuiltinCommandEnvelope {
  kind: "builtin-command"
  source: "envelope" | "legacy"
  protocolVersion?: string
  command: BuiltinCommandEnvelopeName
  arguments: string
  sessionId: string | null
  timestamp: string | null
}

export interface ContinuationEnvelope {
  kind: "continuation"
  source: "envelope" | "legacy"
  protocolVersion?: string
  continuation: ContinuationEnvelopeKind
  sessionId: string | null
  planName?: string | null
  planPath?: string | null
  progress?: string | null
  workingDirectory?: string | null
}

export type ParsedWeaveEnvelope = BuiltinCommandEnvelope | ContinuationEnvelope

export function renderBuiltinCommandEnvelope(input: {
  command: BuiltinCommandEnvelopeName
  arguments: string
  sessionId?: string
  timestamp?: string
}): string {
  return [
    `<${WEAVE_COMMAND_ENVELOPE_TAG}>`,
    tag("protocol-version", WEAVE_PROTOCOL_VERSION),
    tag("command-name", input.command),
    tag("arguments", input.arguments),
    tag("session-id", input.sessionId ?? ""),
    tag("timestamp", input.timestamp ?? ""),
    `</${WEAVE_COMMAND_ENVELOPE_TAG}>`,
  ].join("\n")
}

export function renderContinuationEnvelope(input: {
  continuation: ContinuationEnvelopeKind
  sessionId?: string
  planName?: string
  planPath?: string
  progress?: string
  workingDirectory?: string
}): string {
  return [
    `<${WEAVE_CONTINUATION_ENVELOPE_TAG}>`,
    tag("protocol-version", WEAVE_PROTOCOL_VERSION),
    tag("continuation-kind", input.continuation),
    tag("session-id", input.sessionId ?? ""),
    tag("plan-name", input.planName ?? ""),
    tag("plan-path", input.planPath ?? ""),
    tag("progress", input.progress ?? ""),
    tag("working-directory", input.workingDirectory ?? ""),
    `</${WEAVE_CONTINUATION_ENVELOPE_TAG}>`,
  ].join("\n")
}

export function parseEnvelopeBlock(text: string, tagName: string): Record<string, string> | null {
  const blockPattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i")
  const blockMatch = text.match(blockPattern)
  if (!blockMatch) {
    return null
  }

  const fields: Record<string, string> = {}
  const fieldPattern = /<([a-z0-9-]+)>([\s\S]*?)<\/\1>/gi

  for (const match of blockMatch[1].matchAll(fieldPattern)) {
    const [, fieldName, rawValue] = match
    fields[fieldName] = unescapeXml(rawValue.trim())
  }

  return fields
}

function tag(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}
