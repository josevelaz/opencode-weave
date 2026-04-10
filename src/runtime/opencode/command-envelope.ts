import { CONTINUATION_MARKER } from "../../hooks/work-continuation"
import { FINALIZE_TODOS_MARKER } from "../../hooks/todo-continuation-enforcer"
import { WORKFLOW_CONTINUATION_MARKER } from "../../features/workflow/hook"
import {
  parseEnvelopeBlock,
  type BuiltinCommandEnvelope,
  type BuiltinCommandEnvelopeName,
  type ContinuationEnvelope,
  type ContinuationEnvelopeKind,
  WEAVE_COMMAND_ENVELOPE_TAG,
  WEAVE_CONTINUATION_ENVELOPE_TAG,
} from "./protocol"

const BUILTIN_COMMANDS = new Set<BuiltinCommandEnvelopeName>([
  "start-work",
  "run-workflow",
  "metrics",
  "token-report",
  "weave-health",
])

const CONTINUATIONS = new Set<ContinuationEnvelopeKind>(["work", "workflow", "todo-finalize"])

export type ParsedCommandEnvelope = BuiltinCommandEnvelope | ContinuationEnvelope

export function parseCommandEnvelope(promptText: string): ParsedCommandEnvelope | null {
  return parseBuiltinCommandEnvelope(promptText) ?? parseContinuationEnvelope(promptText)
}

export function parseBuiltinCommandEnvelope(promptText: string): BuiltinCommandEnvelope | null {
  const envelopeFields = parseEnvelopeBlock(promptText, WEAVE_COMMAND_ENVELOPE_TAG)
  if (envelopeFields) {
    const command = envelopeFields["command-name"] as BuiltinCommandEnvelopeName | undefined
    if (!command || !BUILTIN_COMMANDS.has(command)) {
      return null
    }

    return {
      kind: "builtin-command",
      source: "envelope",
      protocolVersion: envelopeFields["protocol-version"] || undefined,
      command,
      arguments: envelopeFields.arguments ?? "",
      sessionId: toNullable(envelopeFields["session-id"]),
      timestamp: toNullable(envelopeFields.timestamp),
    }
  }

  return parseLegacyBuiltinCommandEnvelope(promptText)
}

export function parseContinuationEnvelope(promptText: string): ContinuationEnvelope | null {
  const envelopeFields = parseEnvelopeBlock(promptText, WEAVE_CONTINUATION_ENVELOPE_TAG)
  if (envelopeFields) {
    const continuation = envelopeFields["continuation-kind"] as ContinuationEnvelopeKind | undefined
    if (!continuation || !CONTINUATIONS.has(continuation)) {
      return null
    }

    return {
      kind: "continuation",
      source: "envelope",
      protocolVersion: envelopeFields["protocol-version"] || undefined,
      continuation,
      sessionId: toNullable(envelopeFields["session-id"]),
      planName: toNullable(envelopeFields["plan-name"]),
      planPath: toNullable(envelopeFields["plan-path"]),
      progress: toNullable(envelopeFields.progress),
      workingDirectory: toNullable(envelopeFields["working-directory"]),
    }
  }

  return parseLegacyContinuationEnvelope(promptText)
}

function parseLegacyBuiltinCommandEnvelope(promptText: string): BuiltinCommandEnvelope | null {
  if (promptText.includes("<token-report>")) {
    return buildLegacyBuiltinCommand("token-report", promptText)
  }

  if (promptText.includes("<metrics-data>")) {
    return buildLegacyBuiltinCommand("metrics", promptText)
  }

  if (promptText.includes("<weave-health>")) {
    return buildLegacyBuiltinCommand("weave-health", promptText)
  }

  if (!promptText.includes("<session-context>")) {
    return null
  }

  const { sessionId, timestamp } = extractLegacySessionContext(promptText)
  const args = extractTagValue(promptText, "user-request") ?? ""

  if (promptText.includes("workflow engine will inject context")) {
    return {
      kind: "builtin-command",
      source: "legacy",
      command: "run-workflow",
      arguments: args,
      sessionId,
      timestamp,
    }
  }

  return {
    kind: "builtin-command",
    source: "legacy",
    command: "start-work",
    arguments: args,
    sessionId,
    timestamp,
  }
}

function parseLegacyContinuationEnvelope(promptText: string): ContinuationEnvelope | null {
  if (promptText.includes(WORKFLOW_CONTINUATION_MARKER)) {
    return {
      kind: "continuation",
      source: "legacy",
      continuation: "workflow",
      sessionId: null,
    }
  }

  if (promptText.includes(CONTINUATION_MARKER)) {
    return {
      kind: "continuation",
      source: "legacy",
      continuation: "work",
      sessionId: null,
      planName: extractMarkdownField(promptText, "Plan"),
      planPath: extractInlineCodeField(promptText, "File"),
      progress: extractMarkdownField(promptText, "Progress"),
      workingDirectory: extractInlineCodeField(promptText, "Working directory"),
    }
  }

  if (promptText.includes(FINALIZE_TODOS_MARKER)) {
    return {
      kind: "continuation",
      source: "legacy",
      continuation: "todo-finalize",
      sessionId: null,
    }
  }

  return null
}

function buildLegacyBuiltinCommand(command: BuiltinCommandEnvelopeName, promptText: string): BuiltinCommandEnvelope {
  return {
    kind: "builtin-command",
    source: "legacy",
    command,
    arguments:
      extractTagValue(promptText, command === "metrics" ? "metrics-data" : command) ?? "",
    sessionId: null,
    timestamp: null,
  }
}

function extractLegacySessionContext(promptText: string): { sessionId: string | null; timestamp: string | null } {
  const rawContext = extractTagValue(promptText, "session-context")
  if (!rawContext) {
    return { sessionId: null, timestamp: null }
  }

  const match = rawContext.match(/Session ID:\s*(.+?)(?:\s{2,}|\s+Timestamp:|$)(?:Timestamp:\s*(.+))?/i)
  if (!match) {
    return { sessionId: null, timestamp: null }
  }

  return {
    sessionId: toNullable(match[1]?.trim() ?? ""),
    timestamp: toNullable(match[2]?.trim() ?? ""),
  }
}

function extractTagValue(promptText: string, tagName: string): string | null {
  const match = promptText.match(new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "i"))
  return match ? match[1].trim() : null
}

function extractMarkdownField(promptText: string, label: string): string | null {
  const match = promptText.match(new RegExp(`\\*\\*${escapeRegExp(label)}\\*\\*:\\s*(.+)$`, "mi"))
  return match ? match[1].trim() : null
}

function extractInlineCodeField(promptText: string, label: string): string | null {
  const match = promptText.match(new RegExp(`\\*\\*${escapeRegExp(label)}\\*\\*:\\s*` + "`([^`]+)`", "mi"))
  return match ? match[1].trim() : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function toNullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}
