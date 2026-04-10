import { WORKFLOW_CONTINUATION_MARKER } from "../../features/workflow"
import { renderContinuationEnvelope } from "../../runtime/opencode/protocol"

export function buildWorkflowContinuationPrompt(args: {
  sessionId: string
  body: string
}): string {
  return `${renderContinuationEnvelope({ continuation: "workflow", sessionId: args.sessionId })}
${WORKFLOW_CONTINUATION_MARKER}
${args.body}`
}
