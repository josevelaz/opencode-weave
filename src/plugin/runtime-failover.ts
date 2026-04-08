import type { RuntimeModelPlanRegistry } from "../agents/types"
import type { RuntimeFailoverClient, RuntimeFailoverModelRef, RuntimeFailoverPromptBody } from "./types"
import { info } from "../shared/log"

/**
 * Runtime failover is intentionally gated to a verified OpenCode seam:
 * - failure signal: `session.error`
 * - replay seam: `client.session.promptAsync({ body: { agent, model, messageID, parts } })`
 * - NOT supported: mutating `chat.params` to swap the model in-flight
 *
 * Rollout risks / v1 limits:
 * - provider error-shape drift may bypass classification
 * - duplicate prompts are still possible if upstream emits failure after side effects/tool calls
 * - this relies on upstream continuing to accept per-attempt model override via prompt replay
 * - scope is limited to quota/rate-limit/transient provider failures only
 */

type PromptPart = Record<string, unknown>

type PendingAttempt = {
  sessionId: string
  agentName: string
  agentDisplayName?: string
  messageId?: string
  parts: PromptPart[]
  eligibleModels: string[]
  attemptedModels: string[]
  activeModel?: string
  replayed: boolean
  terminalState: "active" | "succeeded" | "hard-fail" | "exhausted"
  lastErrorKey?: string
}

type SessionErrorLike = {
  name?: string
  message?: string
  code?: string
  type?: string
  data?: {
    message?: string
    statusCode?: number
    isRetryable?: boolean
    code?: string
    type?: string
  }
}

export type RuntimeFailoverDecision =
  | { action: "retry"; reason: string }
  | { action: "hard-fail"; reason: string }
  | { action: "ignore"; reason: string }

export type FailoverReplayRequest = {
  sessionId: string
  toModel: RuntimeFailoverModelRef
  fromModel?: string
  attempt: number
  reason: string
  body: RuntimeFailoverPromptBody
}

export type RuntimeFailoverReplayResult = {
  replayed: boolean
  request?: FailoverReplayRequest
}

function modelKey(model: RuntimeFailoverModelRef | undefined): string | undefined {
  if (!model?.providerID || !model?.modelID) return undefined
  return `${model.providerID}/${model.modelID}`
}

function toModelRef(model: string): RuntimeFailoverModelRef | undefined {
  const [providerID, ...rest] = model.split("/")
  const modelID = rest.join("/")
  if (!providerID || !modelID) return undefined
  return { providerID, modelID }
}

function cloneParts(parts: Array<Record<string, unknown>> | undefined): PromptPart[] {
  return (parts ?? []).map((part) => ({ ...part }))
}

function pushUnique(values: string[], value: string | undefined): void {
  if (!value) return
  if (!values.includes(value)) {
    values.push(value)
  }
}

function normalizeOrderedModels(models: string[] | undefined): string[] {
  const normalized: string[] = []
  for (const model of models ?? []) {
    pushUnique(normalized, model)
  }
  return normalized
}

function buildErrorKey(error: SessionErrorLike | undefined, activeModel: string | undefined): string {
  const terms = collectErrorTerms(error)
  const statusCode = error?.data?.statusCode ? `status:${error.data.statusCode}` : ""
  return [activeModel ?? "", statusCode, ...terms].filter(Boolean).join("|")
}

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504])
const HARD_FAIL_STATUS_CODES = new Set([400, 401, 403, 404])

const RETRYABLE_TERMS = [
  "rate_limit_exceeded",
  "quota_exceeded",
  "insufficient_quota",
  "rate_limit",
  "rate limit",
  "overloaded",
  "temporarily_unavailable",
  "temporarily unavailable",
  "timeout",
  "timed out",
  "network reset",
  "connection reset",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
]

const HARD_FAIL_TERMS = [
  "unsupported model",
  "model_not_found",
  "invalid model",
  "context length",
  "maximum context length",
  "prompt is too long",
  "content policy",
  "safety",
  "malformed",
  "invalid_request",
  "tool error",
  "tool_result",
  "user aborted",
  "aborted",
  "cancelled",
  "canceled",
]

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function collectErrorTerms(error: SessionErrorLike | undefined): string[] {
  return [error?.name, error?.type, error?.code, error?.message, error?.data?.type, error?.data?.code, error?.data?.message]
    .map(normalizeText)
    .filter(Boolean)
}

function includesAnyTerm(values: string[], terms: string[]): string | undefined {
  for (const value of values) {
    for (const term of terms) {
      if (value.includes(term)) {
        return term
      }
    }
  }
  return undefined
}

export function classifyRuntimeFailoverError(error: SessionErrorLike | undefined): RuntimeFailoverDecision {
  if (!error) {
    return { action: "ignore", reason: "missing-error" }
  }

  const errorName = normalizeText(error.name)
  const statusCode = error.data?.statusCode
  const terms = collectErrorTerms(error)

  if (errorName === "messageabortederror") {
    return { action: "hard-fail", reason: "user-aborted" }
  }

  if (errorName === "providerautherror") {
    return { action: "hard-fail", reason: "provider-auth" }
  }

  if (statusCode && HARD_FAIL_STATUS_CODES.has(statusCode)) {
    return { action: "hard-fail", reason: `status:${statusCode}` }
  }

  if (statusCode && RETRYABLE_STATUS_CODES.has(statusCode)) {
    return { action: "retry", reason: `status:${statusCode}` }
  }

  const hardFailTerm = includesAnyTerm(terms, HARD_FAIL_TERMS)
  if (hardFailTerm) {
    return { action: "hard-fail", reason: `term:${hardFailTerm}` }
  }

  if (error.data?.isRetryable === true) {
    return { action: "retry", reason: "provider-retryable" }
  }

  const retryableTerm = includesAnyTerm(terms, RETRYABLE_TERMS)
  if (retryableTerm) {
    return { action: "retry", reason: `term:${retryableTerm}` }
  }

  return { action: "hard-fail", reason: errorName || "unclassified-error" }
}

export function createRuntimeFailoverCoordinator(args: {
  runtimeModelPlans: RuntimeModelPlanRegistry
  client?: RuntimeFailoverClient
  onReplay?: (request: FailoverReplayRequest) => void
}) {
  const { runtimeModelPlans, client, onReplay } = args
  const pendingAttempts = new Map<string, PendingAttempt>()
  const replaySessionIds = new Set<string>()

  return {
    markReplayConsumed(sessionId: string): boolean {
      if (!replaySessionIds.has(sessionId)) return false
      replaySessionIds.delete(sessionId)
      return true
    },

    captureChatMessage(input: {
      sessionId: string
      agent?: string
      messageId?: string
      model?: RuntimeFailoverModelRef
      parts?: Array<Record<string, unknown>>
    }): void {
      const sessionId = input.sessionId
      if (!sessionId) return

      const plan = (input.agent && runtimeModelPlans[input.agent]) || undefined
      const existing = pendingAttempts.get(sessionId)
      const eligibleModels = normalizeOrderedModels(plan?.orderedModels ?? existing?.eligibleModels)
      const activeModelKey = modelKey(input.model)
      const attemptedModels = existing?.attemptedModels.slice() ?? []
      if (activeModelKey) {
        pushUnique(attemptedModels, activeModelKey)
      } else if (attemptedModels.length === 0) {
        pushUnique(attemptedModels, eligibleModels[0])
      }

      pendingAttempts.set(sessionId, {
        sessionId,
        agentName: plan?.agentName ?? existing?.agentName ?? input.agent ?? "",
        agentDisplayName: input.agent,
        messageId: input.messageId,
        parts: cloneParts(input.parts),
        eligibleModels,
        attemptedModels,
        activeModel: activeModelKey,
        replayed: false,
        terminalState: "active",
        lastErrorKey: undefined,
      })
    },

    captureResolvedModel(input: {
      sessionId: string
      agent?: string
      model?: { id?: string }
    }): void {
      const session = pendingAttempts.get(input.sessionId)
      if (!session) return
      if (input.agent) {
        session.agentDisplayName = input.agent
      }
      if (input.model?.id) {
        pushUnique(session.eligibleModels, input.model.id)
        session.activeModel = input.model.id
        pushUnique(session.attemptedModels, input.model.id)
      }
    },

    markAttemptSucceeded(sessionId?: string): void {
      if (!sessionId) return
      const session = pendingAttempts.get(sessionId)
      if (!session) return
      if (session.terminalState !== "active") return
      session.terminalState = "succeeded"
      session.replayed = false
      session.lastErrorKey = undefined
      info("[runtime-failover] Attempt succeeded", {
        sessionId,
        finalModel: session.activeModel,
        attemptedModels: session.attemptedModels,
      })
    },

    async handleSessionError(input: {
      sessionId?: string
      error?: SessionErrorLike
    }): Promise<RuntimeFailoverReplayResult> {
      const sessionId = input.sessionId
      if (!sessionId || !client) return { replayed: false }

      const classification = classifyRuntimeFailoverError(input.error)
      const session = pendingAttempts.get(sessionId)
      if (!session) return { replayed: false }

      const errorKey = buildErrorKey(input.error, session.activeModel)
      if (session.lastErrorKey && session.lastErrorKey === errorKey) {
        return { replayed: false }
      }

      if (session.terminalState === "succeeded" || session.terminalState === "hard-fail" || session.terminalState === "exhausted") {
        session.lastErrorKey = errorKey
        return { replayed: false }
      }

      if (classification.action !== "retry") {
        if (classification.action === "hard-fail") {
          session.terminalState = "hard-fail"
        }
        session.lastErrorKey = errorKey
        return { replayed: false }
      }

      if (!session || session.replayed) return { replayed: false }

      if (session.attemptedModels.length >= session.eligibleModels.length) {
        session.terminalState = "exhausted"
        session.lastErrorKey = errorKey
        return { replayed: false }
      }

      const plan = runtimeModelPlans[session.agentDisplayName ?? ""] ?? runtimeModelPlans[session.agentName]
      const orderedModels = normalizeOrderedModels(session.eligibleModels.length > 0 ? session.eligibleModels : plan?.orderedModels)
      if (orderedModels.length < 2) {
        session.terminalState = "exhausted"
        session.lastErrorKey = errorKey
        return { replayed: false }
      }

      const nextModel = orderedModels.find((model) => !session.attemptedModels.includes(model))
      const nextModelRef = nextModel ? toModelRef(nextModel) : undefined
      if (!nextModel || !nextModelRef || session.parts.length === 0) {
        session.terminalState = "exhausted"
        session.lastErrorKey = errorKey
        return { replayed: false }
      }

      const body: RuntimeFailoverPromptBody = {
        parts: cloneParts(session.parts),
        ...(session.agentDisplayName ? { agent: session.agentDisplayName } : {}),
        model: nextModelRef,
        ...(session.messageId ? { messageID: session.messageId } : {}),
      }

      const request: FailoverReplayRequest = {
        sessionId,
        toModel: nextModelRef,
        fromModel: session.activeModel,
        attempt: session.attemptedModels.length,
        reason: classification.reason,
        body,
      }

      replaySessionIds.add(sessionId)
      session.replayed = true
      pushUnique(session.attemptedModels, nextModel)
      session.activeModel = nextModel
      session.lastErrorKey = errorKey
      info("[runtime-failover] Replaying failed prompt with fallback model", {
        sessionId,
        from: request.fromModel,
        to: nextModel,
        attempt: request.attempt,
        reason: classification.reason,
      })
      onReplay?.(request)
      await client.session.promptAsync({ path: { id: sessionId }, body })
      return { replayed: true, request }
    },
  }
}
