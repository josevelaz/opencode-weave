<p align="center">
  <img src="assets/weave_logo.png" alt="Weave" width="400">
</p>

# Weave

Weave is a lean OpenCode plugin with multi-agent orchestration. It provides a cohesive framework for weaving agents, tools, and skills into structured workflows. By delegating complex tasks to specialized agents and monitoring execution state through hooks, Weave ensures reliable and efficient project development.

## Overview

- **8 specialized agents** with weaving-themed names designed for specific roles in the development lifecycle.
- **Category-based task dispatch** to route work to domain-optimized models and configurations.
- **Skill system** for injecting domain-specific expertise that modifies agent behavior via prompt orchestration.
- **Background agent management** for parallel asynchronous sub-agent execution with concurrency control.
- **Context window monitoring** to track token usage and suggest recovery strategies when limits are approached.
- **Tool permissions** enforced per-agent to ensure safety and prevent unauthorized file modifications.
- **JSONC configuration** supporting comments and trailing commas with hierarchical user and project-level merging.

## Documentation

For detailed guides on configuration, workflows, agents, features, and more, visit the **[Weave documentation](https://tryweave.io/docs/)**.

For agent routing eval trends and dashboards, see the **[Eval Dashboard](https://tryweave.io/evals/)**.

### Config schema

Weave ships a generated config schema at `schema/weave-config.schema.json` in this repository.

- Regenerate it: `bun run schema:config`
- Verify it is current: `bun run schema:config:check`
- Use it in config files via `$schema`, preferably pinned to a release tag such as `https://raw.githubusercontent.com/pgermishuys/opencode-weave/v0.7.6/schema/weave-config.schema.json`

The npm package currently publishes `dist/` only, so if you want a local `$schema` path you should vendor `schema/weave-config.schema.json` into your own repository. Runtime config still supports JSONC comments and trailing commas even though the published schema artifact is plain JSON.

### Experimental Tapestry helper orchestration

Tapestry still defaults to direct, sequential plan execution. If you explicitly opt in with:

```jsonc
{
  "experimental": {
    "tapestry_subagent_orchestration": true
  }
}
```

Weave switches Tapestry onto an alternate prompt contract that allows **bounded helper subagent work during execution**. In this mode, `call_weave_agent` is enabled specifically for that bounded helper path, and the prompt explicitly forbids self-delegation, recursive delegation, and handing off the rest of the plan.

## Agents

| Agent | Role | Mode | Description |
| :--- | :--- | :--- | :--- |
| **Loom** | main orchestrator | primary | The central team lead that plans tasks, coordinates work, and delegates to specialized agents. |
| **Tapestry** | execution orchestrator | primary | Manages todo-list driven execution of multi-step plans. By default it executes directly; an experimental config flag can opt it into bounded helper subagent orchestration while Tapestry keeps plan ownership. |
| **Shuttle** | category worker | all | Domain-specific specialist worker with full tool access, dispatched dynamically via the category system. |
| **Pattern** | strategic planner | subagent | Analyzes requirements and produces detailed implementation plans with research and dependency mapping. |
| **Thread** | codebase explorer | subagent | Fast, read-only codebase navigation and analysis using grep, glob, and read tools. |
| **Spindle** | external researcher | subagent | Performs external documentation lookups and reference searches, providing synthesized answers with source citations. |
| **Weft** | reviewer/auditor | subagent | Reviews completed work and plans with a critical but fair eye, rejecting only for true blocking issues. |
| **Warp** | security auditor | subagent | Audits code changes for security vulnerabilities and specification compliance with a skeptical bias. |

## Installation

This package is published on [npm](https://www.npmjs.com/package/@opencode_weave/weave).

### Prerequisites

- [OpenCode](https://opencode.ai)

### Step 1: Add to opencode.json

Add the plugin to your `opencode.json` file:

```json
{
  "plugin": ["@opencode_weave/weave"]
}
```

### Step 2: Restart OpenCode

OpenCode automatically installs npm plugins at startup — no manual `bun add` or `npm install` required. The plugin loads automatically upon restart and works with zero configuration out of the box.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `404 Not Found` | Ensure the package name is correct: `@opencode_weave/weave`. |
| Package not found after publish | npm can take a few minutes to propagate. Wait and retry. |

## Uninstalling

To fully remove the Weave plugin from your project:

### Step 1: Remove from opencode.json

Delete the `@opencode_weave/weave` entry from the `plugin` array in your `opencode.json`:

```json
{
  "plugin": []
}
```

### Step 2: Clean up project artifacts (optional)

Weave may have created plan and state files during usage. Remove them if no longer needed:

```bash
rm -rf .weave/
```

You can also remove any project-level configuration if present:

```bash
rm -f .opencode/weave-opencode.jsonc .opencode/weave-opencode.json
```

### Step 3: Clean up user-level configuration (optional)

If you no longer use Weave in any project, remove the global configuration:

```bash
rm -f ~/.config/opencode/weave-opencode.jsonc ~/.config/opencode/weave-opencode.json
```

## Development

- **Build**: `bun run build`
- **Test**: `bun test`
- **Typecheck**: `bun run typecheck`
- **Clean**: `bun run clean`

## Acknowledgments

Weave was inspired by [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode) by [@code-yeongyu](https://github.com/code-yeongyu) — a pioneering OpenCode plugin that proved multi-agent orchestration, discipline agents, and structured plan-execute workflows could radically improve the developer experience. Many of Weave's core ideas — from category-based task dispatch to background agent parallelism — trace their roots to patterns Oh My OpenCode established. We're grateful for the trailblazing work and the vibrant community around it.

## License

MIT
