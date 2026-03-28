import { describe, expect, it } from "bun:test"
import { detectDelegation } from "./trajectory-run"

describe("detectDelegation", () => {
  it("detects [delegates to X] pattern", () => {
    expect(detectDelegation("Let me handle this. [delegates to pattern]")).toBe("pattern")
  })

  it("detects [delegate to X] pattern", () => {
    expect(detectDelegation("[delegate to thread]")).toBe("thread")
  })

  it("detects 'Delegating to X' pattern", () => {
    expect(detectDelegation("Delegating to Pattern for planning...")).toBe("pattern")
  })

  it("detects 'delegate to X' pattern in sentence", () => {
    expect(detectDelegation("I will delegate to warp for security review")).toBe("warp")
  })

  it("detects 'route to X' pattern", () => {
    expect(detectDelegation("Let me route to thread for this exploration")).toBe("thread")
  })

  it("detects 'routing to X' pattern", () => {
    expect(detectDelegation("Routing to warp for security audit")).toBe("warp")
  })

  it("is case-insensitive", () => {
    expect(detectDelegation("[DELEGATES TO PATTERN]")).toBe("pattern")
  })

  it("returns null when no delegation found", () => {
    expect(detectDelegation("Here is the answer to your question.")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(detectDelegation("")).toBeNull()
  })
})
