import { readFileSync, existsSync } from "fs"
import { resolve, isAbsolute } from "path"

/**
 * Load a prompt from a file path. Supports .md and .txt files.
 *
 * @param promptFilePath - Path to the prompt file (absolute or relative to basePath)
 * @param basePath - Base directory for resolving relative paths (defaults to cwd)
 * @returns The file contents as a string, or null if the file doesn't exist
 */
export function loadPromptFile(promptFilePath: string, basePath?: string): string | null {
  const resolvedPath = isAbsolute(promptFilePath)
    ? promptFilePath
    : resolve(basePath ?? process.cwd(), promptFilePath)

  if (!existsSync(resolvedPath)) {
    return null
  }

  return readFileSync(resolvedPath, "utf-8").trim()
}
