import type { CompletionContext } from "../../features/workflow"
import { checkAndAdvance } from "../../features/workflow"

export function checkWorkflowCompletion(directory: string, context: CompletionContext) {
  return checkAndAdvance({ directory, context })
}
