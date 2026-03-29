# SDD Workflow Integration — Custom Directory Support + Example Package

## TL;DR
> **Summary**: Add custom directory support to Weave's workflow discovery and skill loader (5 source files), then create a self-contained `examples/workflows/github-speckit/` package with a `spec-driven.jsonc` workflow (11 steps with review gates), 5 SKILL.md files teaching agents SDD methodology, and an example config snippet showing how to wire it up.
> **Estimated Effort**: Large

## Context

### Original Request
Bring GitHub's Spec Kit SDD methodology into Weave's multi-agent orchestration system for regulated environments requiring formal specification artifacts and mandatory review gates. The integration must work without any Spec Kit CLI or shell scripts installed. Ship it as a distributable example that users can copy into their projects.

### Key Findings

**Current Path Resolution is Hardcoded**:
- Workflows: `.opencode/workflows/` (project) + `~/.config/opencode/workflows/` (user) — in `src/features/workflow/discovery.ts` lines 86–102
- Skills: `{directory}/.opencode/skills/` (project) + `~/.config/opencode/skills/` (user) — in `src/features/skill-loader/loader.ts` lines 19–25
- Constants in `src/features/workflow/constants.ts` lines 14–17
- Config schema in `src/config/schema.ts` — `WorkflowConfigSchema` only has `disabled_workflows` (line 110–112)
- No existing `examples/` directory in the repository

**How Discovery Flows Through the System**:
1. `create-hooks.ts` creates hook handlers that call `handleRunWorkflow({ directory })` and `checkWorkflowContinuation({ directory })`
2. `hook.ts` calls `discoverWorkflows(directory)` which constructs `path.join(directory, WORKFLOWS_DIR_PROJECT)` and scans
3. `create-tools.ts` calls `loadSkills({ directory })` which calls `scanFilesystemSkills(directory)` internally
4. `scanFilesystemSkills()` hardcodes `path.join(directory, '.opencode', 'skills')` and `path.join(os.homedir(), '.config', 'opencode', 'skills')`
5. Neither function accepts additional directories — custom directories are not supported

**What Needs to Change for Custom Directory Support**:
All changes are additive with backward compatibility via optional parameters:
1. `WorkflowConfigSchema` — add `directories: z.array(z.string()).optional()` for extra workflow search paths
2. `WeaveConfigSchema` — add `skill_directories: z.array(z.string()).optional()` at top level (skills aren't nested under a subsection)
3. `discoverWorkflows()` — accept optional `customDirs?: string[]`, scan each as `scope: "project"`
4. `scanFilesystemSkills()` / `loadSkills()` — accept optional `customDirs?: string[]`, scan each as `scope: "project"`
5. `create-tools.ts` — pass `pluginConfig.skill_directories` to `loadSkills()`
6. `create-hooks.ts` — pass `pluginConfig.workflows?.directories` through to `handleRunWorkflow()` → `discoverWorkflows()`

**Weave's Workflow Engine (already implemented)**:
- Workflow definitions are JSONC files discovered from `.opencode/workflows/`
- Steps have types: `interactive`, `autonomous`, `gate`
- Completion methods: `user_confirm`, `plan_created`, `plan_complete`, `review_verdict`, `agent_signal`
- Template variables: `{{instance.goal}}`, `{{instance.slug}}`, `{{artifacts.<name>}}`
- Artifacts flow between steps via `artifacts.inputs/outputs`
- Gate rejection uses `on_reject: "pause"` or `"fail"`
- Context threading auto-includes goal + completed step summaries + accumulated artifacts in each step prompt

**Weave's Skill System**:
- Skills are markdown files with YAML frontmatter discovered from `{dir}/SKILL.md` or `{dir}/*/SKILL.md`
- Loaded via OpenCode's `GET /skill` API first, then filesystem fallback (`scanDirectory()` in `discovery.ts`)
- Assigned to agents via config: `"agents": { "pattern": { "skills": ["sdd-planning"] } }`
- Skill content is **prepended** to agent system prompts (`agent-builder.ts`)
- `LoadedSkill` has: `name`, `description`, `content`, `scope?`, `path?`, `model?`

**Weave's Agent Architecture**:
- **Loom**: Coordinator/router — handles initial user interaction, delegates work
- **Thread**: Read-only codebase explorer — fast research, grep/glob
- **Spindle**: External researcher — web/docs research, read-only
- **Pattern**: Strategic planner — produces `.weave/plans/*.md`, never implements
- **Shuttle**: Domain specialist — full tool access, executes work
- **Tapestry**: Execution orchestrator — todo-driven plan execution with checkboxes
- **Weft**: Code reviewer — read-only, produces [APPROVE]/[REJECT] verdicts
- **Warp**: Security auditor — read-only, spec compliance checks, [APPROVE]/[REJECT]

**Spec Kit Prompt Analysis — What's Valuable**:

| Phase | Key Methodology Content | Strip |
|-------|-------------------------|-------|
| Constitution | Template structure, versioning (semver), governance, sync impact report | Shell scripts, extension hooks, agent-specific handoff metadata |
| Specify | Spec quality validation checklist, FR-001 requirement format, success criteria, ambiguity limit (max 3 NEEDS CLARIFICATION) | `create-new-feature.sh`, branch creation, extension hooks |
| Clarify | Ambiguity taxonomy (11 categories), prioritization heuristic (Impact × Uncertainty), sequential questioning loop (max 5) | `check-prerequisites.sh`, YAML extension hooks |
| Plan | Phase 0 research → Phase 1 design, constitution check gates, data-model/contracts generation | `setup-plan.sh`, `update-agent-context.sh`, extension hooks |
| Analyze | Cross-artifact consistency analysis, semantic model building, 6 detection passes, severity assignment | Script invocations |

**What We Strip Out Entirely**:
1. Shell script invocations — replaced by workflow step prompts that tell agents to create directories/files directly
2. Extension hook checking — Weave's workflow engine IS the orchestration layer
3. Agent-specific handoff metadata — replaced by Weave workflow step transitions
4. PowerShell/Bash script alternatives — not needed
5. Branch management — users manage branches themselves
6. JSON flag parsing — agents work with file paths directly

## Objectives

### Core Objective
1. Enable Weave to discover workflows and skills from arbitrary directories (not just `.opencode/`), configured via `weave-opencode.jsonc`.
2. Create a complete SDD example package at `examples/workflows/github-speckit/` that users can point Weave at via the new custom directory config.

### Deliverables
- [ ] Config schema: `WorkflowConfigSchema.directories` and `WeaveConfigSchema.skill_directories`
- [ ] Custom directory support in `discoverWorkflows()` and `scanFilesystemSkills()`
- [ ] Config plumbing in `create-tools.ts` and `create-hooks.ts`
- [ ] Tests for custom directory support
- [ ] Workflow definition: `examples/workflows/github-speckit/workflows/spec-driven.jsonc`
- [ ] Skill: `examples/workflows/github-speckit/skills/sdd-constitution/SKILL.md`
- [ ] Skill: `examples/workflows/github-speckit/skills/sdd-specification/SKILL.md`
- [ ] Skill: `examples/workflows/github-speckit/skills/sdd-clarify/SKILL.md`
- [ ] Skill: `examples/workflows/github-speckit/skills/sdd-planning/SKILL.md`
- [ ] Skill: `examples/workflows/github-speckit/skills/sdd-analysis/SKILL.md`
- [ ] Config example: `examples/workflows/github-speckit/config/weave-opencode.jsonc`
- [ ] GitHub Action: `.github/workflows/speckit-upstream-check.yml` (monthly upstream change detection)
- [ ] README: `examples/workflows/github-speckit/README.md`

### Definition of Done
- [ ] Adding `"workflows": { "directories": ["examples/workflows/github-speckit/workflows"] }` to config causes `discoverWorkflows()` to find `spec-driven.jsonc`
- [ ] Adding `"skill_directories": ["examples/workflows/github-speckit/skills"]` to config causes `loadSkills()` to find all 5 SDD skills
- [ ] Existing behavior unchanged when no custom directories configured (backward compatible)
- [ ] All existing tests pass (`bun test`)
- [ ] New tests pass for custom directory scanning
- [ ] `/run-workflow spec-driven "Build user authentication"` starts the SDD workflow when config points at the example
- [ ] All 5 SKILL.md files have valid YAML frontmatter with `name` and `description`
- [ ] No Spec Kit CLI, Python, or shell scripts required at runtime

### Guardrails (Must NOT)
- Must NOT remove or change existing default directory scanning (`.opencode/workflows/`, `~/.config/opencode/...`)
- Must NOT require `specify` CLI, `uv`, or Python to be installed
- Must NOT create YAML config files (Weave uses JSONC)
- Must NOT modify the `WorkflowDefinitionSchema` or `DiscoveredWorkflow` type — only the config and discovery functions
- Must NOT put the example files in `.opencode/` — they go in `examples/workflows/github-speckit/`

## TODOs

### Phase 1: Core — Custom Directory Support

- [x] 1. **Add `directories` to `WorkflowConfigSchema` and `skill_directories` to `WeaveConfigSchema`**
  **What**: Extend the config schema so users can specify additional directories for workflow and skill discovery.
  **Files**: `src/config/schema.ts`
  
  **Changes**:
  1. In `WorkflowConfigSchema` (line 110), add `directories` field:
     ```typescript
     export const WorkflowConfigSchema = z.object({
       disabled_workflows: z.array(z.string()).optional(),
       directories: z.array(z.string()).optional(),
     })
     ```
  2. In `WeaveConfigSchema` (line 114), add `skill_directories` field:
     ```typescript
     export const WeaveConfigSchema = z.object({
       // ... existing fields ...
       skill_directories: z.array(z.string()).optional(),
       // ... rest of fields ...
     })
     ```
  
  **Why `skill_directories` at top level**: Skills don't have their own config subsection (unlike workflows which have `WorkflowConfigSchema`). Adding a top-level array is consistent with `disabled_skills` which is also top-level.
  
  **Acceptance**: `WeaveConfigSchema.parse({ workflows: { directories: ["./custom"] }, skill_directories: ["./custom-skills"] })` succeeds. Omitting both fields still parses successfully (backward compat).

- [x] 2. **Add custom directory support to `discoverWorkflows()`**
  **What**: Accept an optional `customDirs` parameter that adds extra directories to scan for workflow definitions. Custom dirs are scanned with `scope: "project"` and follow the same override rules (project > user, later > earlier).
  **Files**: `src/features/workflow/discovery.ts`
  
  **Changes**:
  Change the `discoverWorkflows` function signature from:
  ```typescript
  export function discoverWorkflows(directory: string): DiscoveredWorkflow[]
  ```
  to:
  ```typescript
  export function discoverWorkflows(directory: string, customDirs?: string[]): DiscoveredWorkflow[]
  ```
  
  After scanning `userWorkflows` and `projectWorkflows` (lines 90–91), add scanning of custom directories:
  ```typescript
  // Custom directories (from config) — scanned as "project" scope
  const customWorkflows: DiscoveredWorkflow[] = []
  if (customDirs) {
    for (const dir of customDirs) {
      const resolved = path.isAbsolute(dir) ? dir : path.join(directory, dir)
      customWorkflows.push(...scanWorkflowDirectory(resolved, "project"))
    }
  }
  ```
  
  In the merge section (lines 94–100), custom workflows go between user and project so project still wins:
  ```typescript
  const byName = new Map<string, DiscoveredWorkflow>()
  for (const wf of userWorkflows) {
    byName.set(wf.definition.name, wf)
  }
  for (const wf of customWorkflows) {
    byName.set(wf.definition.name, wf)
  }
  for (const wf of projectWorkflows) {
    byName.set(wf.definition.name, wf)
  }
  ```
  
  **Path resolution**: Relative paths are resolved against `directory` (the project root). Absolute paths used as-is. This lets config say `"directories": ["examples/workflows/github-speckit/workflows"]` without needing absolute paths.
  
  **Acceptance**: 
  - `discoverWorkflows(testDir)` still works (no custom dirs = existing behavior)
  - `discoverWorkflows(testDir, ["/abs/path/workflows"])` scans the absolute path
  - `discoverWorkflows(testDir, ["relative/workflows"])` resolves to `path.join(testDir, "relative/workflows")`

- [x] 3. **Add custom directory support to skill loader**
  **What**: Accept optional `customDirs` in `LoadSkillsOptions` and `scanFilesystemSkills()`, scan each custom directory for skills alongside the standard locations.
  **Files**: `src/features/skill-loader/loader.ts`
  
  **Changes**:
  1. Add `customDirs` to `LoadSkillsOptions`:
     ```typescript
     export interface LoadSkillsOptions {
       serverUrl: string | URL
       directory?: string
       disabledSkills?: string[]
       customDirs?: string[]
     }
     ```
  2. Change `scanFilesystemSkills` signature to accept custom dirs:
     ```typescript
     function scanFilesystemSkills(directory: string, customDirs?: string[]): LoadedSkill[]
     ```
  3. After scanning user and project dirs, scan custom dirs:
     ```typescript
     const customSkills: LoadedSkill[] = []
     if (customDirs) {
       for (const dir of customDirs) {
         const resolved = path.isAbsolute(dir) ? dir : path.join(directory, dir)
         customSkills.push(...scanDirectory({ directory: resolved, scope: 'project' }))
       }
     }
     return [...projectSkills, ...customSkills, ...userSkills]
     ```
  4. In `loadSkills()`, pass `customDirs` through:
     ```typescript
     const { serverUrl, directory = process.cwd(), disabledSkills = [], customDirs } = options
     const fsSkills = scanFilesystemSkills(directory, customDirs)
     ```
  
  **Path resolution**: Same as workflows — relative paths resolved against `directory`.
  
  **Acceptance**:
  - `loadSkills({ serverUrl, directory })` still works (no custom dirs = existing behavior)
  - `loadSkills({ serverUrl, directory, customDirs: ["examples/workflows/github-speckit/skills"] })` discovers SKILL.md files in that directory

- [x] 4. **Plumb config values through `create-tools.ts` and `create-hooks.ts`**
  **What**: Pass the new config arrays from `WeaveConfig` through to the discovery functions.
  **Files**: `src/create-tools.ts`, `src/hooks/create-hooks.ts`, `src/features/workflow/hook.ts`
  
  **Changes in `src/create-tools.ts`** (line 22–26):
  Pass `skill_directories` from config to `loadSkills()`:
  ```typescript
  const skillResult = await loadSkills({
    serverUrl: ctx.serverUrl,
    directory: ctx.directory,
    disabledSkills: pluginConfig.disabled_skills ?? [],
    customDirs: pluginConfig.skill_directories,
  })
  ```
  
  **Changes in `src/hooks/create-hooks.ts`** (lines 64–76):
  Pass `pluginConfig` (or just the workflow directories) to workflow hooks. The `handleRunWorkflow` and workflow-related hooks need access to `pluginConfig.workflows?.directories`. Two approaches:
  
  Option A (simpler): Pass `workflowDirs` into the hook closures:
  ```typescript
  const workflowDirs = pluginConfig.workflows?.directories
  
  workflowStart: isHookEnabled("workflow")
    ? (promptText: string, sessionId: string) =>
        handleRunWorkflow({ promptText, sessionId, directory, workflowDirs })
    : null,
  ```
  
  **Changes in `src/features/workflow/hook.ts`**:
  1. Add `workflowDirs?: string[]` to the `handleRunWorkflow` input parameter type (line 70–74)
  2. Pass it through to `discoverWorkflows(directory, workflowDirs)` at all call sites (lines 253, 308)
  3. Add `workflowDirs?: string[]` to `checkWorkflowContinuation` input and pass through similarly
  4. Update `listAvailableWorkflows` and `startNewWorkflow` helper functions to accept and forward `workflowDirs`
  
  **Acceptance**: 
  - When `weave-opencode.jsonc` has `"workflows": { "directories": ["custom/path"] }`, `handleRunWorkflow` discovers workflows from that path
  - When `weave-opencode.jsonc` has `"skill_directories": ["custom/path"]`, `loadSkills` discovers skills from that path
  - When neither field is set, behavior is identical to before

- [x] 5. **Add tests for custom directory support**
  **What**: Unit tests verifying that custom directories are scanned, paths are resolved correctly (absolute and relative), and backward compatibility is maintained.
  **Files**: `src/features/workflow/discovery.test.ts`, `src/features/skill-loader/loader.test.ts`
  
  **Tests to add in `discovery.test.ts`**:
  ```typescript
  describe("discoverWorkflows with custom directories", () => {
    it("discovers workflows from custom absolute directory", () => {
      const customDir = join(testDir, "custom-workflows")
      mkdirSync(customDir, { recursive: true })
      writeFileSync(join(customDir, "custom.jsonc"), VALID_JSONC, "utf-8")
      const workflows = discoverWorkflows(testDir, [customDir])
      expect(workflows).toHaveLength(1)
      expect(workflows[0].definition.name).toBe("test-workflow")
    })

    it("resolves relative custom directories against project root", () => {
      const customDir = join(testDir, "my-workflows")
      mkdirSync(customDir, { recursive: true })
      writeFileSync(join(customDir, "custom.jsonc"), VALID_JSONC, "utf-8")
      const workflows = discoverWorkflows(testDir, ["my-workflows"])
      expect(workflows).toHaveLength(1)
    })

    it("project workflows override custom directory workflows with same name", () => {
      // Setup custom dir with workflow named "test-workflow"
      const customDir = join(testDir, "custom-workflows")
      mkdirSync(customDir, { recursive: true })
      writeFileSync(join(customDir, "custom.jsonc"), VALID_JSONC, "utf-8")
      // Setup project dir with workflow named "test-workflow"
      const projectDir = join(testDir, WORKFLOWS_DIR_PROJECT)
      mkdirSync(projectDir, { recursive: true })
      writeFileSync(join(projectDir, "project.jsonc"), VALID_JSONC, "utf-8")
      const workflows = discoverWorkflows(testDir, [customDir])
      expect(workflows).toHaveLength(1)
      expect(workflows[0].scope).toBe("project")
      expect(workflows[0].path).toContain(WORKFLOWS_DIR_PROJECT)
    })

    it("skips non-existent custom directories gracefully", () => {
      const workflows = discoverWorkflows(testDir, ["/does/not/exist"])
      expect(workflows).toHaveLength(0)
    })

    it("works with empty customDirs array", () => {
      const workflows = discoverWorkflows(testDir, [])
      expect(workflows).toHaveLength(0) // no project or user workflows either
    })
  })
  ```
  
  **Tests to add in `loader.test.ts`**:
  ```typescript
  it("scans custom skill directories when provided", async () => {
    const customSkill: LoadedSkill = {
      name: "custom-skill",
      description: "From custom dir",
      content: "Custom content",
      scope: "project",
      path: "/custom/skills/custom-skill/SKILL.md",
    }
    scanDirectorySpy.mockImplementation((opts: { directory: string; scope: string }) => {
      if (opts.directory === "/custom/skills") return [customSkill]
      return []
    })
    const result = await loadSkills({
      serverUrl: SERVER_URL,
      directory: DIRECTORY,
      customDirs: ["/custom/skills"],
    })
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0].name).toBe("custom-skill")
  })

  it("merges custom directory skills with standard locations", async () => {
    // ... test that custom + project + user all merge correctly
  })
  ```
  
  **Acceptance**: `bun test src/features/workflow/discovery.test.ts` and `bun test src/features/skill-loader/loader.test.ts` pass with all new and existing tests green.

### Phase 2: Example — GitHub Spec Kit Workflow Package

- [x] 6. **Create directory structure for the example package**
  **What**: Create the `examples/workflows/github-speckit/` directory tree with subdirectories for workflows, skills, and config.
  **Files**: Create directories:
  - `examples/workflows/github-speckit/workflows/`
  - `examples/workflows/github-speckit/skills/sdd-constitution/`
  - `examples/workflows/github-speckit/skills/sdd-specification/`
  - `examples/workflows/github-speckit/skills/sdd-clarify/`
  - `examples/workflows/github-speckit/skills/sdd-planning/`
  - `examples/workflows/github-speckit/skills/sdd-analysis/`
  - `examples/workflows/github-speckit/config/`
  
  **Acceptance**: All directories exist. No files yet (subsequent tasks create them).

- [x] 7. **Create workflow definition `spec-driven.jsonc`**
  **What**: The core workflow definition with 11 steps mapping Spec Kit's phases plus review gates. Each step prompt distills the relevant Spec Kit methodology and instructs the agent on artifact paths, formats, and completion signals.
  **Files**: `examples/workflows/github-speckit/workflows/spec-driven.jsonc`
  **Acceptance**: Valid JSONC that passes Weave's `WorkflowDefinitionSchema` validation. Each step has correct `type`, `agent`, `completion`, and `artifacts` configuration.
  
  The workflow has these 11 steps:
  
  **Step 1 — `constitution`** (interactive, shuttle, user_confirm):
  - Prompt: Create/update `.specify/memory/constitution.md` with SDD constitution format
  - Outputs: `constitution_path`
  - Asks user interactively for project principles (3-7 principles, MUST/SHOULD language)
  - Produces Sync Impact Report as HTML comment
  
  **Step 2 — `specify`** (autonomous, shuttle, agent_signal):
  - Prompt: Create `.specify/features/{{instance.slug}}/spec.md` using SDD spec format
  - Inputs: `constitution_path` | Outputs: `spec_path`, `feature_dir`
  - Mandatory sections: User Scenarios, Functional Requirements (FR-001), Success Criteria (SC-001), Edge Cases
  - Max 3 `[NEEDS CLARIFICATION]` markers, creates quality checklist at `checklists/requirements.md`
  
  **Step 3 — `spec-review`** (gate, weft, review_verdict):
  - Prompt: Review spec for completeness, quality, constitution alignment
  - Inputs: `spec_path`, `constitution_path`
  - `on_reject: "pause"` — spec must be fixed before proceeding
  
  **Step 4 — `clarify`** (interactive, shuttle, user_confirm):
  - Prompt: Structured ambiguity scan (11 categories), max 5 questions one at a time
  - Inputs: `spec_path`
  - Each question: multiple-choice with recommended option
  - After each answer, update spec inline + add `## Clarifications` session log
  
  **Step 5 — `plan`** (autonomous, pattern, plan_created with `plan_name: "{{instance.slug}}"`):
  - Prompt: Create SDD plan at `{{artifacts.feature_dir}}/plan.md` AND Weave plan at `.weave/plans/{{instance.slug}}.md`
  - Inputs: `spec_path`, `constitution_path`, `feature_dir` | Outputs: `plan_path`, `sdd_plan_path`
  - Constitution check gate, Phase 0 research, Phase 1 design, data-model extraction
  
  **Step 6 — `plan-review`** (gate, weft, review_verdict):
  - Prompt: Review plan for spec coverage, constitution compliance, task clarity, feasibility
  - Inputs: `plan_path`, `sdd_plan_path`, `spec_path`, `constitution_path`
  - `on_reject: "pause"`
  
  **Step 7 — `tasks`** (autonomous, shuttle, agent_signal):
  - Prompt: Generate `{{artifacts.feature_dir}}/tasks.md` with SDD task format (T001 [P] [US1])
  - Inputs: `sdd_plan_path`, `spec_path`, `feature_dir`, `plan_path`
  - Phase organization: Setup → Foundation → User Stories → Polish
  - Also updates Weave plan TODOs section
  
  **Step 8 — `analyze`** (autonomous, thread, agent_signal):
  - Prompt: READ-ONLY cross-artifact consistency analysis (6 detection passes)
  - Inputs: `spec_path`, `sdd_plan_path`, `feature_dir`, `constitution_path`
  - Report format: table with ID/Category/Severity/Location/Summary/Recommendation
  
  **Step 9 — `implement`** (autonomous, shuttle, plan_complete with `plan_name: "{{instance.slug}}"`):
  - Prompt: Execute tasks phase by phase, mark `- [x]` in both tasks.md and Weave plan
  - Inputs: `plan_path`, `feature_dir`, `sdd_plan_path`, `spec_path`
  
  **Step 10 — `code-review`** (gate, weft, review_verdict):
  - Prompt: Review implementation against spec, code quality, test coverage
  - `on_reject: "pause"`
  
  **Step 11 — `security-review`** (gate, warp, review_verdict):
  - Prompt: OWASP Top 10 audit, spec compliance, constitution compliance, credential safety
  - `on_reject: "pause"`

- [x] 8. **Create skill: `sdd-constitution`**
  **What**: Skill teaching agents the SDD constitution format and methodology. Assigned to Shuttle (which handles the constitution step).
  **Files**: `examples/workflows/github-speckit/skills/sdd-constitution/SKILL.md`
  **Acceptance**: Valid SKILL.md with YAML frontmatter (`name: sdd-constitution`, `description: "..."`). Content covers constitution template, versioning rules (semver), sync impact report format, quality rules for principles.
  
  **Content outline**:
  ```markdown
  ---
  name: sdd-constitution
  description: "Spec-Driven Development: Constitution format and governance"
  ---
  
  <SDDConstitution>
  ## Constitution Format
  
  The constitution lives at `.specify/memory/constitution.md` and defines project
  principles that govern all downstream artifacts (specs, plans, tasks).
  
  ### Template Structure
  # [PROJECT_NAME] Constitution
  ## Core Principles
  ### [PRINCIPLE_NAME]
  [Description using MUST/SHOULD language with explicit rationale]
  ## Governance
  [Amendment procedure, versioning policy, compliance review]
  **Version**: X.Y.Z | **Ratified**: YYYY-MM-DD | **Last Amended**: YYYY-MM-DD
  
  ### Versioning Rules (Semantic)
  - MAJOR: Backward-incompatible governance/principle removals or redefinitions
  - MINOR: New principle/section added or materially expanded
  - PATCH: Clarifications, wording, typo fixes
  
  ### Sync Impact Report (prepend as HTML comment)
  <!-- Sync Impact Report
  Version change: X.Y.Z → X.Y.Z
  Modified principles: [old → new]
  Added sections: [list]
  Removed sections: [list]
  Follow-up TODOs: [list]
  -->
  
  ### Quality Rules
  - Principles must be declarative and testable
  - No vague language — MUST/SHOULD with rationale
  - Dates in ISO format (YYYY-MM-DD)
  - 3-7 principles (fewer is better)
  - Each principle needs: name, description, rationale
  </SDDConstitution>
  ```

- [x] 9. **Create skill: `sdd-specification`**
  **What**: Skill teaching agents the SDD spec format, quality checklist, and ambiguity handling. Assigned to Shuttle.
  **Files**: `examples/workflows/github-speckit/skills/sdd-specification/SKILL.md`
  **Acceptance**: Valid SKILL.md. Content covers spec template structure, FR-001 format, success criteria guidelines, quality validation checklist, max-3 NEEDS CLARIFICATION rule.
  
  **Content outline** (distilled from Spec Kit's ~250-line specify.md prompt):
  ```markdown
  ---
  name: sdd-specification
  description: "Spec-Driven Development: Feature specification format and quality validation"
  ---
  
  <SDDSpecification>
  ## Feature Specification Format
  Specs live at `.specify/features/{slug}/spec.md`.
  
  ### Mandatory Sections
  1. **User Scenarios & Testing**: P1/P2/P3 user stories with Given/When/Then acceptance scenarios
  2. **Functional Requirements**: FR-001 numbered, MUST language, testable, max 3 NEEDS CLARIFICATION
  3. **Success Criteria**: SC-001 numbered, measurable, technology-agnostic
  4. **Edge Cases**: Boundary conditions and error scenarios
  5. **Key Entities** (if data): Entity names, attributes, relationships
  6. **Assumptions**: Reasonable defaults documented explicitly
  
  ### Quality Validation Checklist
  [10-item checklist: no impl details, user value focus, testable requirements, etc.]
  
  ### Reasonable Defaults (don't ask)
  [Data retention, performance, error handling, auth method defaults]
  </SDDSpecification>
  ```

- [x] 10. **Create skill: `sdd-clarify`**
  **What**: Skill teaching agents the SDD clarify methodology — ambiguity taxonomy, prioritization, sequential questioning loop. Assigned to Shuttle.
  **Files**: `examples/workflows/github-speckit/skills/sdd-clarify/SKILL.md`
  **Acceptance**: Valid SKILL.md. Content covers the 11-category ambiguity taxonomy, question format (multiple-choice with recommended option), max-5 rule, incremental spec updates, coverage summary.
  
  **Content outline** (distilled from Spec Kit's ~200-line clarify.md prompt):
  ```markdown
  ---
  name: sdd-clarify
  description: "Spec-Driven Development: Ambiguity detection and clarification workflow"
  ---
  
  <SDDClarify>
  ## Ambiguity Detection Taxonomy (11 Categories)
  [1. Functional Scope, 2. Domain/Data, 3. UX Flow, 4. Non-Functional, 5. Integration,
   6. Edge Cases, 7. Constraints, 8. Terminology, 9. Completion Signals, 10. Placeholders, 11. Unresolved]
  
  ## Questioning Rules
  - Max 5 questions, one at a time, multiple-choice with recommended option
  - Prioritize by (Impact × Uncertainty)
  - Only ask if answer materially impacts architecture/data/tasks/tests/UX/compliance
  
  ## Spec Update Rules
  - Add `## Clarifications` section with `### Session YYYY-MM-DD`
  - Record Q&A pairs, update most relevant spec section
  
  ## Coverage Summary (at end)
  Report each taxonomy category: Resolved / Deferred / Clear / Outstanding
  </SDDClarify>
  ```

- [x] 11. **Create skill: `sdd-planning`**
  **What**: Skill teaching Pattern the SDD plan format, phase structure, and constitution check gates. Assigned to Pattern.
  **Files**: `examples/workflows/github-speckit/skills/sdd-planning/SKILL.md`
  **Acceptance**: Valid SKILL.md. Content covers SDD plan structure (Phase 0 research, Phase 1 design), constitution check gates, data-model format, dual-plan bridging to `.weave/plans/`.
  
  **Content outline** (distilled from Spec Kit's ~100-line plan.md prompt):
  ```markdown
  ---
  name: sdd-planning
  description: "Spec-Driven Development: Implementation planning with constitution gates"
  ---
  
  <SDDPlanning>
  ## SDD Plan Structure
  Plans at `.specify/features/{slug}/plan.md` + bridged `.weave/plans/{slug}.md`.
  
  ### Sections
  1. Technical Context (stack, architecture, mark unknowns)
  2. Constitution Check (each principle: ✅/⚠/❌)
  3. Phase 0 — Research (resolve unknowns → research.md)
  4. Phase 1 — Design (entities → data-model.md, contracts)
  
  ### Weave Plan Bridge
  Standard Weave plan with TL;DR, Context, Objectives, TODOs, Verification sections.
  Checkboxed `- [ ] T001 [P?] [US?] Description` task format.
  </SDDPlanning>
  ```

- [x] 12. **Create skill: `sdd-analysis`**
  **What**: Skill teaching Thread the cross-artifact consistency analysis methodology. Assigned to Thread (read-only explorer).
  **Files**: `examples/workflows/github-speckit/skills/sdd-analysis/SKILL.md`
  **Acceptance**: Valid SKILL.md. Content covers the 6 detection passes (coverage gaps, duplication, ambiguity, constitution alignment, inconsistency, underspecification), semantic model building, severity assignment (CRITICAL/HIGH/MEDIUM/LOW), report table format.
  
  **Content outline** (distilled from Spec Kit's ~200-line analyze.md prompt):
  ```markdown
  ---
  name: sdd-analysis
  description: "Spec-Driven Development: Cross-artifact consistency and coverage analysis"
  ---
  
  <SDDAnalysis>
  ## Cross-Artifact Analysis (READ-ONLY)
  
  ### Semantic Model Building
  Build inventories: FR-xxx requirements, user stories, task→requirement map, constitution rules
  
  ### 6 Detection Passes
  1. Coverage Gaps, 2. Duplication, 3. Ambiguity, 4. Constitution Alignment,
  5. Inconsistency, 6. Underspecification
  
  ### Severity: CRITICAL > HIGH > MEDIUM > LOW
  
  ### Report Format
  Table: ID | Category | Severity | Location(s) | Summary | Recommendation
  Metrics: coverage %, ambiguity count, critical count. Max 50 findings.
  </SDDAnalysis>
  ```

- [x] 13. **Create example config snippet**
  **What**: A `weave-opencode.jsonc` example showing how to wire up the SDD workflow package with Weave using the new custom directory config fields.
  **Files**: `examples/workflows/github-speckit/config/weave-opencode.jsonc`
  **Acceptance**: Valid JSONC matching `WeaveConfigSchema`. Shows both `workflows.directories` and `skill_directories` pointing at the example's subdirectories, plus agent skill assignments.
  
  **Content**:
  ```jsonc
  {
    // Weave configuration for SDD workflow integration
    // 
    // To use this workflow package, merge these settings into your project's
    // .opencode/weave-opencode.jsonc file. Adjust the paths to point to
    // wherever you've placed the github-speckit directory.
    //
    // If you copied the package to your project root:
    //   "workflows": { "directories": ["github-speckit/workflows"] }
    //   "skill_directories": ["github-speckit/skills"]
    //
    // If using from the Weave repo examples:
    //   "workflows": { "directories": ["examples/workflows/github-speckit/workflows"] }
    //   "skill_directories": ["examples/workflows/github-speckit/skills"]

    "workflows": {
      "directories": ["examples/workflows/github-speckit/workflows"]
    },
    "skill_directories": ["examples/workflows/github-speckit/skills"],

    "agents": {
      // Shuttle handles constitution, specify, clarify, tasks, and implement steps
      "shuttle": {
        "skills": ["sdd-constitution", "sdd-specification", "sdd-clarify"]
      },
      // Pattern handles the plan step
      "pattern": {
        "skills": ["sdd-planning"]
      },
      // Thread handles the analyze step
      "thread": {
        "skills": ["sdd-analysis"]
      }
      // Weft and Warp use inline review criteria from workflow step prompts
    }
  }
  ```

- [x] 14. **Create README for the example package**
  **What**: Documentation explaining what the SDD workflow package is, how to install/configure it, what each step does, and what artifacts it produces. Include a version pin for the upstream Spec Kit commit/release.
  **Files**: `examples/workflows/github-speckit/README.md`
  **Acceptance**: Clear, actionable README covering: overview, prerequisites, installation (copy + config), usage (`/run-workflow spec-driven "goal"`), step-by-step walkthrough, artifact directory structure (`.specify/`), customization guidance, and an "Upstream" section with pinned version.
  
  **Sections**:
  1. **Overview**: What is Spec-Driven Development, what this package provides
  2. **Quick Start**: Copy package, add config, run workflow
  3. **Configuration**: Full config example with agent skill assignments
  4. **Workflow Steps**: Table of all 11 steps with type/agent/what it does
  5. **Artifact Structure**: The `.specify/` directory tree that gets created
  6. **Skills Reference**: What each skill teaches and which agent uses it
  7. **Design Decisions**: Why these agent assignments, why `.specify/` separate from `.weave/`
  8. **Upstream**: Version pin — "Based on [github/spec-kit](https://github.com/github/spec-kit) @ `<commit-sha>` / `<tag>`". Link to releases page for manual checks.

- [x] 15. **Create GitHub Action for upstream Spec Kit change detection**
  **What**: A scheduled GitHub Action that checks for new Spec Kit releases or commits and opens an issue if the upstream has changed since our last sync.
  **Files**: `.github/workflows/speckit-upstream-check.yml`
  
  **Implementation**:
  ```yaml
  name: Check Spec Kit Upstream
  on:
    schedule:
      - cron: '0 9 1 * *'  # Monthly, 1st of month at 9am UTC
    workflow_dispatch: {}    # Allow manual trigger
  
  jobs:
    check-upstream:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        
        - name: Get pinned version from README
          id: pinned
          run: |
            # Extract the pinned commit SHA from the README
            PINNED=$(grep -oP '(?<=@ `)[a-f0-9]+(?=`)' examples/workflows/github-speckit/README.md || echo "unknown")
            echo "sha=$PINNED" >> $GITHUB_OUTPUT
        
        - name: Get latest Spec Kit info
          id: latest
          run: |
            # Get latest commit on main
            LATEST=$(gh api repos/github/spec-kit/commits/main --jq '.sha' 2>/dev/null || echo "unknown")
            LATEST_SHORT=${LATEST:0:7}
            # Get latest release tag
            LATEST_TAG=$(gh api repos/github/spec-kit/releases/latest --jq '.tag_name' 2>/dev/null || echo "none")
            echo "sha=$LATEST_SHORT" >> $GITHUB_OUTPUT
            echo "full_sha=$LATEST" >> $GITHUB_OUTPUT
            echo "tag=$LATEST_TAG" >> $GITHUB_OUTPUT
          env:
            GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        
        - name: Compare and open issue if changed
          if: steps.pinned.outputs.sha != steps.latest.outputs.sha && steps.pinned.outputs.sha != 'unknown' && steps.latest.outputs.sha != 'unknown'
          run: |
            # Check if an issue already exists
            EXISTING=$(gh issue list --label "upstream-sync" --state open --json number --jq 'length')
            if [ "$EXISTING" -gt 0 ]; then
              echo "Open upstream sync issue already exists, skipping"
              exit 0
            fi
            
            gh issue create \
              --title "Spec Kit upstream updated — review examples/workflows/github-speckit/" \
              --label "upstream-sync" \
              --body "$(cat <<EOF
            ## Upstream Change Detected
            
            The [github/spec-kit](https://github.com/github/spec-kit) repository has been updated.
            
            - **Pinned version**: \`${{ steps.pinned.outputs.sha }}\`
            - **Latest commit**: \`${{ steps.latest.outputs.sha }}\` ([view](https://github.com/github/spec-kit/commit/${{ steps.latest.outputs.full_sha }}))
            - **Latest release**: \`${{ steps.latest.outputs.tag }}\`
            
            ### Action Required
            1. Review changes: https://github.com/github/spec-kit/compare/${{ steps.pinned.outputs.sha }}...${{ steps.latest.outputs.sha }}
            2. Check if any command prompts or templates changed
            3. Update affected skills in \`examples/workflows/github-speckit/skills/\`
            4. Update the pinned version in \`examples/workflows/github-speckit/README.md\`
            
            > This issue was created automatically by the upstream check workflow.
            EOF
            )"
          env:
            GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  ```
  
  **Key behaviors**:
  - Runs monthly (1st of month) + manual trigger
  - Extracts pinned SHA from README, compares to latest Spec Kit commit
  - Opens issue with diff link and checklist if upstream changed
  - Skips if an open `upstream-sync` issue already exists (no spam)
  - Uses `GITHUB_TOKEN` (no extra secrets needed)
  
  **Acceptance**: 
  - Workflow file is valid YAML
  - `workflow_dispatch` allows manual testing
  - Issue includes comparison link and actionable checklist
  - Won't create duplicate issues

## Design Decisions

### Why Custom Directories Instead of Copying to `.opencode/`
Users should be able to install workflow packages without polluting their `.opencode/` directory. Custom directory support lets users:
1. Keep packages in `node_modules/`, `vendor/`, or any other location
2. Version packages independently from project config
3. Share packages across multiple projects via absolute paths
4. Use the `examples/` directory directly during Weave development

### Override Precedence: user < custom < project
Custom directories are scanned after user-level but before project-level. This means:
- Custom packages provide defaults
- Project `.opencode/workflows/` can override any custom workflow by name
- User `~/.config/opencode/workflows/` has lowest priority (as before)

### Why `skill_directories` is Top-Level (Not Under a `skills` Subsection)
Skills don't have their own config subsection in `WeaveConfigSchema` — `disabled_skills` is already top-level. Adding `skill_directories` at the same level maintains consistency. If a `SkillConfigSchema` subsection is added later, both fields can be moved there.

### Why Shuttle for Constitution/Specify/Clarify/Tasks/Implement (not Loom)
Loom is a coordinator — it delegates, it doesn't do deep work. These steps require full tool access (read + write files). The workflow engine handles step transitions, replacing Loom's coordination role.

### Why Pattern Only for the Plan Step
Pattern is purpose-built for planning: reads code, produces `.weave/plans/*.md`, never implements. The SDD plan step is exactly Pattern's specialty.

### Why Thread for Analyze (not Weft)
The analyze step is read-only cross-artifact analysis — Thread's wheelhouse. Weft's review mode is verdict-oriented (APPROVE/REJECT), which doesn't fit the analysis report format.

### Why Keep `.specify/` Separate from `.weave/`
- `.specify/` = SDD specification artifacts (specs, plans, research, data models)
- `.weave/` = execution artifacts (plans with checkpoints, state, learnings)
- The Weave plan at `.weave/plans/{slug}.md` bridges the two
- Updating SDD conventions only touches `.specify/`, not Weave internals

### Why 11 Steps (Not 7 Like Spec Kit)
Spec Kit has 7 phases: constitution → specify → clarify → plan → tasks → implement (+ optional analyze). We add 4 review gates:
1. **Spec review** (after specify) — catches bad specs before planning
2. **Plan review** (after plan) — catches infeasible plans before tasking
3. **Code review** (after implement) — catches quality issues
4. **Security audit** (after implement) — mandatory for regulated environments

### Handling Directory/Path Setup Without Shell Scripts
Spec Kit uses shell scripts for directory creation. In Weave, step prompts tell agents exact paths to create. Agents have full filesystem access via Shuttle.

## Verification

### Phase 1 Verification (Custom Directory Support)
- [ ] `bun test src/features/workflow/discovery.test.ts` — all existing + new custom dir tests pass
- [ ] `bun test src/features/skill-loader/loader.test.ts` — all existing + new custom dir tests pass
- [ ] `bun test` — full test suite passes, no regressions
- [ ] `WeaveConfigSchema.parse({ workflows: { directories: ["custom"] }, skill_directories: ["custom"] })` succeeds
- [ ] `WeaveConfigSchema.parse({})` still succeeds (backward compat)
- [ ] `discoverWorkflows(dir)` without custom dirs returns same results as before
- [ ] `discoverWorkflows(dir, ["relative/path"])` resolves relative to `dir`
- [ ] `discoverWorkflows(dir, ["/absolute/path"])` uses absolute path as-is
- [ ] Relative path resolution works for both workflow and skill directories

### Phase 2 Verification (Example Package)
- [ ] `examples/workflows/github-speckit/workflows/spec-driven.jsonc` is valid JSONC
- [ ] Workflow passes Weave's `WorkflowDefinitionSchema` validation (can verify by importing and parsing in a test)
- [ ] All 5 SKILL.md files have valid YAML frontmatter with `name` and `description` fields
- [ ] Config example `weave-opencode.jsonc` is valid JSONC matching `WeaveConfigSchema`
- [ ] With example config merged into project config, `/run-workflow` lists `spec-driven` as available
- [ ] `/run-workflow spec-driven "test feature"` starts the workflow without errors
- [ ] Each step transitions to the correct agent
- [ ] Artifacts flow correctly between steps (constitution_path → spec_path → plan_path)
- [ ] Gate steps properly pause on [REJECT]
- [ ] `.specify/` directory structure is created by agents during execution
- [ ] No Spec Kit CLI, Python, or shell scripts required
- [ ] Skills are loaded and appear in agent prompts when assigned

## Future Enhancements (Not in Scope)

- **Conditional clarify skip**: Skip clarify if no NEEDS CLARIFICATION markers exist (requires Weave conditional steps)
- **Parallel reviews**: Run Weft and Warp simultaneously after implementation (requires Weave parallel steps)
- ~~**Spec Kit template sync**~~: Now covered by TODO 15 (GitHub Action)
- **Analyze remediation**: Upgrade analyze from read-only to optional auto-fix
- **Constitution-aware Warp**: Teach Warp to read constitution and audit against project-specific security principles
- **Package manager distribution**: Publish `github-speckit` as an npm package for easier installation
- **Multiple custom dir scopes**: Allow custom dirs to specify their own scope ("user" vs "project") for override precedence
