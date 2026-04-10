import { createWorkflowFsRepository } from "../../infrastructure/fs/workflow-fs-repository"
import type { ActiveInstancePointer, WorkflowDefinition, WorkflowInstance } from "./types"

const Repository = createWorkflowFsRepository()

/**
 * Generate a unique instance ID.
 * Format: wf_{8 random hex chars} (e.g., "wf_a1b2c3d4").
 */
export function generateInstanceId(): string {
  return Repository.generateInstanceId()
}

/**
 * Generate a URL-safe slug from a goal string.
 * Lowercase, spaces to hyphens, strip non-alphanumeric, truncate to 50 chars.
 */
export function generateSlug(goal: string): string {
  return Repository.generateSlug(goal)
}

/**
 * Create a fresh WorkflowInstance for a definition + goal.
 */
export function createWorkflowInstance(
  definition: WorkflowDefinition,
  definitionPath: string,
  goal: string,
  sessionId: string,
): WorkflowInstance {
  return Repository.createWorkflowInstance(definition, definitionPath, goal, sessionId)
}

/**
 * Read a workflow instance by ID. Returns null if not found or invalid.
 */
export function readWorkflowInstance(directory: string, instanceId: string): WorkflowInstance | null {
  return Repository.readWorkflowInstance(directory, instanceId)
}

/**
 * Write a workflow instance to its state directory.
 * Creates directories as needed.
 */
export function writeWorkflowInstance(directory: string, instance: WorkflowInstance): boolean {
  return Repository.writeWorkflowInstance(directory, instance)
}

/**
 * Read the active instance pointer. Returns null if no active instance.
 */
export function readActiveInstance(directory: string): ActiveInstancePointer | null {
  return Repository.readActiveInstance(directory)
}

/**
 * Set the active instance pointer.
 */
export function setActiveInstance(directory: string, instanceId: string): boolean {
  return Repository.setActiveInstance(directory, instanceId)
}

/**
 * Clear the active instance pointer (without deleting the instance).
 */
export function clearActiveInstance(directory: string): boolean {
  return Repository.clearActiveInstance(directory)
}

/**
 * Get the active workflow instance (resolves pointer -> reads instance).
 * Returns null if no active instance or instance not found.
 */
export function getActiveWorkflowInstance(directory: string): WorkflowInstance | null {
  return Repository.getActiveWorkflowInstance(directory)
}

/**
 * List all instance IDs (for status/history commands).
 * Returns IDs sorted alphabetically.
 */
export function listInstances(directory: string): string[] {
  return Repository.listInstances(directory)
}

/**
 * Append a session ID to an instance's session_ids.
 * Returns the updated instance, or null if the instance doesn't exist.
 */
export function appendInstanceSessionId(
  directory: string,
  instanceId: string,
  sessionId: string,
): WorkflowInstance | null {
  return Repository.appendInstanceSessionId(directory, instanceId, sessionId)
}
