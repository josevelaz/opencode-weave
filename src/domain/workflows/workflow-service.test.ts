import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createWorkflowService } from "./workflow-service"
import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"
import { WORKFLOWS_DIR_PROJECT } from "../../features/workflow/constants"
import type { WorkflowDefinition } from "../../features/workflow"

describe("workflow service ownership transitions", () => {
  const workflowService = createWorkflowService()
  const executionLeaseRepository = createExecutionLeaseFsStore()
  let directory: string
  let definition: WorkflowDefinition
  let definitionPath: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "weave-workflow-service-"))
    const workflowDir = join(directory, WORKFLOWS_DIR_PROJECT)
    mkdirSync(workflowDir, { recursive: true })
    definition = {
      name: "workflow",
      version: 1,
      steps: [
        { id: "build", name: "Build", type: "autonomous", agent: "tapestry", prompt: "Build", completion: { method: "agent_signal" } },
        { id: "review", name: "Review", type: "interactive", agent: "weft", prompt: "Review", completion: { method: "user_confirm" } },
      ],
    }
    definitionPath = join(workflowDir, "workflow.json")
    writeFileSync(definitionPath, JSON.stringify(definition), "utf-8")
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("writes workflow ownership on start and pause transitions", () => {
    workflowService.startWorkflow({
      definition,
      definitionPath,
      goal: "Ship it",
      sessionId: "sess-wf",
      directory,
    })

    const startedLease = executionLeaseRepository.readExecutionLease(directory)
    expect(startedLease).not.toBeNull()
    expect(startedLease?.owner_kind).toBe("workflow")
    expect(startedLease?.owner_ref).toContain("/build")
    expect(startedLease?.executor_agent).toBe("tapestry")
    expect(executionLeaseRepository.readSessionRuntime(directory, "sess-wf")?.mode).toBe("workflow")

    expect(workflowService.pauseWorkflow(directory, "Paused for review")).toBe(true)

    const pausedLease = executionLeaseRepository.readExecutionLease(directory)
    expect(pausedLease?.status).toBe("paused")
    expect(executionLeaseRepository.readSessionRuntime(directory, "sess-wf")?.status).toBe("paused")
  })

  it("clears owner but preserves ad-hoc session identity on abort", () => {
    workflowService.startWorkflow({
      definition,
      definitionPath,
      goal: "Ship it",
      sessionId: "sess-wf",
      directory,
    })

    expect(workflowService.abortWorkflow(directory)).toBe(true)
    expect(executionLeaseRepository.readExecutionLease(directory)).toBeNull()

    const sessionRuntime = executionLeaseRepository.readSessionRuntime(directory, "sess-wf")
    expect(sessionRuntime).not.toBeNull()
    expect(sessionRuntime?.mode).toBe("ad_hoc")
    expect(sessionRuntime?.foreground_agent).toBe("tapestry")
    expect(sessionRuntime?.status).toBe("idle")
  })

  it("rebinds ownership to the requesting session on resume", () => {
    workflowService.startWorkflow({
      definition,
      definitionPath,
      goal: "Ship it",
      sessionId: "sess-wf-1",
      directory,
    })

    expect(workflowService.pauseWorkflow(directory, "Paused for review")).toBe(true)
    const action = workflowService.resumeWorkflow(directory, "sess-wf-2")

    expect(action.type).toBe("inject_prompt")
    expect(executionLeaseRepository.readExecutionLease(directory)).toMatchObject({
      owner_kind: "workflow",
      session_id: "sess-wf-2",
      executor_agent: "tapestry",
      status: "running",
    })
    expect(executionLeaseRepository.readSessionRuntime(directory, "sess-wf-2")).toMatchObject({
      foreground_agent: "tapestry",
      mode: "workflow",
      status: "running",
    })
    expect(workflowService.getActiveWorkflowInstance(directory)?.session_ids).toEqual(["sess-wf-2"])
  })
})
