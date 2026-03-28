# Trajectory Eval System (Phase 3)

## TL;DR
> **Summary**: Implement multi-turn trajectory evals that validate full delegation chains (e.g., user → Loom → Pattern → plan → Loom report-back) by building a trajectory executor, scenario file format, and sequence-matching evaluators on top of the existing Phase 1/2 eval harness.
> **Estimated Effort**: Large

## Context
### Original Request
Build trajectory/multi-step evals that test full delegation chains. Currently we only test single-turn routing (Phase 1: prompt contracts, Phase 2: single-message routing decisions). Trajectory evals would validate multi-turn agent orchestration — e.g., "user asks complex question → Loom delegates to Pattern → Pattern produces plan → Loom reports back".

### Key Findings

**Existing infrastructure is well-prepared for extension:**
- `types.ts` already defines `TrajectoryAgentTarget` (kind: `"trajectory-agent"`, with `agent` + `scenarioRef`), `TrajectoryRunExecutor` (kind: `"trajectory-run"`, with `scenarioRef`), and `TrajectoryAssertionEvaluator` (kind: `"trajectory-assertion"`, with `assertionRef`). All three are stubbed with "reserved for a later phase" errors in the runner, deterministic evaluator, and target resolver.
- `schema.ts` already has Zod schemas for all three: `TrajectoryAgentTargetSchema`, `TrajectoryRunExecutorSchema`, `TrajectoryAssertionEvaluatorSchema`. No schema changes needed.
- `EvalArtifacts` already has a `trace?: unknown` field — perfect for storing trajectory execution traces.
- `EvalPhase` includes `"phase3"` and `"phase4"` already.
- The runner's `resolveTarget` and `executeCase` functions use exhaustive switches with clear extension points.

**Delegation chain mechanics:**
- Loom's prompt (`prompt-composer.ts`) defines a clear delegation protocol: Loom routes to specialists (Thread, Pattern, Spindle, etc.) via Task tool calls, and specialists return results.
- The delegation flow for planning is: Loom → Pattern (produces `.weave/plans/{name}.md`) → optional Weft/Warp review → `/start-work` → Tapestry executes.
- Agent names in Loom's prompt are lowercase: `thread`, `pattern`, `spindle`, `warp`, `weft`, `shuttle`.

**Mock vs. live execution:**
- Phase 2's `model-response` executor uses `WEAVE_EVAL_MOCK_RESPONSES` env var for mock responses (JSON map of `provider/model` → response string).
- The GitHub Models eval spike (`script/eval-spike-github-models.ts`) demonstrates live API calls against real models.
- Trajectory evals need a multi-turn mock mechanism: a sequence of canned responses (one per turn), not just a single response.

**Existing case structure:**
- Cases are JSONC files in `evals/cases/{agent}/` with suite manifests in `evals/suites/`.
- Phase 2 cases reference rubrics from `evals/rubrics/`.
- Trajectory scenarios are more complex — they need a multi-step scenario definition separate from the case file.

**Dependency:**
- This plan assumes the "backport spike to Phase 2" work has landed, meaning the `model-response` executor path is stable and potentially supports live mode (not just mock). If that work hasn't landed, the trajectory executor should still be buildable on top of mock-only mode.

## Objectives
### Core Objective
Enable multi-turn trajectory evals that validate delegation sequences, inter-agent handoffs, and end-to-end orchestration quality — starting with a practical mock-driven pilot for the 3 most common Loom delegation patterns.

### Deliverables
- [ ] Trajectory scenario file format (`.jsonc` files in `evals/scenarios/`)
- [ ] Trajectory executor implementation (`src/features/evals/executors/trajectory-run.ts`)
- [ ] Trajectory target resolver (extend `resolveTarget` in `runner.ts`)
- [ ] Trajectory assertion evaluator (`src/features/evals/evaluators/trajectory-assertion.ts`)
- [ ] 3–5 representative trajectory eval cases in `evals/cases/trajectory/`
- [ ] A `phase3-trajectory-pilot` suite manifest
- [ ] Unit tests for the executor and evaluator
- [ ] Updated `EvalArtifacts` type with trajectory-specific fields

### Definition of Done
- [ ] `bun run eval --suite phase3-trajectory-pilot` runs and produces results with no errors
- [ ] All existing Phase 1/2 suites still pass: `bun run eval --suite phase1-core && bun run eval --suite pr-smoke`
- [ ] Trajectory eval cases validate delegation sequences (correct agent order, no missing steps)
- [ ] Mock mode works without any env vars or API credentials
- [ ] `bun test` passes with trajectory executor and evaluator unit tests

### Guardrails (Must NOT)
- Must NOT break existing Phase 1/2 eval infrastructure (runner, loader, schema, reporter, baseline)
- Must NOT introduce new npm dependencies
- Must NOT require live API credentials for the pilot — mock mode must be the default
- Must NOT persist API keys, tokens, or secrets in scenario files or artifacts
- Must NOT modify existing eval case files or suite manifests
- Must NOT change the `EvalCaseSchema` or `EvalSuiteManifestSchema` in backward-incompatible ways

## Design

### 1. Trajectory Scenario File Format

Trajectory scenarios live in `evals/scenarios/` as `.jsonc` files. A scenario defines the multi-turn conversation script with canned responses for each turn.

```jsonc
// evals/scenarios/loom-delegates-to-pattern.jsonc
{
  "id": "loom-delegates-to-pattern",
  "title": "Loom delegates complex planning to Pattern",
  "description": "User asks for a multi-file feature → Loom identifies planning need → delegates to Pattern → Pattern produces plan → Loom summarizes",
  "agents": ["loom", "pattern"],
  "turns": [
    {
      "turn": 1,
      "role": "user",
      "content": "I need to add a webhook system with event types, delivery tracking, retry logic, and a management UI."
    },
    {
      "turn": 2,
      "role": "assistant",
      "agent": "loom",
      "content": "This is a substantial multi-component feature that needs planning before implementation. I'll delegate to Pattern to create a detailed plan.\n\n[delegates to pattern]",
      "expectedDelegation": "pattern",
      "mockResponse": "This is a substantial multi-component feature. Let me delegate to Pattern to create a detailed implementation plan before we start building.\n\n*Delegating to Pattern for planning...*"
    },
    {
      "turn": 3,
      "role": "assistant",
      "agent": "pattern",
      "content": "# Webhook System Plan\n\n## Deliverables\n- Event type registry\n- Delivery tracking...",
      "mockResponse": "# Webhook System Plan\n\n## TL;DR\n> Add a webhook system with event registry, delivery tracking, retry logic, and management UI.\n\n## Deliverables\n- [ ] Event type registry with schema validation\n- [ ] Delivery tracking with status history\n- [ ] Exponential backoff retry logic\n- [ ] Management UI for webhook endpoints\n\nPlan saved to `.weave/plans/webhook-system.md`."
    },
    {
      "turn": 4,
      "role": "assistant",
      "agent": "loom",
      "content": "Pattern has created a plan for the webhook system...",
      "mockResponse": "Pattern has created a detailed plan for the webhook system at `.weave/plans/webhook-system.md`. The plan covers:\n\n- Event type registry with schema validation\n- Delivery tracking with status history\n- Retry logic with exponential backoff\n- Management UI\n\nRun `/start-work` when you're ready to begin execution."
    }
  ]
}
```

**Key design decisions:**
- `turns` is the ordered sequence. Each turn has a `role` (`user` or `assistant`) and optionally an `agent` name.
- `mockResponse` is the canned response used in mock mode. In live mode, this field is ignored and the real model is called.
- `expectedDelegation` on a turn marks that this turn should trigger a delegation to the named agent. This is the primary assertion input.
- The scenario is referenced from eval cases via `scenarioRef` (already in the existing type).

### 2. Trajectory-Specific Artifact Extensions

The `EvalArtifacts` type needs trajectory-specific fields. The existing `trace?: unknown` field will carry the structured trace.

```typescript
// Extend EvalArtifacts (in types.ts)
export interface TrajectoryTrace {
  scenarioId: string
  turns: TrajectoryTurnResult[]
  delegationSequence: string[]       // observed delegation sequence
  totalTurns: number
  completedTurns: number
}

export interface TrajectoryTurnResult {
  turn: number
  agent: string
  role: "user" | "assistant"
  response: string                    // actual response (mock or live)
  expectedDelegation?: string
  observedDelegation?: string | null
  durationMs: number
}
```

The `trace` field on `EvalArtifacts` stores the `TrajectoryTrace`. Additionally, `modelOutput` is set to a concatenation of all assistant responses (for compatibility with existing evaluators like `contains-all` that read `modelOutput`).

### 3. Trajectory Scenario Loader

A new loader function in `loader.ts` (or a dedicated `scenario-loader.ts`) that:
- Reads scenario `.jsonc` files from `evals/scenarios/`
- Validates against a `TrajectoryScenarioSchema` (new Zod schema)
- Resolves `scenarioRef` paths the same way case file paths are resolved

### 4. Trajectory Target Resolver

Extend `resolveTarget` in `runner.ts` to handle `trajectory-agent`:

```typescript
case "trajectory-agent": {
  // Load the scenario file to get the primary agent's prompt
  // Resolve the primary agent's prompt (reuse resolveBuiltinAgentTarget logic)
  // Return resolved target with the rendered prompt as artifacts
}
```

The trajectory target resolves the *primary* agent's prompt (the first agent in the scenario, typically Loom). This ensures that prompt-level evaluators can still run against the orchestrator's prompt.

### 5. Trajectory Executor

New file: `src/features/evals/executors/trajectory-run.ts`

The executor:
1. Loads the scenario file referenced by `executor.scenarioRef`
2. Iterates through turns sequentially
3. In **mock mode** (default): uses `mockResponse` from each turn
4. In **live mode** (future): calls the model with accumulated conversation history
5. For each assistant turn, extracts the observed delegation (by pattern matching for agent names or delegation markers in the response)
6. Builds a `TrajectoryTrace` with the full turn-by-turn record
7. Returns `EvalArtifacts` with `trace`, `modelOutput` (concatenated), and `renderedPrompt` (primary agent)

**Delegation detection heuristic (mock mode):**
For the pilot, delegation detection in mock mode is straightforward — the mock responses are authored to contain known delegation signals. The executor scans each response for patterns like:
- `"[delegates to {agent}]"` — explicit marker in mock responses
- `"Delegating to {agent}"` or `"delegate to {agent}"` — natural language
- `"Use {agent}"` — Loom's prompt language

This is intentionally simple for the pilot. Live mode would need richer signal extraction (e.g., parsing tool-call arguments).

**Mock response resolution:**
Unlike Phase 2's `WEAVE_EVAL_MOCK_RESPONSES` env var (which maps model keys to single responses), trajectory mock responses are embedded in the scenario file itself. This is cleaner for multi-turn scripts where each turn's mock is scenario-specific.

### 6. Trajectory Assertion Evaluator

New file: `src/features/evals/evaluators/trajectory-assertion.ts`

The evaluator reads the `TrajectoryTrace` from `artifacts.trace` and runs assertions. The `TrajectoryAssertionEvaluator` type gets additional fields:

```typescript
export interface TrajectoryAssertionEvaluator extends WeightedEvaluatorSpec {
  kind: "trajectory-assertion"
  assertionRef?: string           // optional external assertion file
  expectedSequence?: string[]     // e.g., ["loom", "pattern", "loom"] — ordered delegation sequence
  requiredAgents?: string[]       // agents that must appear somewhere in the trajectory
  forbiddenAgents?: string[]      // agents that must NOT appear
  minTurns?: number               // minimum number of completed turns
  maxTurns?: number               // maximum turns (guards against runaway)
}
```

**Assertion types:**

| Assertion | What it checks |
|-----------|---------------|
| `expectedSequence` | The observed `delegationSequence` matches exactly (ordered) |
| `requiredAgents` | Each agent appears at least once in the delegation sequence |
| `forbiddenAgents` | None of these agents appear in the delegation sequence |
| `minTurns` / `maxTurns` | Turn count bounds |
| `assertionRef` | Points to an external assertion file (future: rubric for LLM-judged trajectory quality) |

Each assertion produces individual `AssertionResult` entries, keeping compatibility with the existing scoring system.

### 7. Schema Updates

Extend `TrajectoryAssertionEvaluatorSchema` in `schema.ts` to validate the new fields:

```typescript
export const TrajectoryAssertionEvaluatorSchema = WeightedEvaluatorSchema.extend({
  kind: z.literal("trajectory-assertion"),
  assertionRef: NonEmptyString.optional(),
  expectedSequence: z.array(NonEmptyString).optional(),
  requiredAgents: z.array(NonEmptyString).optional(),
  forbiddenAgents: z.array(NonEmptyString).optional(),
  minTurns: z.number().int().positive().optional(),
  maxTurns: z.number().int().positive().optional(),
})
```

Add a new `TrajectoryScenarioSchema` for scenario file validation:

```typescript
export const TrajectoryTurnSchema = z.object({
  turn: z.number().int().positive(),
  role: z.enum(["user", "assistant"]),
  agent: NonEmptyString.optional(),
  content: z.string(),
  mockResponse: z.string().optional(),
  expectedDelegation: NonEmptyString.optional(),
})

export const TrajectoryScenarioSchema = z.object({
  id: NonEmptyString,
  title: NonEmptyString,
  description: z.string().optional(),
  agents: z.array(NonEmptyString).min(1),
  turns: z.array(TrajectoryTurnSchema).min(2),
})
```

### 8. Reporter Extension

Extend `formatEvalSummary` in `reporter.ts` to handle trajectory results:
- Show delegation sequence in the summary for trajectory cases
- Show turn count and any sequence mismatches in the worst-results section

## TODOs

- [ ] 1. **Define trajectory types and interfaces**
  **What**: Add `TrajectoryScenario`, `TrajectoryTurn`, `TrajectoryTrace`, `TrajectoryTurnResult` interfaces to `types.ts`. Extend `TrajectoryAssertionEvaluator` with `expectedSequence`, `requiredAgents`, `forbiddenAgents`, `minTurns`, `maxTurns` fields. Add trajectory-specific fields to `EvalArtifacts` comment (the `trace` field already exists as `unknown`).
  **Files**: `src/features/evals/types.ts`
  **Acceptance**: `bun run typecheck` passes; new types are importable from `types.ts`

- [ ] 2. **Extend Zod schemas for trajectory validation**
  **What**: Add `TrajectoryTurnSchema`, `TrajectoryScenarioSchema` to `schema.ts`. Extend `TrajectoryAssertionEvaluatorSchema` with the new optional fields. Export from `index.ts`.
  **Files**: `src/features/evals/schema.ts`, `src/features/evals/index.ts`
  **Acceptance**: `bun run typecheck` passes; schema tests still pass; new schemas validate correct scenario JSON and reject invalid ones

- [ ] 3. **Build trajectory scenario loader**
  **What**: Add `loadTrajectoryScenario(directory: string, scenarioRef: string): TrajectoryScenario` function that reads and validates scenario `.jsonc` files. Follow the same pattern as `loadEvalCaseFile` (JSONC parse → Zod validate → typed return). Handle path resolution: if `scenarioRef` starts with `evals/`, resolve from project root; otherwise resolve from the scenario directory.
  **Files**: `src/features/evals/loader.ts` (add function)
  **Acceptance**: Unit test: loading a valid scenario file returns typed object; loading an invalid file throws `EvalConfigError`

- [ ] 4. **Implement trajectory executor**
  **What**: Create `executeTrajectoryRun(resolvedTarget, executor, context)` function. In mock mode: iterate turns, use `mockResponse` for each assistant turn, detect delegations via pattern matching, build `TrajectoryTrace`. Set `artifacts.trace` to the trace object, `artifacts.modelOutput` to concatenated assistant responses.
  **Files**: `src/features/evals/executors/trajectory-run.ts` (create)
  **Acceptance**: Unit test with a mock scenario: executor produces correct `TrajectoryTrace` with accurate delegation sequence, `modelOutput` contains all assistant responses, delegation detection finds expected agents

- [ ] 5. **Implement trajectory assertion evaluator**
  **What**: Create `runTrajectoryAssertionEvaluator(spec, artifacts)` function. Extract `TrajectoryTrace` from `artifacts.trace`. Implement `expectedSequence` (exact ordered match), `requiredAgents` (set containment), `forbiddenAgents` (set exclusion), `minTurns`/`maxTurns` (bounds). Each check produces an `AssertionResult`. Handle missing trace gracefully (return failing assertion with clear message).
  **Files**: `src/features/evals/evaluators/trajectory-assertion.ts` (create)
  **Acceptance**: Unit tests covering: exact sequence match (pass/fail), required agents (pass/fail), forbidden agents (pass/fail), turn bounds (pass/fail), missing trace artifact

- [ ] 6. **Wire executor and evaluator into runner**
  **What**: Update `resolveTarget` to handle `trajectory-agent` (resolve primary agent prompt, load scenario metadata). Update `executeCase` to route `trajectory-run` executor to the new function. Update evaluator dispatch to route `trajectory-assertion` to the new evaluator. Import new modules.
  **Files**: `src/features/evals/runner.ts`
  **Acceptance**: Integration: a trajectory eval case loaded from a JSONC file runs end-to-end through the runner and produces a result with trajectory artifacts

- [ ] 7. **Update public exports**
  **What**: Export new functions and types from `index.ts`: `executeTrajectoryRun`, `runTrajectoryAssertionEvaluator`, `loadTrajectoryScenario`, trajectory types.
  **Files**: `src/features/evals/index.ts`
  **Acceptance**: All new public symbols are importable from `src/features/evals`

- [ ] 8. **Create trajectory scenario files**
  **What**: Author 3–5 scenario `.jsonc` files in `evals/scenarios/`. See "Representative Scenarios" section below for specifics.
  **Files**: `evals/scenarios/loom-delegates-to-pattern.jsonc`, `evals/scenarios/loom-delegates-to-thread.jsonc`, `evals/scenarios/loom-planning-with-review.jsonc`, `evals/scenarios/loom-self-handle-simple.jsonc`, `evals/scenarios/loom-security-review-chain.jsonc` (create all)
  **Acceptance**: Each scenario file is valid JSONC, passes `TrajectoryScenarioSchema` validation, has 2+ turns with mock responses

- [ ] 9. **Create trajectory eval case files**
  **What**: Author eval case `.jsonc` files in `evals/cases/trajectory/` — one per scenario. Each case uses `target.kind: "trajectory-agent"`, `executor.kind: "trajectory-run"`, and `evaluators` with `trajectory-assertion`.
  **Files**: `evals/cases/trajectory/loom-delegates-to-pattern.jsonc`, `evals/cases/trajectory/loom-delegates-to-thread.jsonc`, `evals/cases/trajectory/loom-planning-with-review.jsonc`, `evals/cases/trajectory/loom-self-handle-simple.jsonc`, `evals/cases/trajectory/loom-security-review-chain.jsonc` (create all)
  **Acceptance**: Each case passes `EvalCaseSchema` validation, has `phase: "phase3"`, references the correct scenario

- [ ] 10. **Create phase3-trajectory-pilot suite manifest**
  **What**: Author `evals/suites/phase3-trajectory-pilot.jsonc` referencing all trajectory case files.
  **Files**: `evals/suites/phase3-trajectory-pilot.jsonc` (create)
  **Acceptance**: `bun run eval --suite phase3-trajectory-pilot` loads the suite without errors

- [ ] 11. **Extend reporter for trajectory cases**
  **What**: Update `formatEvalSummary` in `reporter.ts` to display delegation sequence and turn count for trajectory cases in the worst-results section. Detect trajectory cases by checking if `artifacts.trace` is a `TrajectoryTrace`.
  **Files**: `src/features/evals/reporter.ts`
  **Acceptance**: Running `phase3-trajectory-pilot` suite produces human-readable summary with trajectory-specific details

- [ ] 12. **Add schema unit tests for trajectory types**
  **What**: Add test cases in `schema.test.ts` for `TrajectoryScenarioSchema`, `TrajectoryTurnSchema`, and extended `TrajectoryAssertionEvaluatorSchema`. Cover valid objects, missing required fields, and invalid values.
  **Files**: `src/features/evals/schema.test.ts`
  **Acceptance**: `bun test schema.test.ts` passes with new trajectory schema coverage

- [ ] 13. **Add loader unit test for scenario loading**
  **What**: Add test case in `loader.test.ts` for `loadTrajectoryScenario` — valid file parse, missing file error, invalid schema error.
  **Files**: `src/features/evals/loader.test.ts`
  **Acceptance**: `bun test loader.test.ts` passes

- [ ] 14. **Add integration test for full trajectory eval run**
  **What**: Add a test in `runner.test.ts` that copies a trajectory scenario + case + suite to a temp directory and runs `runEvalSuite` on it. Verify the result has trajectory artifacts, correct assertion results, and doesn't break existing Phase 1 test.
  **Files**: `src/features/evals/runner.test.ts`
  **Acceptance**: `bun test runner.test.ts` passes with trajectory integration test alongside existing Phase 1 test

- [ ] 15. **Update evals README**
  **What**: Add a "Phase 3: Trajectory Evals" section to `evals/README.md` documenting: what trajectory evals cover, how to run them, scenario file format, how to write new trajectory cases.
  **Files**: `evals/README.md`
  **Acceptance**: README accurately describes the trajectory eval system

## Representative Scenarios

### Scenario 1: Loom → Pattern (Planning Delegation)
- **Flow**: User asks for complex feature → Loom identifies planning need → delegates to Pattern → Pattern produces plan → Loom summarizes back to user
- **Assertions**: `expectedSequence: ["loom", "pattern", "loom"]`, `requiredAgents: ["pattern"]`, contains `/start-work` suggestion in final response
- **4 turns**: user → loom (routing) → pattern (plan) → loom (summary)

### Scenario 2: Loom → Thread (Exploration Delegation)
- **Flow**: User asks to explore codebase → Loom routes to Thread → Thread returns findings → Loom summarizes
- **Assertions**: `expectedSequence: ["loom", "thread", "loom"]`, `requiredAgents: ["thread"]`, `forbiddenAgents: ["pattern"]`
- **4 turns**: user → loom (routing) → thread (exploration) → loom (summary)

### Scenario 3: Loom → Pattern → Weft/Warp Review Chain
- **Flow**: User asks for security-sensitive feature → Loom → Pattern (plan) → Warp (security review) → Loom reports
- **Assertions**: `expectedSequence: ["loom", "pattern", "warp", "loom"]`, `requiredAgents: ["pattern", "warp"]`
- **5 turns**: user → loom → pattern → warp → loom
- **Tests the mandatory Warp review for security-touching changes**

### Scenario 4: Loom Self-Handle (No Delegation)
- **Flow**: User asks a simple question → Loom answers directly without delegation
- **Assertions**: `expectedSequence: ["loom"]`, `forbiddenAgents: ["pattern", "thread", "spindle", "warp", "weft"]`, `maxTurns: 2`
- **2 turns**: user → loom (direct answer)
- **Tests that Loom doesn't over-delegate**

### Scenario 5: Loom → Warp Security Audit
- **Flow**: User asks to review auth changes → Loom routes to Warp for security audit → Warp returns verdict → Loom summarizes
- **Assertions**: `expectedSequence: ["loom", "warp", "loom"]`, `requiredAgents: ["warp"]`
- **4 turns**: user → loom → warp → loom
- **Tests mandatory Warp invocation for security-sensitive content**

## Verification
- [ ] `bun run typecheck` passes — all new types are sound
- [ ] `bun test` passes — all new and existing tests green
- [ ] `bun run eval --suite phase1-core` passes — no Phase 1 regressions
- [ ] `bun run eval --suite pr-smoke` passes — no smoke regressions
- [ ] `bun run eval --suite phase2-loom-pilot` still loads (even if mock-only)
- [ ] `bun run eval --suite phase3-trajectory-pilot` runs and produces results
- [ ] Trajectory eval results contain `trace` artifacts with correct delegation sequences
- [ ] Reporter output shows trajectory-specific details for trajectory cases
- [ ] No new npm dependencies in `package.json`

## Potential Pitfalls

| Risk | Mitigation |
|------|------------|
| **Scenario files become large and hard to maintain** | Keep pilot scenarios short (2–5 turns). Use `description` fields liberally. Consider a scenario builder/template pattern if we scale past 10 scenarios. |
| **Delegation detection heuristic is fragile** | For mock mode, embed explicit `[delegates to {agent}]` markers in mock responses. For live mode (future), parse actual tool-call arguments. Keep the heuristic pluggable. |
| **Trajectory evals are slow in live mode** | Mock mode is the default and is fast (no API calls). Live mode is opt-in and rate-limited. Trajectory cases should NOT be in `pr-smoke`. |
| **Schema changes break existing case loading** | All new fields on `TrajectoryAssertionEvaluator` are optional. Existing cases with `kind: "trajectory-assertion"` and only `assertionRef` will still validate. |
| **Dependency on "backport spike to Phase 2"** | The trajectory executor is a new code path, not a modification of `model-response`. If the backport hasn't landed, the trajectory system still works in mock mode. Note this dependency in the suite manifest description. |
| **`trace` field is `unknown` in EvalArtifacts** | Keep it as `unknown` in the base type to avoid coupling. The trajectory evaluator casts and validates at runtime with a type guard. Add a `isTrajectoryTrace(trace: unknown): trace is TrajectoryTrace` guard. |
| **Windows path issues with scenario loading** | Use `path.join()` and `path.resolve()` consistently, matching the pattern in the existing `loader.ts`. The existing loader already handles this correctly. |
