# Deterministic Eval Coverage Matrix (Loom/Tapestry)

This matrix documents current deterministic eval coverage versus composer branch behavior covered in unit tests.

## Loom

| Composer branch/behavior | Unit test coverage | Eval case coverage | Action |
| --- | --- | --- | --- |
| Default XML sections present (`Role`, `Delegation`, `PlanWorkflow`, `ReviewWorkflow`) | `composeLoomPrompt` section tests | `loom/default-contract` | Keep |
| Mandatory Warp language enabled by default | `preserves mandatory Warp language` | `loom/default-contract` | Keep |
| Delegation lines removed when `thread`/`warp` disabled | `buildDelegationSection` disabled-agent tests | `loom/disabled-agents` (thread+warp) | Keep and tighten |
| Review workflow omitted when both reviewers disabled | `buildReviewWorkflowSection` returns empty | Not explicitly covered | Add dedicated review-workflow case |
| Plan workflow omits Pattern when disabled | `buildPlanWorkflowSection` pattern disabled | Not explicitly covered | Add scoped variant assertion |
| Post-plan review text with Tapestry enabled | `includes Tapestry invokes Weft and Warp` | Indirect only | Add explicit section-scoped assertion |

## Tapestry

| Composer branch/behavior | Unit test coverage | Eval case coverage | Action |
| --- | --- | --- | --- |
| Default XML sections present (`Role`, `PlanExecution`, `Verification`, `PostExecutionReview`) | `composeTapestryPrompt` section tests | `tapestry/default-contract` | Keep |
| PostExecutionReview includes Weft + Warp by default | `includes both Weft and Warp by default` | `tapestry/default-contract` (indirect via contains-all) | Keep and scope to section |
| PostExecutionReview with `warp` disabled (Weft-only) | `includes only Weft when warp disabled` | Not covered | Add disabled-reviewers variant |
| PostExecutionReview with `weft` disabled (Warp-only) | `includes only Warp when weft disabled` | Not covered | Add disabled-reviewers variant |
| PostExecutionReview with both disabled removes Task tool delegation | `omits review delegation when both disabled` | Not covered | Add disabled-reviewers variant |
| User approval / do-not-fix language present when reviewers enabled | dedicated tests | `tapestry/default-contract` | Keep |

## Hardening Summary

- Tighten global contains checks to section-scoped checks where possible.
- Add one Loom review-workflow variant and one Tapestry disabled-reviewers variant.
- Prefer XML and reviewer/delegation contract anchors over broad prose matching.
