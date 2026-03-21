import { describe, expect, it } from "bun:test"
import { EvalCaseSchema, EvalSuiteManifestSchema } from "./schema"

describe("eval schemas", () => {
  it("validates a phase1 prompt-render case", () => {
    const result = EvalCaseSchema.safeParse({
      id: "loom-default-contract",
      title: "Loom default",
      phase: "phase1",
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
      phase: "phase1",
      target: { kind: "not-real", agent: "loom" },
      executor: { kind: "prompt-render" },
      evaluators: [{ kind: "contains-all", patterns: ["x"] }],
    })
    expect(result.success).toBe(false)
  })

  it("validates suite manifests", () => {
    const result = EvalSuiteManifestSchema.safeParse({
      id: "phase1-core",
      title: "Phase 1",
      phase: "phase1",
      caseFiles: ["evals/cases/loom/default-contract.jsonc"],
    })
    expect(result.success).toBe(true)
  })

  it("validates section-contains-all evaluator", () => {
    const result = EvalCaseSchema.safeParse({
      id: "loom-role-scope",
      title: "Loom role scoped contains",
      phase: "phase1",
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
      phase: "phase2",
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
      phase: "phase2",
      target: { kind: "builtin-agent-prompt", agent: "loom" },
      executor: { kind: "model-response", model: "gpt-5", input: "test" },
      evaluators: [{ kind: "llm-judge" }],
    })
    expect(result.success).toBe(false)
  })
})
