import type { WeaveConfig } from "./schema"
import { createConfigFsLoader } from "../infrastructure/fs/config-fs-loader"

export type { ConfigDiagnostic, ConfigLoadResult } from "../infrastructure/fs/config-fs-loader"

const DefaultConfigLoader = createConfigFsLoader()

export function getLastConfigLoadResult() {
  return DefaultConfigLoader.getLastConfigLoadResult()
}

export function loadWeaveConfig(
  directory: string,
  ctx?: unknown,
  homeDir?: string,
): WeaveConfig {
  return DefaultConfigLoader.loadWeaveConfig(directory, ctx, homeDir)
}
