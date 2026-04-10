import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { randomBytes } from "node:crypto"
import { join } from "path"
import type { WorkflowRepository } from "../../domain/workflows/workflow-repository"
import type { ActiveInstancePointer, StepState, WorkflowDefinition, WorkflowInstance } from "../../features/workflow/types"
import { ACTIVE_INSTANCE_FILE, INSTANCE_STATE_FILE, WORKFLOWS_STATE_DIR } from "../../features/workflow/constants"

function generateInstanceId(): string {
  return `wf_${randomBytes(4).toString("hex")}`
}

function generateSlug(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
}

function createWorkflowInstance(
  definition: WorkflowDefinition,
  definitionPath: string,
  goal: string,
  sessionId: string,
): WorkflowInstance {
  const instanceId = generateInstanceId()
  const slug = generateSlug(goal)
  const firstStepId = definition.steps[0].id

  const steps: Record<string, StepState> = {}
  for (const step of definition.steps) {
    steps[step.id] = {
      id: step.id,
      status: step.id === firstStepId ? "active" : "pending",
      ...(step.id === firstStepId ? { started_at: new Date().toISOString() } : {}),
    }
  }

  return {
    instance_id: instanceId,
    definition_id: definition.name,
    definition_name: definition.name,
    definition_path: definitionPath,
    goal,
    slug,
    status: "running",
    started_at: new Date().toISOString(),
    session_ids: [sessionId],
    current_step_id: firstStepId,
    steps,
    artifacts: {},
  }
}

function readWorkflowInstance(directory: string, instanceId: string): WorkflowInstance | null {
  const filePath = join(directory, WORKFLOWS_STATE_DIR, instanceId, INSTANCE_STATE_FILE)
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const raw = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    if (typeof parsed.instance_id !== "string") {
      return null
    }

    return parsed as WorkflowInstance
  } catch {
    return null
  }
}

function writeWorkflowInstance(directory: string, instance: WorkflowInstance): boolean {
  try {
    const instanceDir = join(directory, WORKFLOWS_STATE_DIR, instance.instance_id)
    if (!existsSync(instanceDir)) {
      mkdirSync(instanceDir, { recursive: true })
    }

    writeFileSync(join(instanceDir, INSTANCE_STATE_FILE), JSON.stringify(instance, null, 2), "utf-8")
    return true
  } catch {
    return false
  }
}

function readActiveInstance(directory: string): ActiveInstancePointer | null {
  const filePath = join(directory, WORKFLOWS_STATE_DIR, ACTIVE_INSTANCE_FILE)
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const raw = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || typeof parsed.instance_id !== "string") {
      return null
    }

    return parsed as ActiveInstancePointer
  } catch {
    return null
  }
}

function setActiveInstance(directory: string, instanceId: string): boolean {
  try {
    const workflowDir = join(directory, WORKFLOWS_STATE_DIR)
    if (!existsSync(workflowDir)) {
      mkdirSync(workflowDir, { recursive: true })
    }

    writeFileSync(join(workflowDir, ACTIVE_INSTANCE_FILE), JSON.stringify({ instance_id: instanceId }, null, 2), "utf-8")
    return true
  } catch {
    return false
  }
}

function clearActiveInstance(directory: string): boolean {
  const filePath = join(directory, WORKFLOWS_STATE_DIR, ACTIVE_INSTANCE_FILE)
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
    return true
  } catch {
    return false
  }
}

function getActiveWorkflowInstance(directory: string): WorkflowInstance | null {
  const pointer = readActiveInstance(directory)
  if (!pointer) {
    return null
  }

  return readWorkflowInstance(directory, pointer.instance_id)
}

function listInstances(directory: string): string[] {
  const workflowDir = join(directory, WORKFLOWS_STATE_DIR)
  try {
    if (!existsSync(workflowDir)) {
      return []
    }

    return readdirSync(workflowDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("wf_"))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function appendInstanceSessionId(directory: string, instanceId: string, sessionId: string): WorkflowInstance | null {
  const instance = readWorkflowInstance(directory, instanceId)
  if (!instance) {
    return null
  }

  if (!instance.session_ids.includes(sessionId)) {
    instance.session_ids.push(sessionId)
    writeWorkflowInstance(directory, instance)
  }

  return instance
}

export function createWorkflowFsRepository(): WorkflowRepository {
  return {
    generateInstanceId,
    generateSlug,
    createWorkflowInstance,
    readWorkflowInstance,
    writeWorkflowInstance,
    readActiveInstance,
    setActiveInstance,
    clearActiveInstance,
    getActiveWorkflowInstance,
    listInstances,
    appendInstanceSessionId,
  }
}
