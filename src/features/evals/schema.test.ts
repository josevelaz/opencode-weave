import { describe, expect, it } from "bun:test"
import {
  EvalCaseSchema,
  EvalSuiteManifestSchema,
  TrajectoryScenarioSchema,
  TrajectoryTurnSchema,
  TrajectoryAssertionEvaluatorSchema,
} from "./schema"

describe("eval schemas", () => {
  it("validates a phase1 prompt-render case", () => {
    const result = EvalCaseSchema.safeParse({
      id: "loom-default-contract",
      title: "Loom default",
      phase: "prompt",
      target: { kind: "builtin-agent-prompt", agent: "loom" },
      executor: { kind: "prompt-render" },
      evaluators: [{ kind: "contains-all", patterns: ["<Role>"] }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects unknown kind values", () => {
    const result = EvalCaseSchema.safeParse({
      id: "bad",
      title: "Bad",
      phase: "prompt",
      target: { kind: "not-real", agent: "loom" },
      executor: { kind: "prompt-render" },
      evaluators: [{ kind: "contains-all", patterns: ["x"] }],
    })
    expect(result.success).toBe(false)
  })

  it("validates suite manifests", () => {
    const result = EvalSuiteManifestSchema.safeParse({
      id: "prompt-contracts",
      title: "Prompt contracts",
      phase: "prompt",
      caseFiles: ["evals/cases/loom/default-contract.jsonc"],
    })
    expect(result.success).toBe(true)
  })

  it("validates section-contains-all evaluator", () => {
    const result = EvalCaseSchema.safeParse({
      id: "loom-role-scope",
      title: "Loom role scoped contains",
      phase: "prompt",
      target: { kind: "builtin-agent-prompt", agent: "loom" },
      executor: { kind: "prompt-render" },
      evaluators: [{ kind: "section-contains-all", section: "Role", patterns: ["Loom"] }],
    })
    expect(result.success).toBe(true)
  })

  it("validates llm-judge evaluator with phrase checks", () => {
    const result = EvalCaseSchema.safeParse({
      id: "loom-phase2-judge",
      title: "Loom phase2 judge",
      phase: "routing",
      target: { kind: "builtin-agent-prompt", agent: "loom" },
      executor: { kind: "model-response", provider: "openai", model: "gpt-5", input: "test" },
      evaluators: [
        {
          kind: "llm-judge",
          rubricRef: "evals/rubrics/loom-routing-rubric.md",
          expectedContains: ["delegate"],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid model-response executor missing provider", () => {
    const result = EvalCaseSchema.safeParse({
      id: "phase2-invalid",
      title: "Invalid phase2",
      phase: "routing",
      target: { kind: "builtin-agent-prompt", agent: "loom" },
      executor: { kind: "model-response", model: "gpt-5", input: "test" },
      evaluators: [{ kind: "llm-judge" }],
    })
    expect(result.success).toBe(false)
  })

  describe("trajectory schemas", () => {
    it("validates a trajectory turn", () => {
      const result = TrajectoryTurnSchema.safeParse({
        turn: 1,
        role: "user",
        content: "Hello",
      })
      expect(result.success).toBe(true)
    })

    it("validates an assistant trajectory turn with all fields", () => {
      const result = TrajectoryTurnSchema.safeParse({
        turn: 2,
        role: "assistant",
        agent: "loom",
        content: "Delegating to pattern",
        mockResponse: "Let me delegate to Pattern for planning.",
        expectedDelegation: "pattern",
      })
      expect(result.success).toBe(true)
    })

    it("rejects trajectory turn with missing content", () => {
      const result = TrajectoryTurnSchema.safeParse({
        turn: 1,
        role: "user",
      })
      expect(result.success).toBe(false)
    })

    it("rejects trajectory turn with invalid role", () => {
      const result = TrajectoryTurnSchema.safeParse({
        turn: 1,
        role: "system",
        content: "Hello",
      })
      expect(result.success).toBe(false)
    })

    it("rejects trajectory turn with non-positive turn number", () => {
      const result = TrajectoryTurnSchema.safeParse({
        turn: 0,
        role: "user",
        content: "Hello",
      })
      expect(result.success).toBe(false)
    })

    it("validates a complete trajectory scenario", () => {
      const result = TrajectoryScenarioSchema.safeParse({
        id: "test-scenario",
        title: "Test Scenario",
        description: "A test scenario",
        agents: ["loom", "pattern"],
        turns: [
          { turn: 1, role: "user", content: "Build a feature" },
          { turn: 2, role: "assistant", agent: "loom", content: "Delegating", mockResponse: "mock" },
        ],
      })
      expect(result.success).toBe(true)
    })

    it("rejects trajectory scenario with empty agents", () => {
      const result = TrajectoryScenarioSchema.safeParse({
        id: "bad-scenario",
        title: "Bad",
        agents: [],
        turns: [
          { turn: 1, role: "user", content: "Hello" },
          { turn: 2, role: "assistant", content: "Hi" },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("rejects trajectory scenario with fewer than 2 turns", () => {
      const result = TrajectoryScenarioSchema.safeParse({
        id: "too-short",
        title: "Too Short",
        agents: ["loom"],
        turns: [{ turn: 1, role: "user", content: "Hello" }],
      })
      expect(result.success).toBe(false)
    })

    it("rejects trajectory scenario with missing id", () => {
      const result = TrajectoryScenarioSchema.safeParse({
        title: "No ID",
        agents: ["loom"],
        turns: [
          { turn: 1, role: "user", content: "Hello" },
          { turn: 2, role: "assistant", content: "Hi" },
        ],
      })
      expect(result.success).toBe(false)
    })

    it("validates trajectory-assertion evaluator with all optional fields", () => {
      const result = TrajectoryAssertionEvaluatorSchema.safeParse({
        kind: "trajectory-assertion",
        expectedSequence: ["loom", "pattern", "loom"],
        requiredAgents: ["pattern"],
        forbiddenAgents: ["spindle"],
        minTurns: 3,
        maxTurns: 10,
        weight: 2,
      })
      expect(result.success).toBe(true)
    })

    it("validates trajectory-assertion evaluator with only kind", () => {
      const result = TrajectoryAssertionEvaluatorSchema.safeParse({
        kind: "trajectory-assertion",
      })
      expect(result.success).toBe(true)
    })

    it("rejects trajectory-assertion with invalid minTurns", () => {
      const result = TrajectoryAssertionEvaluatorSchema.safeParse({
        kind: "trajectory-assertion",
        minTurns: -1,
      })
      expect(result.success).toBe(false)
    })

    it("rejects trajectory-assertion with non-integer maxTurns", () => {
      const result = TrajectoryAssertionEvaluatorSchema.safeParse({
        kind: "trajectory-assertion",
        maxTurns: 2.5,
      })
      expect(result.success).toBe(false)
    })

    it("validates a phase3 trajectory eval case", () => {
      const result = EvalCaseSchema.safeParse({
        id: "trajectory-test",
        title: "Trajectory Test",
        phase: "trajectory",
        target: { kind: "trajectory-agent", agent: "loom", scenarioRef: "evals/scenarios/test.jsonc" },
        executor: { kind: "trajectory-run", scenarioRef: "evals/scenarios/test.jsonc" },
        evaluators: [
          {
            kind: "trajectory-assertion",
            expectedSequence: ["loom", "pattern"],
            requiredAgents: ["pattern"],
          },
        ],
      })
      expect(result.success).toBe(true)
    })
  })
})
