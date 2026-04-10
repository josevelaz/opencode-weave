import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createPolicyEngine } from "../../src/application/policy/policy-engine"
import { createAutoPauseChatPolicy, createCommandChatPolicy } from "../../src/application/policy/chat-policy"
import { createHookBackedToolPolicy } from "../../src/application/policy/tool-policy"
import { createHookBackedSessionPolicy } from "../../src/application/policy/session-policy"
import { DEFAULT_CONTINUATION_CONFIG } from "../../src/config/continuation"
import type { CreatedHooks } from "../../src/hooks/create-hooks"
import { createPlanFsRepository } from "../../src/infrastructure/fs/plan-fs-repository"
import { PLANS_DIR } from "../../src/features/work-state/constants"

function makeHooks(overrides?: Partial<CreatedHooks>): CreatedHooks {
  return {
    checkContextWindow: null,
    writeGuard: null,
    shouldInjectRules: null,
    getRulesForFile: null,
    firstMessageVariant: null,
    processMessageForKeywords: null,
    patternMdOnly: null,
    startWork: null,
    workContinuation: null,
    workflowStart: null,
    workflowContinuation: null,
    workflowCommand: null,
    verificationReminder: null,
    analyticsEnabled: false,
    todoDescriptionOverride: null,
    compactionTodoPreserverEnabled: false,
    todoContinuationEnforcerEnabled: false,
    compactionRecovery: null,
    continuation: DEFAULT_CONTINUATION_CONFIG,
    ...overrides,
  }
}

describe("policy engine integration", () => {
  let directory: string
  const planRepository = createPlanFsRepository()

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "weave-policy-int-"))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("auto-pauses active plans from repository-backed state", async () => {
    const plansDir = join(directory, PLANS_DIR)
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, "plan.md")
    writeFileSync(planPath, "# Plan\n- [ ] Task\n", "utf-8")
    planRepository.writeWorkState(directory, planRepository.createWorkState(planPath, "sess-1", "tapestry", directory))

    const engine = createPolicyEngine({
      chatPolicies: [createCommandChatPolicy(), createAutoPauseChatPolicy()],
      toolPolicies: [createHookBackedToolPolicy()],
      sessionPolicies: [createHookBackedSessionPolicy()],
    })

    const effects = await engine.onChatMessage({
      directory,
      sessionId: "sess-1",
      promptText: "hello there",
      parsedEnvelope: null,
      hooks: makeHooks(),
    })

    expect(effects).toContainEqual({
      type: "pauseExecution",
      target: "plan",
      reason: "Auto-paused: user message received during active plan",
    })
  })
})
