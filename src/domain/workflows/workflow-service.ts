import {
  discoverWorkflows,
  getActiveWorkflowInstance,
  loadWorkflowDefinition,
  pauseWorkflow,
  resumeWorkflow,
  startWorkflow,
} from "../../features/workflow"
import type { WorkflowHookResult } from "../../features/workflow"
import type { WorkflowInstance } from "../../features/workflow"

export interface WorkflowService {
  getActiveWorkflowInstance(directory: string): WorkflowInstance | null
  loadWorkflowDefinition(path: string): ReturnType<typeof loadWorkflowDefinition>
  discoverWorkflows(directory: string, workflowDirs?: string[]): ReturnType<typeof discoverWorkflows>
  startWorkflow(args: Parameters<typeof startWorkflow>[0]): ReturnType<typeof startWorkflow>
  resumeWorkflow(directory: string): ReturnType<typeof resumeWorkflow>
  pauseWorkflow(directory: string, reason?: string): boolean
}

export function createWorkflowService(): WorkflowService {
  return {
    getActiveWorkflowInstance,
    loadWorkflowDefinition,
    discoverWorkflows,
    startWorkflow,
    resumeWorkflow,
    pauseWorkflow,
  }
}

export type { WorkflowHookResult }
