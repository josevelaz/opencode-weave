import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { loadPromptFile } from "./prompt-loader"

const TEST_DIR = join(process.cwd(), ".test-prompt-loader")

describe("loadPromptFile", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it("loads a prompt from an absolute path", () => {
    const filePath = join(TEST_DIR, "prompt.md")
    writeFileSync(filePath, "You are a helpful assistant.")
    const result = loadPromptFile(filePath)
    expect(result).toBe("You are a helpful assistant.")
  })

  it("loads a prompt from a relative path with basePath", () => {
    const filePath = join(TEST_DIR, "agent-prompt.md")
    writeFileSync(filePath, "Custom agent prompt content")
    const result = loadPromptFile("agent-prompt.md", TEST_DIR)
    expect(result).toBe("Custom agent prompt content")
  })

  it("returns null for non-existent file", () => {
    const result = loadPromptFile(join(TEST_DIR, "does-not-exist.md"))
    expect(result).toBeNull()
  })

  it("trims whitespace from loaded content", () => {
    const filePath = join(TEST_DIR, "whitespace.md")
    writeFileSync(filePath, "  prompt with whitespace  \n\n")
    const result = loadPromptFile(filePath)
    expect(result).toBe("prompt with whitespace")
  })

  it("handles multiline markdown content", () => {
    const filePath = join(TEST_DIR, "multi.md")
    const content = "<Role>\nYou are a code reviewer.\n</Role>\n\n<Rules>\nBe thorough.\n</Rules>"
    writeFileSync(filePath, content)
    const result = loadPromptFile(filePath)
    expect(result).toBe(content)
  })
})
