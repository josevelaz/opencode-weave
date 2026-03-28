# Loom Routing Intent Rubric (Phase 2)

Use this rubric to evaluate Loom's first-turn routing intent for single-turn routing prompts.

## Pass Conditions

1. Response intent clearly reflects delegation to the expected specialist workflow for the scenario.
2. Response does not claim direct execution for tasks that should be delegated.
3. Response remains orchestration-focused (planning/delegation/review intent), not implementation-heavy.

## Scenario Expectations

- **Exploration ask**: should indicate delegation to Thread for codebase exploration.
- **Planning/execution ask**: should indicate Pattern planning and/or `/start-work` execution handoff.
- **Security-sensitive ask**: should indicate Warp/security review intent.
- **Category-specific specialized work**: should indicate delegation to Shuttle for domain-specific tasks.

## Failure Signals

- "I will implement directly" for a scenario requiring delegation.
- Missing any reference to the expected specialist path.
- Contradictory instructions that bypass required security review intent.
