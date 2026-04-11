import type { CompletionContext } from "../../features/workflow"
import { checkAndAdvance, getActiveWorkflowInstance, loadWorkflowDefinition } from "../../features/workflow"
import { createExecutionLeaseFsStore } from "../../infrastructure/fs/execution-lease-fs-store"
import { projectExecutionTransition } from "../session/execution-lease"

const ExecutionLeaseRepository = createExecutionLeaseFsStore()

export function checkWorkflowCompletion(directory: string, context: CompletionContext) {
  const action = checkAndAdvance({ directory, context })
  const instance = getActiveWorkflowInstance(directory)

  if (action.type === "inject_prompt" && instance) {
    const definition = loadWorkflowDefinition(instance.definition_path)
    const currentStep = definition?.steps.find((step) => step.id === instance.current_step_id)
    const sessionId = instance.session_ids.at(-1)

    if (currentStep && sessionId) {
      const projection = projectExecutionTransition({
        event: "advance_workflow_step",
        sessionId,
        ownerRef: `${instance.instance_id}/${instance.current_step_id}`,
        executionRef: `${instance.instance_id}/${instance.current_step_id}`,
        executorAgent: currentStep.agent,
        foregroundAgent: currentStep.agent,
        currentLease: ExecutionLeaseRepository.readExecutionLease(directory),
        currentSessionRuntime: ExecutionLeaseRepository.readSessionRuntime(directory, sessionId),
      })

      if (projection.lease) {
        ExecutionLeaseRepository.writeExecutionLease(directory, projection.lease)
      }
      if (projection.sessionRuntime) {
        ExecutionLeaseRepository.writeSessionRuntime(directory, projection.sessionRuntime)
      }

      return { ...action, agent: currentStep.agent }
    }
  }

  if ((action.type === "pause" || action.type === "complete") && instance) {
    const sessionId = instance.session_ids.at(-1)
    if (sessionId) {
      const projection = projectExecutionTransition({
        event: action.type === "pause" ? "pause_owner" : "complete_owner",
        sessionId,
        executionRef: `${instance.instance_id}/${instance.current_step_id}`,
        currentLease: ExecutionLeaseRepository.readExecutionLease(directory),
        currentSessionRuntime: ExecutionLeaseRepository.readSessionRuntime(directory, sessionId),
      })

      if (action.type === "complete") {
        ExecutionLeaseRepository.clearExecutionLease(directory)
      } else if (projection.lease) {
        ExecutionLeaseRepository.writeExecutionLease(directory, projection.lease)
      }

      if (projection.sessionRuntime) {
        ExecutionLeaseRepository.writeSessionRuntime(directory, projection.sessionRuntime)
      }
    }
  }

  return action
}
