import { resolve, isAbsolute, normalize, sep } from "path"
import { log } from "./log"

/**
 * Safely resolve a user-supplied directory path, ensuring it stays within the
 * project root (sandbox). Returns the resolved absolute path, or null if the
 * path escapes the sandbox.
 *
 * Security rules:
 * - Absolute paths are rejected (must be relative to projectRoot)
 * - Resolved path must start with projectRoot (prevents `../../` traversal)
 *
 * @param dir - User-supplied directory path (from config)
 * @param projectRoot - Project root to resolve relative paths against and sandbox within
 * @returns Resolved absolute path, or null if the path is rejected
 */
export function resolveSafePath(dir: string, projectRoot: string): string | null {
  // Reject absolute paths — custom dirs must be relative to project root
  if (isAbsolute(dir)) {
    log("Rejected absolute custom directory path", { dir })
    return null
  }

  const base = resolve(projectRoot)
  const resolvedPath = normalize(resolve(base, dir))

  // Ensure the resolved path stays within the project root (prevent traversal).
  // Use path.sep so this works correctly on both POSIX (/) and Windows (\).
  if (!resolvedPath.startsWith(base + sep) && resolvedPath !== base) {
    log("Rejected custom directory path — escapes project root", {
      dir,
      resolvedPath,
      projectRoot: base,
    })
    return null
  }

  return resolvedPath
}
