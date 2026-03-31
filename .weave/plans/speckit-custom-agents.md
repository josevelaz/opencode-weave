# Speckit — On-Demand SDD Skills

## TL;DR
> **Summary**: Replace the workflow-engine-based SDD example with a configuration-driven approach using **6 on-demand skills** loaded via the skill tool. No custom agents, no agent overrides, no prompt injection. One line of config (`skill_directories`) makes all SDD skills available. Loom loads `sdd-orchestration` when the user starts SDD work, which tells it the lifecycle and which phase-specific skills to load. Delegates tell Pattern/Thread which skills to load too.
> **Estimated Effort**: Medium
>
> **Architecture evolution**:
> - v1: Custom `sdd-primary` agent with `mode: "primary"` that disabled Loom
> - v2: Skill overrides on builtins (`agents.loom.skills: [...]`) — prepended full content to every request
> - v3 (current): On-demand skill loading via the skill tool — zero prompt overhead, one line of config

## Context

### Original Request
Reshape the SDD example from an 11-step workflow engine approach to a purely configuration-driven approach. One custom primary agent replaces Loom as the user's interface. Builtin agents get SDD skills attached via config overrides. No TypeScript changes. The entire implementation is config files, prompt files, and documentation. The output belongs in `examples/config/github-speckit/` because this is an example of configuring Weave — not a workflow. The old `examples/workflows/` directory and all its contents must be deleted entirely.

### Key Findings

**Current implementation** (what exists at `examples/workflows/github-speckit/`):
- `workflows/spec-driven.jsonc` — 233-line workflow definition, 11 steps, 4 review gates
- `config/weave-opencode.jsonc` — points at workflows/skills, attaches skills to Shuttle/Pattern/Thread
- 5 SKILL.md files in `skills/` — encode SDD domain knowledge (constitution, specification, clarify, planning, analysis)
- `README.md` — documents the workflow approach

**Custom agent system** (what we'll use):
- `CustomAgentConfigSchema` supports: `prompt`, `prompt_file`, `model`, `display_name`, `mode` (`"subagent" | "primary" | "all"`), `category`, `cost`, `tools`, `skills`, `triggers`, `description`, `fallback_models`, `temperature`, `top_p`, `maxTokens`
- `mode: "primary"` makes the agent the user's main interface (replaces Loom)
- `prompt_file` resolves relative to `configDir` = `join(ctx.directory, ".opencode")`
- Skills are prepended to the agent prompt at build time (`buildCustomAgent` → `resolveSkills`)
- `AgentOverrideConfigSchema` supports attaching `skills` to builtins via the `agents` config section
- Custom agents are registered in Loom's delegation table via `buildCustomAgentMetadata` → `triggers`
- Known tools: `write`, `edit`, `bash`, `glob`, `grep`, `read`, `task`, `call_weave_agent`, `webfetch`, `todowrite`, `skill`
- Agent names must match `^[a-z][a-z0-9_-]*$`
- E2E test at line 553 of `e2e-regression.test.ts` demonstrates exact pattern: custom primary agent with `prompt_file`, disabled builtins, tool permissions

**Architecture decision**: Instead of 6 separate custom agents (old plan), use ONE custom primary agent that handles all interactive SDD phases itself (constitution, specifying, clarifying) and delegates to builtins for specialized work (planning → Pattern, analysis → Thread, review → Weft/Warp, implementation → Tapestry). This is simpler, more conversational, and matches how users actually want to interact.

**`prompt_file` path resolution**: `configDir` is `.opencode/` within the project root. When the user copies the config to `.opencode/weave-opencode.jsonc`, `prompt_file` paths resolve relative to `.opencode/`. The config comments should explain both path scenarios (OPTION A: from Weave repo, OPTION B: copied to project root).

**Cross-references that need updating** (files outside `examples/` that reference old paths):
1. `.github/workflows/speckit-upstream-check.yml` — references `examples/workflows/github-speckit/` in 5 places (README path, skills path, workflows path, issue title, issue body)
2. `src/shared/resolve-safe-path.test.ts` — line 14 uses `"examples/workflows/github-speckit/workflows"` as a test case
3. `src/config/schema.test.ts` — lines 145, 150, 157, 162 use `"examples/workflows/github-speckit/workflows"` and `"examples/workflows/github-speckit/skills"` as test cases; lines 218-219 use `"examples/workflows/speckit/workflows"` and `"examples/workflows/speckit/skills"`

## Objectives

### Core Objective
Provide a clean example at `examples/config/github-speckit/` showing how a single custom primary agent + skill overrides on builtins can model a complete development methodology (SDD) without the workflow engine — demonstrating Weave's extensibility through configuration alone. Delete `examples/workflows/` entirely.

### Deliverables
- [x] `examples/config/github-speckit/skills/sdd-orchestration/SKILL.md` — 6th skill with working-spec.json lifecycle, phase management, skill-loading hints for each phase
- [x] `examples/config/github-speckit/config/weave-opencode.jsonc` — Just `skill_directories` (no agent overrides)
- [x] `examples/config/github-speckit/README.md` — Documents the on-demand skills approach
- [x] `examples/config/github-speckit/skills/` — All 5 original SKILL.md files + 1 new orchestration skill
- [x] `examples/workflows/` — Entire directory deleted
- [x] `.github/workflows/speckit-upstream-check.yml` — Updated paths
- [x] `src/shared/resolve-safe-path.test.ts` — Updated test path
- [x] `src/config/schema.test.ts` — Updated test paths
- [x] ~~`examples/config/github-speckit/prompts/sdd-primary.md`~~ — DELETED (never needed; orchestration is a skill)

### Definition of Done
- [x] The `examples/workflows/` directory does not exist
- [x] `examples/config/github-speckit/` contains: `config/`, `skills/`, `README.md` (no `prompts/`, no custom agents)
- [x] `weave-opencode.jsonc` has ONLY `skill_directories` — no `agents`, no `custom_agents`, no `disabled_agents`
- [x] The `sdd-orchestration` skill includes a skill-loading table telling agents which skills to load for each phase
- [x] `skill_directories` in config points to `examples/config/github-speckit/skills`
- [x] README explains on-demand skill loading with user workflow examples
- [x] All 6 skill files exist in `examples/config/github-speckit/skills/` (5 original unchanged + 1 new)
- [x] `.github/workflows/speckit-upstream-check.yml` references `examples/config/github-speckit/` paths
- [x] Test files reference `examples/config/` paths (not `examples/workflows/`)
- [x] All tests pass (34/34)

### Guardrails (Must NOT)
- Must NOT modify any original SKILL.md file contents (domain knowledge is solid — only move them)
- Must NOT add workflow-engine concepts (no `steps`, `gates`, `artifacts`)
- Must NOT create custom agents, disable agents, or use `agents.*.skills` overrides — on-demand loading only
- Must NOT require new Weave features — everything uses existing infrastructure
- Must NOT remove `.specify/` or `.github/workflows/` conventions
- Must NOT leave any file in `examples/workflows/` — the directory must be fully deleted

---

## `working-spec.json` Schema Design

### Location
`.specify/working-spec.json`

### Schema
```json
{
  "name": "user-authentication",
  "goal": "Build user authentication with email/password and OAuth",
  "status": "specifying",
  "phase_history": [
    { "phase": "initialized", "timestamp": "2026-03-30T10:00:00Z" },
    { "phase": "constituting", "timestamp": "2026-03-30T10:05:00Z" },
    { "phase": "specifying", "timestamp": "2026-03-30T10:15:00Z" }
  ],
  "paths": {
    "constitution": ".specify/memory/constitution.md",
    "spec": ".specify/features/user-authentication/spec.md",
    "plan": ".specify/features/user-authentication/plan.md",
    "tasks": ".specify/features/user-authentication/tasks.md",
    "analysis": ".specify/features/user-authentication/analysis.md",
    "weave_plan": ".weave/plans/user-authentication.md"
  },
  "created_at": "2026-03-30T10:00:00Z",
  "updated_at": "2026-03-30T10:15:00Z"
}
```

### Status Values (Ordered Phases)
1. `"initialized"` — Structure created, no work done yet
2. `"constituting"` — Constitution is being drafted/updated
3. `"specifying"` — Feature spec is being written
4. `"clarifying"` — Ambiguities are being resolved
5. `"planning"` — Implementation plan is being created (delegated to Pattern)
6. `"analyzing"` — Cross-artifact consistency analysis (delegated to Thread)
7. `"implementing"` — Tasks are being executed (delegated to Tapestry)
8. `"reviewing"` — Reviews in progress (delegated to Weft/Warp)
9. `"complete"` — All work done

### Phase Transition Rules (Soft Sequencing)
- SDD Primary checks status before each phase transition
- If prerequisites are met → proceed normally
- If prerequisites are missing → warn conversationally: "I notice the spec hasn't been written yet. Want me to write it first, or should I proceed anyway?"
- Never hard-block — the user decides
- SDD Primary updates `working-spec.json` status and `phase_history` as it progresses

---

## SDD Primary System Prompt Design (`prompts/sdd-primary.md`)

This is the most important file. It defines the entire user experience. The prompt must be structured in clear sections with XML-style tags for readability.

### Prompt Outline

```
<Role>
SDD Primary — the user's interface for Spec-Driven Development.
You guide the user through the full SDD lifecycle: constitution → specify → clarify → plan → analyze → implement → review.
You handle constitution drafting, spec writing, and clarification yourself (you have the skills for these).
You delegate planning to Pattern, analysis to Thread, reviews to Weft/Warp, and implementation to Tapestry.
You are conversational, opinionated (with good defaults), and efficient.
</Role>

<WorkingSpec>
## Shared State: `.specify/working-spec.json`

[Full JSON schema documented inline — identical to the schema above]

### Reading
Always read `.specify/working-spec.json` at the start of any SDD-related conversation.
If it doesn't exist, you're starting fresh — ask the user what they want to build.

### Writing
Update after each phase transition:
- Set `status` to the new phase
- Append to `phase_history`
- Update `updated_at`
- Populate `paths` as artifacts are created

### Creating
When starting a new feature:
1. Generate slug from the goal (lowercase, hyphens, e.g. "user-authentication")
2. Create `.specify/` directory structure
3. Write initial `working-spec.json`
</WorkingSpec>

<Initialization>
## Starting a New Feature

When the user says "I want to build X" or similar:

1. Generate a feature slug from the description
2. Create directory structure:
   - `.specify/memory/` (if not exists)
   - `.specify/features/{slug}/`
   - `.specify/features/{slug}/checklists/`
3. Write `.specify/working-spec.json` with:
   - `name`: the slug
   - `goal`: the user's description
   - `status`: "initialized"
   - `paths`: all paths populated based on slug
   - `created_at` / `updated_at`: current ISO timestamp
   - `phase_history`: [{ "phase": "initialized", "timestamp": "..." }]
4. Check if `.specify/memory/constitution.md` exists
   - If yes: read it, summarize it, ask if updates needed
   - If no: proceed to constitution drafting
</Initialization>

<Constitution>
## Phase: Constitution Drafting

[Interactive — ask user questions, then write the constitution]

Guide the user through establishing project principles:
1. Ask about core principles (3-5 non-negotiable rules)
2. Ask about governance (how changes get approved)
3. Offer sensible defaults for each question
4. Write `.specify/memory/constitution.md` using the format from the sdd-constitution skill
5. Update `working-spec.json`: status → "constituting"

If constitution already exists, ask if the user wants to update it.
Use Sync Impact Report format for updates (from skill).
</Constitution>

<Specification>
## Phase: Spec Writing

[Autonomous — read constitution, write spec]

1. Read the constitution for alignment
2. Write spec at `.specify/features/{slug}/spec.md` with all mandatory sections:
   - Header (name, status, version, goal)
   - User Scenarios (P1/P2/P3 with Given/When/Then)
   - Functional Requirements (FR-001 format, MUST/SHOULD language)
   - Success Criteria (SC-001 format, measurable)
   - Edge Cases
   - Key Entities (if data involved)
   - Assumptions
3. Create requirements checklist at `checklists/requirements.md`
4. Apply quality rules: max 3 [NEEDS CLARIFICATION], testable FRs, no implementation details
5. Update `working-spec.json`: status → "specifying"
</Specification>

<Clarification>
## Phase: Clarification

[Interactive — ask ONE question at a time, wait for answer]

1. Read the spec and scan for ambiguities across 11 categories
2. Prioritize: Impact × Uncertainty, only ask about score ≥ 4
3. Maximum 5 questions
4. Ask ONE question at a time in multiple-choice format with a recommended option
5. After each answer: update the spec inline, record Q&A in Clarifications section
6. Provide coverage summary when done
7. Update `working-spec.json`: status → "clarifying"
</Clarification>

<Delegation>
## Delegating to Specialist Agents

### "Plan this" → Delegate to Pattern
Pattern has the `sdd-planning` skill. Tell it:
- Feature goal and slug
- Paths to spec and constitution (from working-spec.json)
- Feature directory path
- It should create: SDD plan (plan.md), Weave plan (.weave/plans/{slug}.md), and task list (tasks.md)
After Pattern returns, update working-spec.json: status → "planning"

### "Review the spec/plan" → Delegate to Weft
Give Weft the artifact paths and ask for an APPROVE/REJECT verdict.
For spec review: spec path + constitution path
For plan review: plan path + spec path + constitution path
After Weft returns, summarize the verdict to the user.

### "Analyze for gaps" → Delegate to Thread
Thread has the `sdd-analysis` skill. Tell it:
- All artifact paths from working-spec.json
- It should write analysis report to {feature_dir}/analysis.md
After Thread returns, update working-spec.json: status → "analyzing"

### "Implement" → Delegate to Tapestry
Tell the user to run `/start-work` to hand off to Tapestry.
The Weave plan at `.weave/plans/{slug}.md` is the execution plan.
Update working-spec.json: status → "implementing"

### "Security review" → Delegate to Warp
Give Warp the spec, constitution, and feature directory paths.
After Warp returns, summarize the security verdict.
Update working-spec.json: status → "reviewing"
</Delegation>

<SoftSequencing>
## Phase Awareness

Before each action, check working-spec.json status and phase_history.

Recommended order: initialize → constitute → specify → clarify → plan → review plan → analyze → implement → code review → security review

If the user skips steps or goes out of order:
- Note what's missing conversationally
- Suggest the recommended next step
- But always proceed if the user insists

Example: "I notice we haven't clarified the spec yet. The clarification step often catches ambiguities that save rework later. Want me to run through it, or should I plan from the current spec?"
</SoftSequencing>

<Style>
- Start immediately — no preamble
- Be conversational but efficient
- Use the user's language and adapt to their pace
- When initializing, confirm the feature slug and goal before proceeding
- Narrate delegations: tell the user what you're about to delegate and why
- Summarize results from delegations concisely
</Style>
```

### Critical Design Notes for the Prompt

1. **Skills are prepended automatically**: The `sdd-constitution`, `sdd-specification`, and `sdd-clarify` SKILL.md contents are prepended to the prompt by `buildCustomAgent`. The prompt should NOT duplicate skill content — it should reference skills by behavior ("use the format from your constitution skill").

2. **No template variables**: Everything comes from `working-spec.json` file reads, not `{{instance.*}}` or `{{artifacts.*}}`.

3. **Interactive phases**: Constitution and clarification are interactive — the agent asks questions and expects the user to answer. Since this is a `mode: "primary"` agent (not a subagent), multi-turn conversation works naturally.

4. **Delegation via `task()` / `call_weave_agent`**: Delegations use the standard agent delegation mechanism. The prompt should tell SDD Primary to delegate to `pattern`, `thread`, `weft`, `warp` by name.

5. **Tapestry delegation is special**: The user runs `/start-work` manually. SDD Primary should tell the user to do this, not try to invoke Tapestry directly.

---

## Config File Structure (`weave-opencode.jsonc`)

```jsonc
{
  // ─────────────────────────────────────────────────────────────────────────
  // Weave configuration for the GitHub Spec Kit SDD package
  //
  // HOW TO USE:
  //   Merge these settings into your project's .opencode/weave-opencode.jsonc
  //   Adjust directory paths to match where you placed this package.
  //
  // OPTION A — Using from the Weave repo examples directory (development):
  //   skill_directories: ["examples/config/github-speckit/skills"]
  //   prompt_file paths: "../examples/config/github-speckit/prompts/sdd-primary.md"
  //
  // OPTION B — After copying the package to your project root:
  //   skill_directories: ["github-speckit/skills"]
  //   prompt_file paths: "../github-speckit/prompts/sdd-primary.md"
  //
  // NOTE: skill_directories are relative to project root.
  //       prompt_file is relative to .opencode/ (configDir).
  //       Absolute paths and ".." traversal in skill_directories are rejected.
  //       prompt_file allows relative paths but rejects absolute paths.
  // ─────────────────────────────────────────────────────────────────────────

  // Skills directory — teaches agents SDD methodology and artifact formats
  "skill_directories": ["examples/config/github-speckit/skills"],

  // ── Builtin agent overrides ──────────────────────────────────────────────
  // Attach SDD skills to builtin agents so they understand SDD when delegated to.
  // Loom is disabled because SDD Primary replaces it.
  "disabled_agents": ["loom"],

  "agents": {
    // Pattern gets SDD planning skill — knows how to create SDD plans,
    // constitution checks, Weave execution plans, and task breakdowns
    "pattern": {
      "skills": ["sdd-planning"]
    },

    // Thread gets SDD analysis skill — knows the 6-pass cross-artifact
    // consistency analysis methodology
    "thread": {
      "skills": ["sdd-analysis"]
    }

    // Weft — used as-is for spec review, plan review, code review
    // Warp — used as-is for security review
    // Tapestry — used as-is for plan execution
    // Shuttle — not needed (SDD Primary handles interactive phases)
    // Spindle — available to Pattern implicitly for external research
  },

  // ── SDD Primary Agent ───────────────────────────────────────────────────
  // The single custom agent that replaces Loom as the user's interface.
  // Handles the full SDD lifecycle: initialize, constitute, specify, clarify,
  // then delegates to builtins for planning, analysis, review, implementation.
  "custom_agents": {
    "sdd-primary": {
      "prompt_file": "prompts/sdd-primary.md",
      "display_name": "SDD",
      "description": "Spec-Driven Development orchestrator — guides you through constitution, specification, clarification, and delegates to specialists for planning, analysis, review, and implementation",
      "mode": "primary",
      "category": "utility",
      "cost": "EXPENSIVE",
      "skills": ["sdd-constitution", "sdd-specification", "sdd-clarify"],
      "tools": {
        "read": true,
        "write": true,
        "edit": true,
        "glob": true,
        "grep": true,
        "bash": false,
        "task": true,
        "call_weave_agent": true,
        "webfetch": false,
        "todowrite": true,
        "skill": true
      },
      "triggers": [
        { "domain": "SDD", "trigger": "Spec-Driven Development lifecycle — constitution, specification, clarification, and orchestration" }
      ]
    }
  }
}
```

### Config Design Decisions

1. **`disabled_agents: ["loom"]`**: Loom must be disabled because SDD Primary has `mode: "primary"` and replaces it. Only one primary agent can be active.

2. **`task: true` and `call_weave_agent: true`**: SDD Primary needs these to delegate to Pattern, Thread, Weft, Warp.

3. **`todowrite: true`**: SDD Primary manages the sidebar todo list like Loom does.

4. **`skill: true`**: Allows SDD Primary to load skill descriptions before delegating.

5. **`bash: false`**: SDD Primary doesn't need shell access. Implementation happens via Tapestry.

6. **`webfetch: false`**: SDD Primary doesn't do external research. Spindle handles that via Pattern.

7. **No skills on Weft/Warp**: They review using general review methodology. The SDD Primary's delegation prompt gives them enough context (artifact paths, review criteria) to review effectively.

8. **`prompt_file` path**: Relative to `configDir` (`.opencode/`). Since the config says to merge into `.opencode/weave-opencode.jsonc`, the path `prompts/sdd-primary.md` resolves from `.opencode/` which means the user must copy the prompt file to `.opencode/prompts/sdd-primary.md`.

   **IMPORTANT**: `loadPromptFile` in `prompt-loader.ts` rejects absolute paths and ensures the resolved path stays within the base directory (`configDir` = `.opencode/`). A path like `examples/config/github-speckit/prompts/sdd-primary.md` would resolve to `.opencode/examples/config/...` which doesn't exist. A `..` path would resolve outside `.opencode/` and be rejected by the sandbox check.

   **FINAL RESOLUTION**: The config uses `"prompt_file": "prompts/sdd-primary.md"` (relative to `.opencode/`), and the README instructs users to copy the prompt file to `.opencode/prompts/sdd-primary.md`. The example's `prompts/` directory holds the canonical file, but the config assumes it's been copied.

   **ALTERNATIVE**: Use inline `"prompt"` instead of `prompt_file`. But the prompt is long (~3000 words), making inline JSON unwieldy. Better to use `prompt_file` with copy instructions.

---

## README Outline

```markdown
# GitHub Spec Kit — Weave Custom Agents

Brings GitHub Spec Kit's Spec-Driven Development (SDD) methodology into Weave
through a single custom primary agent and skill-enhanced builtins.

## What This Provides
- 1 custom primary agent (SDD) that replaces Loom as your interface
- 5 skills that teach agents the SDD artifact formats
- Shared state via `.specify/working-spec.json`
- No workflow engine, no CLI — purely configuration-driven

## Quick Start

### Step 1: Copy the prompt file
cp examples/config/github-speckit/prompts/sdd-primary.md .opencode/prompts/sdd-primary.md

### Step 2: Merge config
[Show the JSONC to merge into .opencode/weave-opencode.jsonc]

### Step 3: Talk to SDD
"I want to build user authentication"
→ SDD creates .specify/ structure, guides you through constitution, spec, clarification
→ "Plan this" delegates to Pattern
→ "Review the plan" delegates to Weft
→ "Analyze for gaps" delegates to Thread
→ /start-work hands off to Tapestry

## User Workflow
[Numbered steps showing the conversational flow]

## Architecture
[Diagram: SDD Primary ←→ User, with delegation arrows to Pattern, Thread, Weft, Warp, Tapestry]

## Configuration Reference
[Table of config fields and their purpose]

## Agent Roles
| Agent | Role | SDD Skills |
|-------|------|-----------|
| SDD Primary | User interface, constitution, spec, clarify | sdd-constitution, sdd-specification, sdd-clarify |
| Pattern | Planning + task generation | sdd-planning |
| Thread | Cross-artifact analysis | sdd-analysis |
| Weft | Spec/plan/code review | (none — uses general review) |
| Warp | Security review | (none — uses general audit) |
| Tapestry | Plan execution | (none — executes .weave/plans/) |

## Artifact Structure
.specify/
├── memory/constitution.md
├── features/{slug}/
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   ├── analysis.md
│   └── checklists/requirements.md
└── working-spec.json

.weave/plans/{slug}.md

## Skills Reference
[Same table as current README — unchanged]

## Design Decisions
### Why one primary agent instead of many?
### Why soft sequencing instead of gates?
### Why configuration-driven instead of workflow engine?

## Upstream
[Same spec-kit reference and version pin]
```

---

## File Operations

### Files to CREATE

| # | Path | Description |
|---|------|-------------|
| 1 | `examples/config/github-speckit/prompts/sdd-primary.md` | System prompt for the SDD primary agent (~200-300 lines) |
| 2 | `examples/config/github-speckit/config/weave-opencode.jsonc` | Custom agent + builtin overrides config |
| 3 | `examples/config/github-speckit/README.md` | Documents the custom-agents approach |
| 4 | `examples/config/github-speckit/skills/sdd-constitution/SKILL.md` | Copied from old location (content unchanged) |
| 5 | `examples/config/github-speckit/skills/sdd-specification/SKILL.md` | Copied from old location (content unchanged) |
| 6 | `examples/config/github-speckit/skills/sdd-clarify/SKILL.md` | Copied from old location (content unchanged) |
| 7 | `examples/config/github-speckit/skills/sdd-planning/SKILL.md` | Copied from old location (content unchanged) |
| 8 | `examples/config/github-speckit/skills/sdd-analysis/SKILL.md` | Copied from old location (content unchanged) |

### Files to MODIFY

| # | Path | Description |
|---|------|-------------|
| 9 | `.github/workflows/speckit-upstream-check.yml` | Update all `examples/workflows/github-speckit/` → `examples/config/github-speckit/`; remove workflow file references |
| 10 | `src/shared/resolve-safe-path.test.ts` | Update test path on line 14 from `examples/workflows/github-speckit/workflows` to `examples/config/github-speckit/skills` |
| 11 | `src/config/schema.test.ts` | Update test paths on lines 145, 150, 157, 162, 218, 219 from `examples/workflows/` to `examples/config/` |

### Files/Directories to DELETE

| # | Path | Description |
|---|------|-------------|
| 12 | `examples/workflows/` | Entire directory tree — includes `github-speckit/config/`, `github-speckit/README.md`, `github-speckit/skills/` (5 subdirs), `github-speckit/workflows/spec-driven.jsonc` |

---

## TODOs

- [x] 1. **Create `examples/config/github-speckit/prompts/sdd-primary.md` — the SDD Primary agent system prompt**
  **What**: Write the complete system prompt for the SDD primary agent. This is the centerpiece — it defines the entire user experience. The prompt must:
  - Define the agent's role as an SDD-focused orchestrator that replaces Loom
  - Document the full `working-spec.json` schema inline (JSON example + field descriptions)
  - Explain how to read, create, and update `working-spec.json`
  - Define the initialization flow: user says "I want to build X" → create `.specify/` structure, write `working-spec.json`, check for existing constitution
  - Define the constitution phase: interactive questioning about principles, governance; write/update `.specify/memory/constitution.md`; reference the `sdd-constitution` skill format (skill content is prepended automatically, so say "use the constitution format from your skills")
  - Define the specification phase: read constitution, write `.specify/features/{slug}/spec.md` with all mandatory sections (FR-001, SC-001, user scenarios, edge cases); create requirements checklist; reference the `sdd-specification` skill
  - Define the clarification phase: 11-category ambiguity scan, prioritization (Impact × Uncertainty ≥ 4), max 5 questions, one at a time, multiple-choice with recommended option, update spec after each answer; reference the `sdd-clarify` skill
  - Define delegation rules for each builtin agent:
    - Pattern: "plan this" → delegate with goal, spec path, constitution path, feature dir
    - Thread: "analyze for gaps" → delegate with all artifact paths
    - Weft: "review the spec/plan/code" → delegate with artifact paths, ask for APPROVE/REJECT
    - Warp: "security review" → delegate with spec, constitution, feature dir
    - Tapestry: "implement" → tell user to run `/start-work`, point at `.weave/plans/{slug}.md`
  - Define soft-sequencing: check status before each action, suggest next step, never hard-block
  - Include style guidelines: start immediately, be conversational, narrate delegations, summarize results
  - Use XML-style tags (`<Role>`, `<WorkingSpec>`, `<Initialization>`, etc.) consistent with Loom's prompt style
  - DO NOT duplicate skill content — the skills are prepended automatically; reference them by behavior
  - Keep total length reasonable (~200-300 lines) — concise but complete
  **Files**: Create `examples/config/github-speckit/prompts/sdd-primary.md`
  **Acceptance**: File exists; contains `working-spec.json` schema; covers all SDD phases; includes delegation rules for Pattern, Thread, Weft, Warp, Tapestry; uses XML-style section tags; contains no `{{template}}` variables; references skills without duplicating their content

- [x] 2. **Create `config/weave-opencode.jsonc` — the custom-agents config**
  **What**: Write the config file for the custom-agents approach. The config must:
  - Remove any `workflows` section entirely
  - Set `skill_directories` pointing at `examples/config/github-speckit/skills`
  - Add `disabled_agents: ["loom"]` (SDD Primary replaces Loom)
  - Add `agents` section with:
    - `pattern`: `{ "skills": ["sdd-planning"] }`
    - `thread`: `{ "skills": ["sdd-analysis"] }`
  - Add `custom_agents` section with exactly one agent: `sdd-primary`:
    - `prompt_file`: `"prompts/sdd-primary.md"` (relative to `.opencode/`)
    - `display_name`: `"SDD"`
    - `description`: descriptive text about the agent's role
    - `mode`: `"primary"`
    - `category`: `"utility"`
    - `cost`: `"EXPENSIVE"`
    - `skills`: `["sdd-constitution", "sdd-specification", "sdd-clarify"]`
    - `tools`: enable `read`, `write`, `edit`, `glob`, `grep`, `task`, `call_weave_agent`, `todowrite`, `skill`; disable `bash`, `webfetch`
    - `triggers`: one entry for SDD domain
  - Include clear comments explaining:
    - OPTION A (from Weave repo) vs OPTION B (copied to project root) path differences
    - Why Loom is disabled
    - What each builtin override does
    - Why specific tools are enabled/disabled
  - Use the exact JSONC shown in the "Config File Structure" section above
  **Files**: Create `examples/config/github-speckit/config/weave-opencode.jsonc`
  **Acceptance**: Valid JSONC; exactly 1 custom agent defined; `mode: "primary"`; Loom disabled; Pattern has `sdd-planning` skill; Thread has `sdd-analysis` skill; `skill_directories` points to `examples/config/github-speckit/skills`; all tool names from `KNOWN_TOOL_NAMES`; no workflow references

- [x] 3. **Create `README.md` — documentation for the custom-agents approach**
  **What**: Write the README documenting the custom-agents approach. Structure:
  - Title: "GitHub Spec Kit — Weave Custom Agents"
  - Intro: 1-2 sentences explaining what this is and linking to Spec Kit
  - "What This Provides": 1 custom primary agent, 5 skills, shared state via working-spec.json, configuration-driven
  - "Quick Start":
    - Step 1: Copy prompt file to `.opencode/prompts/sdd-primary.md`
    - Step 2: Merge config into `.opencode/weave-opencode.jsonc` (show the JSONC)
    - Step 3: Copy skills to project (or point `skill_directories` at examples)
    - Step 4: Talk to SDD — show example conversation
  - "User Workflow": numbered list showing the conversational flow from "I want to build X" through implementation and review
  - "Configuration": table of config fields, path notes for OPTION A vs OPTION B
  - "Agent Roles": table showing SDD Primary + all builtins with their SDD skills and purposes
  - "Artifact Structure": tree showing `.specify/` and `.weave/` directories
  - "Shared State: working-spec.json": explain the mechanism, show the schema
  - "Skills Reference": same table as current README (unchanged content)
  - "Design Decisions":
    - Why one primary agent instead of many custom subagents
    - Why soft sequencing instead of workflow gates
    - Why `.specify/` is separate from `.weave/`
    - Why Loom is disabled
  - "Upstream": same spec-kit reference and version pin
  - Remove all references to: workflow engine, `/run-workflow`, 11-step workflow, Shuttle agent, gate steps
  **Files**: Create `examples/config/github-speckit/README.md`
  **Acceptance**: No workflow references; documents SDD Primary agent; explains `working-spec.json`; includes Quick Start with copy instructions; shows user workflow; includes design decisions

- [x] 4. **Move skill files to `examples/config/github-speckit/skills/`**
  **What**: Copy all 5 SKILL.md files from `examples/workflows/github-speckit/skills/` to `examples/config/github-speckit/skills/`. Content must be byte-identical — no modifications.
  **Files**:
  - Copy `examples/workflows/github-speckit/skills/sdd-constitution/SKILL.md` → `examples/config/github-speckit/skills/sdd-constitution/SKILL.md`
  - Copy `examples/workflows/github-speckit/skills/sdd-specification/SKILL.md` → `examples/config/github-speckit/skills/sdd-specification/SKILL.md`
  - Copy `examples/workflows/github-speckit/skills/sdd-clarify/SKILL.md` → `examples/config/github-speckit/skills/sdd-clarify/SKILL.md`
  - Copy `examples/workflows/github-speckit/skills/sdd-planning/SKILL.md` → `examples/config/github-speckit/skills/sdd-planning/SKILL.md`
  - Copy `examples/workflows/github-speckit/skills/sdd-analysis/SKILL.md` → `examples/config/github-speckit/skills/sdd-analysis/SKILL.md`
  **Acceptance**: All 5 files exist in `examples/config/github-speckit/skills/`; content is identical to originals (verify with diff)

- [x] 5. **Delete the entire `examples/workflows/` directory**
  **What**: Remove the entire `examples/workflows/` directory tree. This includes:
  - `examples/workflows/github-speckit/config/weave-opencode.jsonc`
  - `examples/workflows/github-speckit/README.md`
  - `examples/workflows/github-speckit/skills/` (5 subdirectories with SKILL.md files)
  - `examples/workflows/github-speckit/workflows/spec-driven.jsonc`
  - `examples/workflows/github-speckit/workflows/`
  - `examples/workflows/github-speckit/`
  - `examples/workflows/`
  **Files**: Delete `examples/workflows/` recursively
  **Acceptance**: `examples/workflows/` does not exist; `git status` shows the deletions; no orphaned files remain

- [x] 6. **Update `.github/workflows/speckit-upstream-check.yml`**
  **What**: Update all path references from `examples/workflows/github-speckit/` to `examples/config/github-speckit/`. Specific changes needed:
  - Line 24: `examples/workflows/github-speckit/README.md` → `examples/config/github-speckit/README.md`
  - Line 102: Remove or update the line referencing `workflows/spec-driven.jsonc` (Step 7) — workflows no longer exist
  - Line 103: Remove or update the line referencing `workflows/spec-driven.jsonc` (Step 9) — workflows no longer exist
  - Line 108: `examples/workflows/github-speckit/skills/` → `examples/config/github-speckit/skills/`
  - Line 109: Remove or update the line about `examples/workflows/github-speckit/workflows/spec-driven.jsonc` — file no longer exists
  - Line 110: `examples/workflows/github-speckit/README.md` → `examples/config/github-speckit/README.md`
  - Line 125: `examples/workflows/github-speckit/` → `examples/config/github-speckit/` (issue title)
  - Remove references to "workflow steps" in the issue body — the SDD example no longer has workflows
  - Update the "Files to check" mapping to only reference skills (not workflow steps)
  **Files**: Modify `.github/workflows/speckit-upstream-check.yml`
  **Acceptance**: No references to `examples/workflows/` anywhere in the file; all paths point to `examples/config/github-speckit/`; no references to `spec-driven.jsonc`; YAML is valid

- [x] 7. **Update `src/shared/resolve-safe-path.test.ts`**
  **What**: Update the test case on line 14 that uses `examples/workflows/github-speckit/workflows` as a sample relative path. Change to a path under `examples/config/`.
  - Line 14: `"examples/workflows/github-speckit/workflows"` → `"examples/config/github-speckit/skills"`
  - Line 15: Update the expected result to match: `join(projectRoot, "examples", "config", "github-speckit", "skills")`
  **Files**: Modify `src/shared/resolve-safe-path.test.ts`
  **Acceptance**: Test passes; no references to `examples/workflows/`

- [x] 8. **Update `src/config/schema.test.ts`**
  **What**: Update test cases that use `examples/workflows/` paths. Specific changes:
  - Line 145: `"examples/workflows/github-speckit/workflows"` → `"examples/config/github-speckit/config"` (or any valid relative path under `examples/config/`)
  - Line 150: Same string in the expected value
  - Line 157: `"examples/workflows/github-speckit/skills"` → `"examples/config/github-speckit/skills"`
  - Line 162: Same string in the expected value
  - Line 218: `"examples/workflows/speckit/workflows"` → `"examples/config/speckit/workflows"` (or similar)
  - Line 219: `"examples/workflows/speckit/skills"` → `"examples/config/speckit/skills"` (or similar)
  **Files**: Modify `src/config/schema.test.ts`
  **Acceptance**: All tests pass; no references to `examples/workflows/`

---

## Verification

- [x] `examples/config/github-speckit/prompts/sdd-primary.md` exists and is non-empty
- [x] `examples/config/github-speckit/config/weave-opencode.jsonc` is valid JSONC (no syntax errors)
- [x] `examples/config/github-speckit/config/weave-opencode.jsonc` defines exactly 1 entry in `custom_agents`
- [x] `custom_agents.sdd-primary.mode` is `"primary"`
- [x] `disabled_agents` includes `"loom"`
- [x] `agents.pattern.skills` includes `"sdd-planning"`
- [x] `agents.thread.skills` includes `"sdd-analysis"`
- [x] `custom_agents.sdd-primary.skills` includes `"sdd-constitution"`, `"sdd-specification"`, `"sdd-clarify"`
- [x] `skill_directories` is `["examples/config/github-speckit/skills"]`
- [x] No `{{template}}` variables in any file
- [x] No references to workflow engine, `/run-workflow`, or `spec-driven` workflow
- [x] No references to Shuttle agent
- [x] All 5 SKILL.md files exist in `examples/config/github-speckit/skills/` with unchanged content
- [x] `examples/workflows/` directory does not exist
- [x] `prompt_file` path is relative (no absolute paths)
- [x] All tool names in `tools` config are from `KNOWN_TOOL_NAMES`: `write`, `edit`, `bash`, `glob`, `grep`, `read`, `task`, `call_weave_agent`, `webfetch`, `todowrite`, `skill`
- [x] Agent name `sdd-primary` matches pattern `^[a-z][a-z0-9_-]*$`
- [x] README includes Quick Start with prompt file copy instructions
- [x] SDD Primary prompt includes `working-spec.json` schema documentation
- [x] SDD Primary prompt includes delegation rules for Pattern, Thread, Weft, Warp, Tapestry
- [x] `.github/workflows/speckit-upstream-check.yml` has no references to `examples/workflows/`
- [x] `src/shared/resolve-safe-path.test.ts` has no references to `examples/workflows/`
- [x] `src/config/schema.test.ts` has no references to `examples/workflows/`
- [x] All existing tests pass: `bun test src/shared/resolve-safe-path.test.ts src/config/schema.test.ts`

---

## Implementation Order

```
Task 4 (copy skills) MUST come before Task 5 (delete examples/workflows/)
Tasks 1, 2, 3 (create new files) are independent of each other
Tasks 1, 2, 3 can run in parallel with Task 4
Task 5 (delete old directory) depends on Task 4 completing
Tasks 6, 7, 8 (update cross-references) are independent of each other but should follow Task 5
```

**Recommended execution order**:
1. Tasks 1, 2, 3, 4 in parallel (create new files + copy skills)
2. Task 5 (delete `examples/workflows/`)
3. Tasks 6, 7, 8 in parallel (update CI workflow + test files)

---

## Potential Pitfalls

1. **`prompt_file` sandboxing**: `loadPromptFile` requires the resolved path to stay within `configDir` (`.opencode/`). The prompt file MUST be inside `.opencode/` or it won't load. The README must instruct users to copy it there. The config's `prompt_file` should use `"prompts/sdd-primary.md"` (relative to `.opencode/`).

2. **Skill prepending**: Skills listed in `custom_agents.sdd-primary.skills` are prepended to the prompt content from `prompt_file`. This means the prompt file should NOT duplicate skill content. It should reference skill behaviors ("use the constitution format from your skills") knowing the full SKILL.md text is already in the system prompt.

3. **Prompt length**: Three SKILL.md files (constitution: 87 lines, specification: 110 lines, clarify: 123 lines) = ~320 lines of skill content prepended to the prompt. The prompt file itself should be ~200-300 lines. Total system prompt ~500-620 lines. This is within reason for a primary agent.

4. **Loom must be disabled**: If Loom is not disabled, having two `mode: "primary"` agents could cause conflicts. The config MUST include `"disabled_agents": ["loom"]`. The README should explain why.

5. **Interactive phases work naturally**: Unlike the old plan's concern about subagent single-turn limits, `mode: "primary"` means SDD Primary IS the user's conversational partner. Multi-turn interactions (constitution questions, clarification questions) work naturally — no relay through Loom needed.

6. **Pattern and Thread delegation**: When SDD Primary delegates to Pattern or Thread, it uses the `task()` tool or `call_weave_agent`. The prompt should include enough context in the delegation prompt (goal, artifact paths) for the builtin agent to do its work. The builtin's attached skills provide the methodology knowledge.

7. **`call_weave_agent` vs `task`**: Both are valid delegation mechanisms. `task()` creates a background task. `call_weave_agent` is direct delegation. The prompt should use whichever is appropriate — `task()` for autonomous work (planning, analysis), direct delegation for reviews.

8. **Skills must be copied before old directory is deleted**: Task 4 (copy skills) must complete before Task 5 (delete `examples/workflows/`). If the order is reversed, the skill files will be lost.

9. **CI workflow references to workflow files**: The `.github/workflows/speckit-upstream-check.yml` issue body references `workflows/spec-driven.jsonc` for Steps 7 and 9. Since workflows no longer exist, these lines must be removed — not just path-updated. The "Files to check" mapping should only list skill file mappings.

10. **Test paths are just example strings**: The test files in `src/shared/resolve-safe-path.test.ts` and `src/config/schema.test.ts` use `examples/workflows/` paths as sample data for schema validation and path resolution. These are not functional dependencies — they're just convenient example strings that should be updated to reflect the new directory structure.
