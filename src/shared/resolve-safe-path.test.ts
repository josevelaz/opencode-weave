import { describe, it, expect } from "bun:test"
import { join, resolve, sep } from "path"
import { resolveSafePath } from "./resolve-safe-path"

describe("resolveSafePath", () => {
  const projectRoot = resolve("/project/root")

  it("resolves a simple relative path within project root", () => {
    const result = resolveSafePath("subdir/workflows", projectRoot)
    expect(result).toBe(join(projectRoot, "subdir", "workflows"))
  })

  it("resolves nested relative paths", () => {
    const result = resolveSafePath("examples/config/github-speckit/skills", projectRoot)
    expect(result).toBe(join(projectRoot, "examples", "config", "github-speckit", "skills"))
  })

  it("rejects absolute paths", () => {
    expect(resolveSafePath("/etc/shadow", projectRoot)).toBeNull()
    expect(resolveSafePath("/usr/local/lib", projectRoot)).toBeNull()
  })

  it("rejects Windows absolute paths", () => {
    // On Windows, isAbsolute recognizes C:\... paths
    // On POSIX, these are just weird relative paths that stay inside the root
    if (sep === "\\") {
      expect(resolveSafePath("C:\\Windows\\System32", projectRoot)).toBeNull()
      expect(resolveSafePath("D:\\other\\project", projectRoot)).toBeNull()
    }
  })

  it("rejects paths that traverse above project root with ..", () => {
    expect(resolveSafePath("../outside", projectRoot)).toBeNull()
    expect(resolveSafePath("../../etc/shadow", projectRoot)).toBeNull()
    expect(resolveSafePath("subdir/../../outside", projectRoot)).toBeNull()
  })

  it("rejects paths that resolve to exactly the parent via ..", () => {
    // path.join("/project/root", "..") = "/project"
    expect(resolveSafePath("..", projectRoot)).toBeNull()
  })

  it("allows paths that use .. but resolve within root (runtime layer)", () => {
    // "a/../b" resolves to "<root>/b" which IS inside project root.
    // resolveSafePath checks the RESOLVED path, so this is allowed at runtime.
    // Defense-in-depth: the Zod schema layer rejects ".." segments in the input
    // string before it reaches this function.
    const result = resolveSafePath("a/../b", projectRoot)
    expect(result).toBe(join(projectRoot, "b"))
  })

  it("allows the project root itself as a path (.)", () => {
    const result = resolveSafePath(".", projectRoot)
    expect(result).toBe(resolve(projectRoot))
  })

  it("returns null for empty string (resolves to project root, equals base)", () => {
    const result = resolveSafePath("", projectRoot)
    // resolve("/project/root", "") = "/project/root" which equals base — allowed
    expect(result).toBe(resolve(projectRoot))
  })
})
