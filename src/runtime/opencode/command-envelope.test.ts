import { describe, expect, it } from "bun:test"
import { BUILTIN_COMMANDS } from "../../features/builtin-commands/commands"
import { WORKFLOW_CONTINUATION_MARKER } from "../../features/workflow/hook"
import { CONTINUATION_MARKER } from "../../hooks/work-continuation"
import { parseBuiltinCommandEnvelope, parseCommandEnvelope, parseContinuationEnvelope } from "./command-envelope"
import { FINALIZE_TODOS_MARKER, renderContinuationEnvelope } from "./protocol"

describe("parseCommandEnvelope", () => {
  it("parses start-work template via typed envelope", () => {
    const prompt = BUILTIN_COMMANDS["start-work"].template
      .replace(/\$SESSION_ID/g, "sess-1")
      .replace(/\$TIMESTAMP/g, "2026-01-01T00:00:00.000Z")
      .replace(/\$ARGUMENTS/g, "my-plan")

    const result = parseCommandEnvelope(prompt)
    expect(result).toEqual({
      kind: "builtin-command",
      source: "envelope",
      protocolVersion: "1",
      command: "start-work",
      arguments: "my-plan",
      sessionId: "sess-1",
      timestamp: "2026-01-01T00:00:00.000Z",
    })
  })

  it("parses run-workflow template via typed envelope", () => {
    const prompt = BUILTIN_COMMANDS["run-workflow"].template
      .replace(/\$SESSION_ID/g, "sess-2")
      .replace(/\$TIMESTAMP/g, "2026-01-02T00:00:00.000Z")
      .replace(/\$ARGUMENTS/g, 'spec-driven "Add OAuth2"')

    const result = parseBuiltinCommandEnvelope(prompt)
    expect(result?.command).toBe("run-workflow")
    expect(result?.arguments).toBe('spec-driven "Add OAuth2"')
    expect(result?.source).toBe("envelope")
  })

  it("parses token-report, metrics, and weave-health via typed envelopes", () => {
    const tokenReport = parseBuiltinCommandEnvelope(
      BUILTIN_COMMANDS["token-report"].template.replace(/\$ARGUMENTS/g, "token data"),
    )
    const metrics = parseBuiltinCommandEnvelope(
      BUILTIN_COMMANDS.metrics.template.replace(/\$ARGUMENTS/g, "all"),
    )
    const health = parseBuiltinCommandEnvelope(
      BUILTIN_COMMANDS["weave-health"].template.replace(/\$ARGUMENTS/g, "healthy"),
    )

    expect(tokenReport?.command).toBe("token-report")
    expect(tokenReport?.arguments).toBe("token data")
    expect(metrics?.command).toBe("metrics")
    expect(metrics?.arguments).toBe("all")
    expect(health?.command).toBe("weave-health")
    expect(health?.arguments).toBe("healthy")
  })

  it("falls back to legacy start-work detection", () => {
    const prompt = `<command-instruction>Execute plan</command-instruction>\n<session-context>Session ID: sess-3  Timestamp: 2026-01-03</session-context>\n<user-request>legacy-plan</user-request>`

    const result = parseBuiltinCommandEnvelope(prompt)
    expect(result).toEqual({
      kind: "builtin-command",
      source: "legacy",
      command: "start-work",
      arguments: "legacy-plan",
      sessionId: "sess-3",
      timestamp: "2026-01-03",
    })
  })

  it("falls back to legacy run-workflow detection", () => {
    const prompt = `<command-instruction>\nThe workflow engine will inject context below with step instructions.\n</command-instruction>\n<session-context>Session ID: sess-4  Timestamp: 2026-01-04</session-context>\n<user-request>spec-driven \"Add OAuth2\"</user-request>`

    const result = parseBuiltinCommandEnvelope(prompt)
    expect(result?.command).toBe("run-workflow")
    expect(result?.source).toBe("legacy")
  })

  it("falls back to legacy metrics-style tags", () => {
    const metrics = parseBuiltinCommandEnvelope("<metrics-data>all</metrics-data>")
    const tokenReport = parseBuiltinCommandEnvelope("<token-report>report</token-report>")
    const health = parseBuiltinCommandEnvelope("<weave-health>healthy</weave-health>")

    expect(metrics?.command).toBe("metrics")
    expect(tokenReport?.command).toBe("token-report")
    expect(health?.command).toBe("weave-health")
  })

  it("parses typed work continuation envelopes", () => {
    const prompt = `${renderContinuationEnvelope({
      continuation: "work",
      sessionId: "sess-5",
      planName: "typed-seam",
      planPath: "/tmp/typed-seam.md",
      progress: "1/5 tasks completed",
      workingDirectory: "/tmp/project",
    })}\nContinue working.`

    const result = parseContinuationEnvelope(prompt)
    expect(result).toEqual({
      kind: "continuation",
      source: "envelope",
      protocolVersion: "1",
      continuation: "work",
      sessionId: "sess-5",
      planName: "typed-seam",
      planPath: "/tmp/typed-seam.md",
      progress: "1/5 tasks completed",
      workingDirectory: "/tmp/project",
    })
  })

  it("falls back to legacy continuation markers", () => {
    const work = parseContinuationEnvelope(`${CONTINUATION_MARKER}\n**Plan**: demo\n**File**: \`/tmp/demo.md\`\n**Working directory**: \`/tmp\`\n**Progress**: 1/3 tasks completed`)
    const workflow = parseContinuationEnvelope(`${WORKFLOW_CONTINUATION_MARKER}\nContinue the workflow.`)
    const todo = parseContinuationEnvelope(`${FINALIZE_TODOS_MARKER}\nFinalize todos.`)

    expect(work?.continuation).toBe("work")
    expect(work?.source).toBe("legacy")
    expect(work?.planName).toBe("demo")
    expect(work?.planPath).toBe("/tmp/demo.md")
    expect(workflow?.continuation).toBe("workflow")
    expect(todo?.continuation).toBe("todo-finalize")
  })
})
