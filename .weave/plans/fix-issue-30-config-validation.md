# Fix Issue #30: Graceful Per-Section Config Validation

## TL;DR
> **Summary**: Replace all-or-nothing `WeaveConfigSchema.safeParse(merged)` with per-section validation so one bad section (e.g. invalid `custom_agents`) doesn't nuke the entire config including valid `agents` overrides.
> **Estimated Effort**: Short

## Context
### Original Request
GitHub issue #30: "Custom agents not loading and causing custom builtins to reset to default."

When a user's config has a valid `agents` section AND an invalid `custom_agents` section (e.g. invalid enum value for `category` or `cost`), the single `WeaveConfigSchema.safeParse(merged)` call on line 59 of `loader.ts` fails for the **entire** config. The error handler on line 60-65 logs to ERROR (which only hits `console.error` if no client is set) and returns `WeaveConfigSchema.parse({})` — wiping out all user configuration silently.

### Key Findings
1. **The bug site** is `src/config/loader.ts` lines 59-66. A single `safeParse` validates the entire merged config. Any failure → total fallback to defaults.
2. **Zod schemas are already modular**. Each section has its own exported schema (`AgentOverridesSchema`, `CustomAgentsConfigSchema`, `CategoriesConfigSchema`, `BackgroundConfigSchema`, etc.) — we can reuse them directly for per-section validation.
3. **The `warn()` function in `src/shared/log.ts`** (line 66) emits via `console.error` when no client is set, so it's visible to the user. This is the correct level for validation warnings.
4. **Existing test coverage** in `loader.test.ts` has a test "returns defaults when config file has invalid content" (line 73-84) that validates the current broken behavior. This test will need updating.
5. **The `WeaveConfigSchema` has 13 top-level sections**, but most are simple primitives/arrays. The sections most likely to fail validation are the complex record/object types: `agents`, `custom_agents`, `categories`, `background`, `tmux`, `experimental`, `workflows`, `analytics`.

## Objectives
### Core Objective
Make config validation degrade gracefully per-section: if `custom_agents` has a validation error, drop only `custom_agents` (with a user-visible warning) while keeping valid `agents` overrides and all other sections intact.

### Deliverables
- [ ] Per-section validation in `loadWeaveConfig()` with clear warning messages
- [ ] Unit tests for partial validation scenarios in `loader.test.ts`
- [ ] Integration test for combined agents + custom_agents in `merge.test.ts`
- [ ] E2E test covering the full pipeline with both sections

### Definition of Done
- [ ] `bun test src/config/loader.test.ts` passes
- [ ] `bun test src/config/merge.test.ts` passes
- [ ] `bun test src/e2e.test.ts` passes
- [ ] `bun test` (full suite) passes with no regressions

### Guardrails (Must NOT)
- Do NOT modify Zod schemas in `schema.ts` (the validation rules are correct)
- Do NOT change `mergeConfigs()` in `merge.ts` (merge logic is correct)
- Do NOT change the function signature of `loadWeaveConfig()` (backward compat)
- Do NOT suppress errors for truly broken JSON/JSONC parsing (that already works correctly via `readJsoncFile`)

## TODOs

- [ ] 1. **Implement per-section validation in `src/config/loader.ts`**
  **What**: Replace the single `WeaveConfigSchema.safeParse(merged)` with a `validateConfigSections()` helper that validates each major section independently using its own Zod schema, then assembles a valid `WeaveConfig` from the surviving sections.
  **Files**: `src/config/loader.ts`
  **Detail**:
  
  Create a helper function `validateConfigSections(merged: DeepPartial<WeaveConfig>): WeaveConfig` that:
  
  1. Defines a section map of `{ key, schema }` pairs for the complex sections:
     ```
     agents         → AgentOverridesSchema.optional()
     custom_agents  → CustomAgentsConfigSchema.optional()
     categories     → CategoriesConfigSchema.optional()
     background     → BackgroundConfigSchema.optional()
     analytics      → AnalyticsConfigSchema.optional()
     tmux           → TmuxConfigSchema.optional()
     experimental   → ExperimentalConfigSchema.optional()
     workflows      → WorkflowConfigSchema.optional()
     ```
  
  2. For simple/scalar sections that are unlikely to fail (`$schema`, `disabled_hooks`, `disabled_tools`, `disabled_agents`, `disabled_skills`, `skill_directories`, `log_level`), validate them together as a group. If validation of these fails, log a warning and use defaults for those fields.
  
  3. For each complex section present in `merged`:
     - Run `schema.safeParse(merged[key])` on the section value
     - If it succeeds, include it in the assembled config
     - If it fails, call `warn()` with a message like:
       `Config section "${key}" has validation errors and was ignored: ${formatted issues}`
       Format the Zod issues to show the exact path and message (e.g., `"custom_agents.my-agent.category: Invalid enum value. Expected 'exploration' | 'specialist' | 'advisor' | 'utility', received 'invalid'"`)
     - Drop the failing section (use `undefined` for that field)
  
  4. Assemble the final object and run `WeaveConfigSchema.parse(assembled)` to ensure the assembled object passes the full schema (it should always pass since each section was individually validated or dropped).
  
  Replace lines 59-66 in `loadWeaveConfig()`:
  ```typescript
  // OLD:
  const result = WeaveConfigSchema.safeParse(merged)
  if (!result.success) {
    logError("WeaveConfig validation errors — using defaults", result.error.issues)
    return WeaveConfigSchema.parse({})
  }
  
  // NEW:
  return validateConfigSections(merged)
  ```

  Import the individual section schemas from `./schema` (they are already exported).
  
  **Acceptance**: 
  - A config with valid `agents` + invalid `custom_agents` returns the agents overrides, drops custom_agents
  - A config with invalid `agents` + valid `custom_agents` returns the custom_agents, drops agents
  - A fully valid config returns everything (no behavior change)
  - A fully invalid config returns defaults (no behavior change)

- [ ] 2. **Format Zod validation errors for user readability**
  **What**: Create a small helper `formatZodIssues(issues: z.ZodIssue[]): string` in `loader.ts` that produces human-readable error descriptions from Zod issues.
  **Files**: `src/config/loader.ts`
  **Detail**:
  
  Format each issue as `path.to.field: message`. Example output:
  ```
  my-agent.category: Invalid enum value. Expected 'exploration' | 'specialist' | 'advisor' | 'utility', received 'invalid'
  ```
  
  The path comes from `issue.path.join(".")` and the message from `issue.message`. Join multiple issues with `"; "`.
  
  Use this formatter in the `warn()` calls from TODO #1.
  
  **Acceptance**: Warning messages are clear and tell the user exactly which field and what value caused the problem.

- [ ] 3. **Update existing loader test for partial validation**
  **What**: Update the existing "returns defaults when config file has invalid content" test in `loader.test.ts` to verify per-section degradation instead of total default fallback.
  **Files**: `src/config/loader.test.ts`
  **Detail**:
  
  The current test (line 73-84) writes `{ agents: { loom: { temperature: 99 } } }` and asserts the config is "defined". This will now preserve everything except the invalid `agents` section. Update the assertion to verify the agents field is dropped/default but the rest of config is intact.
  
  **Acceptance**: Test passes with updated assertions matching the new graceful behavior.

- [ ] 4. **Add per-section validation tests in `src/config/loader.test.ts`**
  **What**: Add four new test cases covering the matrix of valid/invalid agents × custom_agents.
  **Files**: `src/config/loader.test.ts`
  **Detail**:
  
  Add a new `describe("per-section validation")` block with these tests:
  
  a. **valid agents + invalid custom_agents → agents preserved, custom_agents dropped**
     - Write config: `{ agents: { loom: { model: "claude-opus-4" } }, custom_agents: { "my-bot": { category: "INVALID" } } }`
     - Assert: `config.agents?.loom?.model === "claude-opus-4"`
     - Assert: `config.custom_agents` is `undefined`
  
  b. **invalid agents + valid custom_agents → custom_agents preserved, agents dropped**
     - Write config: `{ agents: { loom: { temperature: 99 } }, custom_agents: { "helper": { prompt: "Hi", display_name: "Helper" } } }`
     - Assert: `config.agents` is `undefined`
     - Assert: `config.custom_agents?.helper?.prompt === "Hi"`
  
  c. **both valid → both preserved**
     - Write config: `{ agents: { loom: { model: "claude-opus-4" } }, custom_agents: { "helper": { prompt: "Hi" } } }`
     - Assert: both present and correct
  
  d. **both invalid → both dropped, rest of config still works**
     - Write config: `{ agents: { loom: { temperature: 99 } }, custom_agents: { "bot": { category: "INVALID" } }, disabled_agents: ["spindle"] }`
     - Assert: `config.agents` is `undefined`
     - Assert: `config.custom_agents` is `undefined`
     - Assert: `config.disabled_agents` includes `"spindle"` (other sections survive)
  
  Each test creates a temp dir, writes a config file to `.opencode/weave-opencode.json`, calls `loadWeaveConfig(testDir, undefined, testDir)`, and checks the returned config.
  
  **Acceptance**: All four tests pass; together they verify the per-section validation matrix.

- [ ] 5. **Add combined E2E test in `src/e2e.test.ts`**
  **What**: Add an E2E test that exercises the full pipeline with both `agents` overrides AND `custom_agents` definitions to verify they work together end-to-end.
  **Files**: `src/e2e.test.ts`
  **Detail**:
  
  Add a test in the existing `describe("E2E: Combined features")` block:
  
  ```
  it("agents overrides + custom_agents both apply through full pipeline")
  ```
  
  - Create a `WeaveConfig` with both an `agents` override (e.g. `loom: { model: "custom-model", temperature: 0.3 }`) and a `custom_agents` entry (e.g. `"my-helper": { prompt: "Help me", display_name: "My Helper" }`)
  - Call `createManagers()` with this config
  - Assert the builtin agent (loom) has the overridden model/temperature
  - Assert the custom agent ("my-helper") is present in the agents map
  - Run through `configHandler.handle()` and verify both appear in the output
  - Clean up registered display names in `afterEach`
  
  **Acceptance**: Test passes; confirms both config sections work together in the full pipeline.

## Verification
- [ ] `bun test src/config/loader.test.ts` — all loader tests pass including new per-section tests
- [ ] `bun test src/config/merge.test.ts` — merge tests unaffected (no changes to merge.ts)
- [ ] `bun test src/e2e.test.ts` — E2E tests pass including new combined test
- [ ] `bun test` — full test suite passes with no regressions
- [ ] Manual smoke test: create a config with a valid `agents` section and an invalid `custom_agents` section → verify agents overrides still apply and a warning is printed
