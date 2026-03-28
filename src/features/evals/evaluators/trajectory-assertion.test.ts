import { describe, expect, it } from "bun:test"
import { runTrajectoryAssertionEvaluator } from "./trajectory-assertion"
import type { EvalArtifacts, TrajectoryAssertionEvaluator, TrajectoryTrace } from "../types"

function makeTrace(overrides: Partial<TrajectoryTrace> = {}): TrajectoryTrace {
  return {
    scenarioId: "test",
    turns: [],
    delegationSequence: ["loom", "pattern", "loom"],
    totalTurns: 4,
    completedTurns: 4,
    ...overrides,
  }
}

function makeArtifacts(trace: TrajectoryTrace | null): EvalArtifacts {
  return {
    trace: trace ?? undefined,
  }
}

describe("runTrajectoryAssertionEvaluator", () => {
  describe("expectedSequence", () => {
    it("passes when sequence matches exactly", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        expectedSequence: ["loom", "pattern", "loom"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].message).toContain("matches")
    })

    it("fails when sequence does not match", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        expectedSequence: ["loom", "thread", "loom"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].message).toContain("mismatch")
    })

    it("fails when sequence length differs", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        expectedSequence: ["loom", "pattern"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
    })
  })

  describe("requiredAgents", () => {
    it("passes when all required agents are present", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        requiredAgents: ["pattern"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
    })

    it("fails when a required agent is missing", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        requiredAgents: ["thread"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].message).toContain("missing")
    })

    it("produces one result per required agent", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        requiredAgents: ["loom", "pattern", "thread"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(3)
      expect(results[0].passed).toBe(true)  // loom
      expect(results[1].passed).toBe(true)  // pattern
      expect(results[2].passed).toBe(false) // thread
    })
  })

  describe("forbiddenAgents", () => {
    it("passes when forbidden agents are absent", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        forbiddenAgents: ["spindle", "weft"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(2)
      expect(results.every((r) => r.passed)).toBe(true)
    })

    it("fails when a forbidden agent is present", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        forbiddenAgents: ["pattern"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].message).toContain("Forbidden agent present")
    })
  })

  describe("minTurns / maxTurns", () => {
    it("passes minTurns when completed turns meet threshold", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        minTurns: 4,
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
    })

    it("fails minTurns when completed turns below threshold", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        minTurns: 10,
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].message).toContain("below minimum")
    })

    it("passes maxTurns when completed turns within limit", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        maxTurns: 5,
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
    })

    it("fails maxTurns when completed turns exceed limit", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        maxTurns: 2,
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].message).toContain("exceeds maximum")
    })
  })

  describe("missing trace", () => {
    it("returns failing assertion when trace is missing", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        expectedSequence: ["loom"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, { trace: undefined })
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].message).toContain("missing or invalid")
    })

    it("returns failing assertion when trace is not a TrajectoryTrace", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        expectedSequence: ["loom"],
      }
      const results = runTrajectoryAssertionEvaluator(spec, { trace: { notATrace: true } })
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
    })
  })

  describe("no specific assertions", () => {
    it("verifies trace exists with completed turns", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].message).toContain("4 turns")
    })
  })

  describe("weight distribution", () => {
    it("distributes weight across assertion types", () => {
      const spec: TrajectoryAssertionEvaluator = {
        kind: "trajectory-assertion",
        weight: 2,
        expectedSequence: ["loom", "pattern", "loom"],
        minTurns: 4,
      }
      const results = runTrajectoryAssertionEvaluator(spec, makeArtifacts(makeTrace()))
      // 2 assertion types: expectedSequence + minTurns, so weight 2 / 2 = 1 each
      expect(results).toHaveLength(2)
      expect(results[0].maxScore).toBe(1)
      expect(results[1].maxScore).toBe(1)
    })
  })
})
