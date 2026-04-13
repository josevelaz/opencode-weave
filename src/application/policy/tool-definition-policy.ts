import { applyTodoDescriptionOverride } from "../../hooks/todo-description-override"
import type { RuntimePolicyFlags } from "./runtime-policy"

export interface ToolDefinitionPolicyInput {
  toolId: string
  hooks: RuntimePolicyFlags
  output: {
    description: string
    parameters?: unknown
  }
}

export interface ToolDefinitionPolicy {
  onToolDefinition(input: ToolDefinitionPolicyInput): void | Promise<void>
}

export function createTodoDescriptionToolDefinitionPolicy(): ToolDefinitionPolicy {
  return {
    onToolDefinition(input) {
      if (input.hooks.todoDescriptionOverrideEnabled) {
        applyTodoDescriptionOverride({ toolID: input.toolId }, input.output)
      }
    },
  }
}
