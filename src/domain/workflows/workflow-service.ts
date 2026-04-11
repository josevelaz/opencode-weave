import {
  abortWorkflow,
  discoverWorkflows,
  getActiveWorkflowInstance,
  loadWorkflowDefinition,
  pauseWorkflow,
  resumeWorkflow,
  startWorkflow,
  writeWorkflowInstance,
} from "../../features/workflow"
import type { WorkflowHookResult } from "../../features/workflow"
import type { WorkflowInstance } from "../../features/workflow"
import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"
import { projectExecutionTransition } from "../session/execution-lease"

export interface WorkflowService {
  getActiveWorkflowInstance(directory: string): WorkflowInstance | null
  loadWorkflowDefinition(path: string): ReturnType<typeof loadWorkflowDefinition>
  discoverWorkflows(directory: string, workflowDirs?: string[]): ReturnType<typeof discoverWorkflows>
  startWorkflow(args: Parameters<typeof startWorkflow>[0]): ReturnType<typeof startWorkflow>
  resumeWorkflow(directory: string, sessionId?: string): ReturnType<typeof resumeWorkflow>
  pauseWorkflow(directory: string, reason?: string): boolean
  abortWorkflow(directory: string): boolean
}

export function createWorkflowService(): WorkflowService {
  const executionLeaseRepository = createExecutionLeaseFsStore()

  return {
    getActiveWorkflowInstance,
    loadWorkflowDefinition,
    discoverWorkflows,
    startWorkflow(args) {
      const action = startWorkflow(args)
      const instance = getActiveWorkflowInstance(args.directory)
      const firstStep = instance
        ? args.definition.steps.find((step) => step.id === instance.current_step_id)
        : null

      if (instance && firstStep) {
        const projection = projectExecutionTransition({
          event: "start_workflow",
          sessionId: args.sessionId,
          ownerRef: `${instance.instance_id}/${instance.current_step_id}`,
          executionRef: `${instance.instance_id}/${instance.current_step_id}`,
          executorAgent: firstStep.agent,
          foregroundAgent: firstStep.agent,
          currentLease: executionLeaseRepository.readExecutionLease(args.directory),
          currentSessionRuntime: executionLeaseRepository.readSessionRuntime(args.directory, args.sessionId),
        })

        if (projection.lease) {
          executionLeaseRepository.writeExecutionLease(args.directory, projection.lease)
        }
        if (projection.sessionRuntime) {
          executionLeaseRepository.writeSessionRuntime(args.directory, projection.sessionRuntime)
        }
      }

      return action
    },
    resumeWorkflow(directory, sessionId) {
      const action = resumeWorkflow(directory)
      const instance = getActiveWorkflowInstance(directory)
      if (instance && action.type !== "none") {
        const definition = loadWorkflowDefinition(instance.definition_path)
        const currentStep = definition?.steps.find((step) => step.id === instance.current_step_id)
        if (currentStep) {
          const targetSessionId = sessionId ?? instance.session_ids.at(-1) ?? ""
          if (sessionId) {
            instance.session_ids = [sessionId]
            const wroteInstance = writeWorkflowInstance(directory, instance)
            if (!wroteInstance) {
              return action
            }
          }
          if (targetSessionId) {
            const projection = projectExecutionTransition({
              event: "resume_workflow",
              sessionId: targetSessionId,
              ownerRef: `${instance.instance_id}/${instance.current_step_id}`,
              executionRef: `${instance.instance_id}/${instance.current_step_id}`,
              executorAgent: currentStep.agent,
              foregroundAgent: currentStep.agent,
              currentLease: executionLeaseRepository.readExecutionLease(directory),
              currentSessionRuntime: executionLeaseRepository.readSessionRuntime(directory, targetSessionId),
            })

            if (projection.lease) {
              executionLeaseRepository.writeExecutionLease(directory, projection.lease)
            }
            if (projection.sessionRuntime) {
              executionLeaseRepository.writeSessionRuntime(directory, projection.sessionRuntime)
            }
          }
        }
      }

      return action
    },
    pauseWorkflow(directory, reason) {
      const instance = getActiveWorkflowInstance(directory)
      const paused = pauseWorkflow(directory, reason)
      if (paused && instance) {
        const sessionId = instance.session_ids.at(-1) ?? ""
        if (sessionId) {
          const projection = projectExecutionTransition({
            event: "pause_owner",
            sessionId,
            ownerRef: `${instance.instance_id}/${instance.current_step_id}`,
            executionRef: `${instance.instance_id}/${instance.current_step_id}`,
            currentLease: executionLeaseRepository.readExecutionLease(directory),
            currentSessionRuntime: executionLeaseRepository.readSessionRuntime(directory, sessionId),
          })

          if (projection.lease) {
            executionLeaseRepository.writeExecutionLease(directory, projection.lease)
          }
          if (projection.sessionRuntime) {
            executionLeaseRepository.writeSessionRuntime(directory, projection.sessionRuntime)
          }
        }
      }
      return paused
    },
    abortWorkflow(directory) {
      const instance = getActiveWorkflowInstance(directory)
      const aborted = abortWorkflow(directory)
      if (aborted && instance) {
        const sessionId = instance.session_ids.at(-1) ?? ""
        if (sessionId) {
          const projection = projectExecutionTransition({
            event: "clear_owner",
            sessionId,
            executionRef: `${instance.instance_id}/${instance.current_step_id}`,
            currentLease: executionLeaseRepository.readExecutionLease(directory),
            currentSessionRuntime: executionLeaseRepository.readSessionRuntime(directory, sessionId),
          })

          executionLeaseRepository.clearExecutionLease(directory)
          if (projection.sessionRuntime) {
            executionLeaseRepository.writeSessionRuntime(directory, projection.sessionRuntime)
          }
        }
      }
      return aborted
    },
  }
}

export type { WorkflowHookResult }
