---
name: sdd-orchestration
description: "Spec-Driven Development: Orchestration protocol — working-spec.json lifecycle, phase management, initialization, and delegation guidance for SDD workflows"
---

<SDDOrchestration>

## Spec-Driven Development Orchestration

When the user wants to build a feature using Spec-Driven Development (SDD), you manage the full lifecycle: initialize → constitute → specify → clarify → plan → analyze → implement → review. You handle the interactive phases (constitution, specification, clarification) yourself. You delegate autonomous phases to specialist agents.

### Loading SDD Skills

Before each phase, load the relevant skill using the skill tool:

| Phase | Skill to load | Why |
|-------|--------------|-----|
| Constitution | `sdd-constitution` | Constitution template, versioning rules, quality rules |
| Specification | `sdd-specification` | Spec format (FR-001, SC-001), validation checklist |
| Clarification | `sdd-clarify` | Ambiguity taxonomy, prioritization, questioning protocol |

When delegating, tell the delegate which skill to load:
- **Pattern** → tell it to load `sdd-planning` (SDD plan format, task breakdown, Weave plan bridge)
- **Thread** → tell it to load `sdd-analysis` (6-pass consistency analysis methodology)

### Shared State: `.specify/working-spec.json`

This file tracks SDD progress across sessions. Read it at the start of any SDD-related conversation.

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

**Status values** (ordered phases):
`initialized` → `constituting` → `specifying` → `clarifying` → `planning` → `analyzing` → `implementing` → `reviewing` → `complete`

**Update after each phase transition**: set `status`, append to `phase_history`, update `updated_at`, populate `paths` as artifacts are created.

### Starting a New Feature

When the user says "I want to build X" (or similar, with or without mentioning SDD):

1. Generate a feature slug (lowercase, hyphens — e.g. "user-authentication")
2. Confirm slug and goal with the user
3. Create directories: `.specify/memory/` (if needed), `.specify/features/{slug}/`, `.specify/features/{slug}/checklists/`
4. Write `.specify/working-spec.json` with status `"initialized"`, all paths populated
5. If `.specify/memory/constitution.md` exists: read it, summarize, ask if updates needed
6. If not: load the `sdd-constitution` skill and proceed to constitution drafting

### Phase Guidance

**Constitution** (interactive — you do this):
Load `sdd-constitution` skill. Update status → `"constituting"`. Ask about core principles (3-5) and governance. Offer sensible defaults. Write `.specify/memory/constitution.md` using the format from the skill.

**Specification** (autonomous — you do this):
Load `sdd-specification` skill. Update status → `"specifying"`. Read constitution, write spec at `.specify/features/{slug}/spec.md` using the format from the skill. Create requirements checklist at `checklists/requirements.md`.

**Clarification** (interactive — you do this):
Load `sdd-clarify` skill. Update status → `"clarifying"`. Scan spec for ambiguities using the methodology from the skill. Ask up to 5 questions, one at a time, multiple-choice with recommended option. Update spec after each answer.

**Planning** (delegate to Pattern):
Tell Pattern to load the `sdd-planning` skill. Delegate with: feature goal, slug, spec path, constitution path, feature directory. Pattern creates `plan.md`, `tasks.md`, and `.weave/plans/{slug}.md`. Update status → `"planning"`.

**Analysis** (delegate to Thread):
Tell Thread to load the `sdd-analysis` skill. Delegate with all artifact paths. Thread writes `analysis.md`. Update status → `"analyzing"`.

**Review** (delegate to Weft/Warp):
Give Weft artifact paths, ask for APPROVE/REJECT. For security review, use Warp. Update status → `"reviewing"`.

**Implementation** (hand off to Tapestry):
Tell the user to run `/start-work`. The Weave plan is at `.weave/plans/{slug}.md`. Update status → `"implementing"`.

### Soft Sequencing

Before each SDD action, check `working-spec.json` status. If the user skips steps, note it conversationally and suggest the recommended next step — but always proceed if they insist.

Example: "I notice we haven't clarified the spec yet. The clarification step often catches ambiguities that save rework later. Want me to run through it, or should I plan from the current spec?"

</SDDOrchestration>
