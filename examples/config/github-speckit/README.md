# GitHub Spec Kit — Weave Configuration

A [Weave](https://github.com/pgermishuys/opencode-weave) configuration package that brings [GitHub Spec Kit](https://github.com/github/spec-kit)'s Spec-Driven Development (SDD) methodology into Weave through **6 on-demand skills** — no custom agents, no prompt injection, no workflow engine.

## What This Provides

- **6 skills** that agents load on demand via the skill tool when SDD work is needed
- **Zero prompt overhead** — skills aren't injected into system prompts; agents load them only when the task calls for it
- **Loom stays untouched** — no agent overrides, no disabled agents
- **Shared state** via `.specify/working-spec.json` — tracks current phase across sessions
- **One line of config** — just point `skill_directories` at the skills folder

## Quick Start

### Step 1: Add `$schema` and `skill_directories`

Add to your project's `.opencode/weave-opencode.jsonc`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/pgermishuys/opencode-weave/main/schema/weave-config.schema.json",

  // OPTION A — development (running from the Weave repo):
  "skill_directories": ["examples/config/github-speckit/skills"],

  // OPTION B — after copying the package to your project root:
  // "skill_directories": ["github-speckit/skills"]
}
```

Use the raw GitHub URL when you want editor completions against the schema published by the Weave repository. If you copy `schema/weave-config.schema.json` into your own repository, switch `$schema` to a local relative path instead so validation keeps working offline.

### Step 2: Talk to Loom

Just mention SDD or describe what you want to build:

```
You: Let's use SDD to build user authentication with email/password and OAuth
Loom: [loads sdd-orchestration skill] I'll use the slug `user-authentication`. Does that look right?
```

Loom loads the `sdd-orchestration` skill, which tells it the full SDD lifecycle. It creates the `.specify/` structure, then loads phase-specific skills as needed — `sdd-constitution` for drafting principles, `sdd-specification` for writing the spec, `sdd-clarify` for resolving ambiguities.

When it's time to delegate, Loom tells Pattern to load `sdd-planning` and Thread to load `sdd-analysis`.

## User Workflow

1. **"Let's use SDD to build X"** → Loom loads `sdd-orchestration`, initializes `.specify/working-spec.json`, confirms the feature slug
2. **Constitution phase** → Loom loads `sdd-constitution`, asks about core principles and governance, writes `.specify/memory/constitution.md`
3. **Spec phase** → Loom loads `sdd-specification`, reads the constitution, writes `.specify/features/{slug}/spec.md`
4. **Clarification phase** → Loom loads `sdd-clarify`, scans for ambiguities, asks up to 5 targeted questions one at a time
5. **"Plan this"** → Loom delegates to Pattern, telling it to load `sdd-planning`; Pattern produces `plan.md`, `tasks.md`, and `.weave/plans/{slug}.md`
6. **"Review the plan"** → Loom delegates to Weft for an APPROVE/REJECT verdict
7. **"Analyze for gaps"** → Loom delegates to Thread, telling it to load `sdd-analysis`; Thread writes `analysis.md`
8. **"Implement"** → Loom tells you to run `/start-work` to hand off to Tapestry, which executes `.weave/plans/{slug}.md`
9. **"Security review"** → Loom delegates to Warp for a security audit

## Configuration Reference

| Config field | Purpose |
|---|---|
| `$schema` | Points your editor at Weave's generated JSON Schema for completion and validation. |
| `skill_directories` | Points Weave at this package's `skills/` directory. That's it. |

**Path options**:
- **OPTION A** (from Weave repo): `"examples/config/github-speckit/skills"`
- **OPTION B** (copied to project root): `"github-speckit/skills"`

No `agents` overrides. No `custom_agents`. No `disabled_agents`. Skills are loaded on demand by whichever agent needs them.

## How Skills Get Used

| Skill | What it teaches | Loaded by | When |
|-------|----------------|-----------|------|
| `sdd-orchestration` | Working-spec.json lifecycle, phase management, initialization flow, delegation guidance, soft sequencing | Loom | When user starts SDD work |
| `sdd-constitution` | Constitution template, semantic versioning rules, Sync Impact Report format, quality rules | Loom | Constitution phase |
| `sdd-specification` | Spec format (FR-001, SC-001, P1/P2/P3 stories), quality validation checklist, reasonable defaults | Loom | Specification phase |
| `sdd-clarify` | 11-category ambiguity taxonomy, prioritization heuristic (Impact × Uncertainty), questioning protocol | Loom | Clarification phase |
| `sdd-planning` | SDD plan format (Phase 0/1), constitution check gates, Weave plan bridge format, task T### format | Pattern | Planning phase (delegated) |
| `sdd-analysis` | Semantic model building, 6 detection passes, severity assignment (CRITICAL/HIGH/MEDIUM/LOW) | Thread | Analysis phase (delegated) |

## Agent Roles

| Agent | Role | Loads skill |
|-------|------|------------|
| **Loom** | User interface — orchestrates the full SDD lifecycle, handles interactive phases | `sdd-orchestration` + phase-specific skills |
| **Pattern** | Implementation planning — creates SDD plan, Weave execution plan, task list | `sdd-planning` (told to by Loom) |
| **Thread** | Cross-artifact analysis — 6-pass consistency check, finds gaps and conflicts | `sdd-analysis` (told to by Loom) |
| **Weft** | Spec/plan/code review — produces APPROVE/REJECT verdicts | (none — uses general review) |
| **Warp** | Security review — OWASP checks, credential safety | (none — uses general audit) |
| **Tapestry** | Plan execution — runs `.weave/plans/{slug}.md` step by step | (none — executes plans) |

## Artifact Structure

After a complete SDD cycle, your project will have:

```
.specify/
├── memory/
│   └── constitution.md              # Project governance document
└── features/
    └── {slug}/
        ├── spec.md                  # Feature specification (FR-001, SC-001 format)
        ├── plan.md                  # SDD implementation plan
        ├── tasks.md                 # Granular task list (T001 [P1] [US1] format)
        ├── analysis.md              # Cross-artifact consistency findings
        └── checklists/
            └── requirements.md     # FR coverage checklist

.weave/
└── plans/
    └── {slug}.md                    # Weave execution plan (Tapestry-executable)

.specify/working-spec.json           # Shared state — current phase and artifact paths
```

## Shared State: `working-spec.json`

Loom reads and writes `.specify/working-spec.json` to track progress across sessions:

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

## Design Decisions

### Why on-demand skills instead of agent overrides?

OpenCode's skill tool loads skills into context only when an agent calls for them. This means SDD methodology doesn't consume tokens on non-SDD work. Using `agents.loom.skills` would prepend ~400 lines of SDD content to every single request — even "fix this typo." On-demand loading is the right mechanism.

### Why no custom agents?

Loom is a powerful orchestrator with delegation, sidebar todos, plan workflows, and multi-agent coordination. The SDD lifecycle's interactive phases (constitution, clarification) work naturally because Loom is already the user's conversational interface. A custom agent would lose all of that.

### Why soft sequencing instead of workflow gates?

Hard gates that block progress are frustrating when the user knows what they're doing. Soft sequencing warns the user if they skip steps ("I notice we haven't clarified the spec yet — want to do that first?") but always proceeds if they insist. The user is in control.

### Why `.specify/` is separate from `.weave/`?

- `.specify/` = SDD specification artifacts (constitution, specs, plans, research) — belong to the feature
- `.weave/` = Weave execution artifacts (plans with checkboxes, state, learnings) — belong to the execution engine

The Weave plan at `.weave/plans/{slug}.md` bridges the two: it's the Tapestry-executable version of the SDD plan.

## Upstream

Based on [github/spec-kit](https://github.com/github/spec-kit) @ `f8da535` (2026-03-27).

Check for updates: https://github.com/github/spec-kit/releases

> An automated GitHub Action (`speckit-upstream-check.yml`) runs monthly and opens an issue if the upstream has changed since this version was pinned. See `.github/workflows/speckit-upstream-check.yml`.
