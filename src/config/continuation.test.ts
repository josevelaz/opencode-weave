import { describe, expect, it } from "bun:test"
import { resolveContinuationConfig, hasIdleContinuationEnabled } from "./continuation"

describe("resolveContinuationConfig", () => {
  it("uses built-in defaults when continuation config is omitted", () => {
    expect(resolveContinuationConfig()).toEqual({
      recovery: { compaction: true },
      idle: {
        enabled: false,
        work: false,
        workflow: false,
        todo_prompt: false,
      },
    })
  })

  it("inherits idle child flags from idle.enabled when they are omitted", () => {
    expect(resolveContinuationConfig({ idle: { enabled: true, workflow: false } })).toEqual({
      recovery: { compaction: true },
      idle: {
        enabled: true,
        work: true,
        workflow: false,
        todo_prompt: true,
      },
    })
  })

  it("preserves explicit child overrides over the idle.enabled parent", () => {
    expect(
      resolveContinuationConfig({
        recovery: { compaction: false },
        idle: { enabled: false, work: true, todo_prompt: true },
      }),
    ).toEqual({
      recovery: { compaction: false },
      idle: {
        enabled: false,
        work: true,
        workflow: false,
        todo_prompt: true,
      },
    })
  })
})

describe("hasIdleContinuationEnabled", () => {
  it("returns false when all idle flags resolve to false", () => {
    expect(hasIdleContinuationEnabled()).toBe(false)
  })

  it("returns true when any idle continuation path is enabled", () => {
    expect(hasIdleContinuationEnabled({ idle: { todo_prompt: true } })).toBe(true)
  })
})
