import type {
  ActiveInstancePointer,
  StepState,
  WorkflowDefinition,
  WorkflowInstance,
} from "../../features/workflow/types"

export interface WorkflowRepository {
  generateInstanceId(): string
  generateSlug(goal: string): string
  createWorkflowInstance(
    definition: WorkflowDefinition,
    definitionPath: string,
    goal: string,
    sessionId: string,
  ): WorkflowInstance
  readWorkflowInstance(directory: string, instanceId: string): WorkflowInstance | null
  writeWorkflowInstance(directory: string, instance: WorkflowInstance): boolean
  readActiveInstance(directory: string): ActiveInstancePointer | null
  setActiveInstance(directory: string, instanceId: string): boolean
  clearActiveInstance(directory: string): boolean
  getActiveWorkflowInstance(directory: string): WorkflowInstance | null
  listInstances(directory: string): string[]
  appendInstanceSessionId(directory: string, instanceId: string, sessionId: string): WorkflowInstance | null
}

export type { StepState }
