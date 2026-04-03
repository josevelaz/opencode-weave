import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { parse } from "jsonc-parser"
import { WeaveConfigSchema, type WeaveConfig } from "./schema"
import type { DeepPartial } from "../shared/types"
import { mergeConfigs } from "./merge"
import { warn, error as logError, debug } from "../shared/log"

function readJsoncFile(filePath: string): DeepPartial<WeaveConfig> {
  try {
    const text = readFileSync(filePath, "utf-8")
    const errors: { error: number; offset: number; length: number }[] = []
    const parsed = parse(text, errors) as DeepPartial<WeaveConfig> | null
    if (errors.length > 0) {
      warn(`JSONC parse warnings in ${filePath}: ${errors.length} issue(s)`)
    }
    return parsed ?? {}
  } catch (e) {
    logError(`Failed to read config file ${filePath}`, e)
    return {}
  }
}

function detectConfigFile(basePath: string): string | null {
  const jsoncPath = basePath + ".jsonc"
  if (existsSync(jsoncPath)) return jsoncPath
  const jsonPath = basePath + ".json"
  if (existsSync(jsonPath)) return jsonPath
  return null
}

export function loadWeaveConfig(
  directory: string,
  _ctx?: unknown,
  _homeDir?: string,
): WeaveConfig {
  const userBasePath = join(_homeDir ?? homedir(), ".config", "opencode", "weave-opencode")
  const projectBasePath = join(directory, ".opencode", "weave-opencode")

  const userConfigPath = detectConfigFile(userBasePath)
  const projectConfigPath = detectConfigFile(projectBasePath)

  debug("Loading Weave config", {
    userConfig: userConfigPath ?? "(none)",
    projectConfig: projectConfigPath ?? "(none)",
  })

  const userRaw: DeepPartial<WeaveConfig> = userConfigPath
    ? readJsoncFile(userConfigPath)
    : {}

  const projectRaw: DeepPartial<WeaveConfig> = projectConfigPath
    ? readJsoncFile(projectConfigPath)
    : {}

  const merged = mergeConfigs(userRaw, projectRaw)

  const result = WeaveConfigSchema.safeParse(merged)
  if (!result.success) {
    logError(
      "WeaveConfig validation errors — using defaults",
      result.error.issues,
    )
    return WeaveConfigSchema.parse({})
  }

  debug("Weave config loaded successfully", {
    hasAgentOverrides: !!result.data.agents && Object.keys(result.data.agents).length > 0,
    disabledAgents: result.data.disabled_agents ?? [],
    customAgents: result.data.custom_agents ? Object.keys(result.data.custom_agents) : [],
    logLevel: result.data.log_level ?? "(default)",
    analyticsEnabled: result.data.analytics?.enabled ?? false,
  })

  return result.data
}
