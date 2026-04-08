import type { AgentMode, AgentModelResolutionSource, AgentRuntimeModelPlan, WeaveAgentName } from "./types"
import { debug, warn } from "../shared/log"

export type FallbackEntry = {
  providers: string[]
  model: string
  variant?: string
}

export type AgentModelRequirement = {
  fallbackChain: FallbackEntry[]
}

export const AGENT_MODEL_REQUIREMENTS: Record<WeaveAgentName, AgentModelRequirement> = {
  loom: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "claude-opus-4.6" },
      { providers: ["anthropic"], model: "claude-opus-4" },
      { providers: ["openai"], model: "gpt-5" },
    ],
  },
  tapestry: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "claude-sonnet-4.6" },
      { providers: ["anthropic"], model: "claude-sonnet-4" },
      { providers: ["openai"], model: "gpt-5" },
    ],
  },
  shuttle: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "claude-sonnet-4.6" },
      { providers: ["anthropic"], model: "claude-sonnet-4" },
      { providers: ["openai"], model: "gpt-5" },
    ],
  },
  pattern: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "claude-opus-4.6" },
      { providers: ["anthropic"], model: "claude-opus-4" },
      { providers: ["openai"], model: "gpt-5" },
    ],
  },
  thread: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "claude-haiku-4.5" },
      { providers: ["anthropic"], model: "claude-haiku-4" },
      { providers: ["google"], model: "gemini-3-flash" },
    ],
  },
  spindle: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "claude-haiku-4.5" },
      { providers: ["anthropic"], model: "claude-haiku-4" },
      { providers: ["google"], model: "gemini-3-flash" },
    ],
  },
  weft: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "claude-sonnet-4.6" },
      { providers: ["anthropic"], model: "claude-sonnet-4" },
      { providers: ["openai"], model: "gpt-5" },
    ],
  },
  warp: {
    fallbackChain: [
      { providers: ["github-copilot"], model: "claude-opus-4.6" },
      { providers: ["anthropic"], model: "claude-opus-4" },
      { providers: ["openai"], model: "gpt-5" },
    ],
  },
}

export type ResolveAgentModelOptions = {
  availableModels: Set<string>
  agentMode: AgentMode
  uiSelectedModel?: string
  categoryModel?: string
  overrideModel?: string
  systemDefaultModel?: string
  /** Optional fallback chain override from config */
  customFallbackChain?: FallbackEntry[]
}

export type ResolveAgentModelResult = AgentRuntimeModelPlan

function pushUniqueModel(models: string[], model: string | undefined): void {
  if (!model) return
  if (!models.includes(model)) {
    models.push(model)
  }
}

function resolveFallbackChainModels(fallbackChain: FallbackEntry[] | undefined, availableModels: Set<string>): { orderedModels: string[], selectedFallbackModel?: string } {
  const orderedModels: string[] = []
  let selectedFallbackModel: string | undefined

  if (!fallbackChain) {
    return { orderedModels, selectedFallbackModel }
  }

  for (const entry of fallbackChain) {
    let entryMatched = false

    for (const provider of entry.providers) {
      const qualified = `${provider}/${entry.model}`

      if (availableModels.has(qualified)) {
        pushUniqueModel(orderedModels, qualified)
        if (!selectedFallbackModel) {
          selectedFallbackModel = qualified
        }
        entryMatched = true
        break
      }
    }

    if (entryMatched) {
      continue
    }

    if (availableModels.has(entry.model)) {
      pushUniqueModel(orderedModels, entry.model)
      if (!selectedFallbackModel) {
        selectedFallbackModel = entry.model
      }
      continue
    }

    for (const provider of entry.providers) {
      pushUniqueModel(orderedModels, `${provider}/${entry.model}`)
    }
    pushUniqueModel(orderedModels, entry.model)
  }

  return { orderedModels, selectedFallbackModel }
}

export function resolveAgentModelPlan(agentName: string, options: ResolveAgentModelOptions): ResolveAgentModelResult {
  const { availableModels, agentMode, uiSelectedModel, categoryModel, overrideModel, systemDefaultModel, customFallbackChain } = options
  const requirement = AGENT_MODEL_REQUIREMENTS[agentName as WeaveAgentName] as AgentModelRequirement | undefined
  const fallbackChain = customFallbackChain ?? requirement?.fallbackChain
  const { orderedModels: fallbackOrderedModels, selectedFallbackModel } = resolveFallbackChainModels(fallbackChain, availableModels)

  let selectedModel: string
  let resolutionSource: AgentModelResolutionSource

  if (overrideModel) {
    selectedModel = overrideModel
    resolutionSource = "override"
  } else if (uiSelectedModel && (agentMode === "primary" || agentMode === "all")) {
    selectedModel = uiSelectedModel
    resolutionSource = "ui-selection"
  } else if (categoryModel && availableModels.has(categoryModel)) {
    selectedModel = categoryModel
    resolutionSource = "category"
  } else if (selectedFallbackModel) {
    selectedModel = selectedFallbackModel
    resolutionSource = "fallback-chain"
  } else if (systemDefaultModel) {
    selectedModel = systemDefaultModel
    resolutionSource = "system-default"
  } else if (fallbackOrderedModels.length > 0) {
    selectedModel = fallbackOrderedModels[0]
    resolutionSource = "offline-guess"
  } else {
    selectedModel = "github-copilot/claude-opus-4.6"
    resolutionSource = "hardcoded-default"
  }

  const orderedModels: string[] = []
  pushUniqueModel(orderedModels, selectedModel)
  for (const model of fallbackOrderedModels) {
    pushUniqueModel(orderedModels, model)
  }
  if (systemDefaultModel) {
    pushUniqueModel(orderedModels, systemDefaultModel)
  }
  pushUniqueModel(orderedModels, "github-copilot/claude-opus-4.6")

  const fallbackModels = orderedModels.filter((model) => model !== selectedModel)

  debug(`Model resolved for "${agentName}"`, {
    via: resolutionSource,
    model: selectedModel,
    agentMode,
  })

  if (resolutionSource === "hardcoded-default") {
    warn(`No model resolved for agent "${agentName}" — falling back to default github-copilot/claude-opus-4.6`, { agentName })
  }

  return {
    agentName,
    selectedModel,
    orderedModels,
    fallbackModels,
    resolutionSource,
  }
}

/**
 * Parse fallback_models strings like ["github-copilot/claude-sonnet-4.6", "anthropic/claude-sonnet-4"]
 * into model-resolution fallback entries.
 */
export function parseFallbackModels(models: string[]): FallbackEntry[] {
  return models.map((model) => {
    if (model.includes("/")) {
      const [provider, unqualifiedModel] = model.split("/", 2)
      return { providers: [provider], model: unqualifiedModel }
    }

    return { providers: ["github-copilot"], model }
  })
}

/**
 * Resolve the model for an agent. Accepts any string agent name.
 * Built-in agents use AGENT_MODEL_REQUIREMENTS for fallback chains unless
 * config provides a fallback override. Custom agents use the
 * customFallbackChain option, or fall through
 * to system default / hardcoded fallback.
 */
export function resolveAgentModel(agentName: string, options: ResolveAgentModelOptions): string {
  return resolveAgentModelPlan(agentName, options).selectedModel
}
