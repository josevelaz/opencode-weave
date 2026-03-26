# Multi-CLI Support: Adapter Architecture for OpenCode, Claude Code & Copilot CLI

## TL;DR
> **Summary**: Refactor Weave from an OpenCode-only plugin into a CLI-agnostic core with adapter modules, enabling the same 8-agent system, hooks, workflows, and analytics to work across OpenCode, Claude Code, and GitHub Copilot CLI.
> **Estimated Effort**: XL

## Context

### Original Request
Design the architecture for making Weave support multiple AI coding CLIs — OpenCode (current), Claude Code, and GitHub Copilot CLI — via an adapter pattern that normalizes each CLI's extension surface while preserving Weave's full feature set where possible.

### Key Findings

**Current coupling points to `@opencode-ai/plugin`:**
- `src/index.ts` — Exports a `Plugin` type from `@opencode-ai/plugin` (line 1, 11)
- `src/plugin/types.ts` — Types derived from `Plugin` and `ToolDefinition` from `@opencode-ai/plugin` (lines 1-21)
- `src/plugin/plugin-interface.ts` — 651-line monolith that maps ALL Weave functionality to OpenCode's 8 hook points: `tool`, `config`, `chat.message`, `chat.params`, `chat.headers`, `event`, `tool.execute.before`, `tool.execute.after`, `command.execute.before`
- `src/create-managers.ts` — Uses `PluginInput` from `@opencode-ai/plugin` (line 1)
- `src/create-tools.ts` — Uses `PluginInput` from `@opencode-ai/plugin` (line 1)
- `src/config/loader.ts` — Hardcoded paths: `~/.config/opencode/weave-opencode.json`, `{dir}/.opencode/weave-opencode.json`
- `src/features/skill-loader/loader.ts` — Hardcoded paths: `~/.config/opencode/skills/`, `{dir}/.opencode/skills/`; also calls `fetchSkillsFromOpenCode(serverUrl, directory)` where `serverUrl` comes from OpenCode's `PluginInput` (non-OpenCode CLIs have no equivalent server URL)
- `src/features/workflow/constants.ts` — Likely hardcoded `.opencode/workflows/` path
- `src/shared/agent-display-names.ts` — Display names formatted for OpenCode UI
- `src/features/builtin-commands/commands.ts` — Commands assume OpenCode slash-command system

**Files importing `AgentConfig` from `@opencode-ai/sdk` (26 files — ALL must be updated in Phase 0):**

Core agent system:
- `src/agents/types.ts` — `AgentFactory`, `AgentSource`, `AgentOverrideConfig` all reference `AgentConfig`
- `src/agents/builtin-agents.ts` — `createBuiltinAgents()` returns `Record<string, AgentConfig>`
- `src/agents/agent-builder.ts` — `buildAgent()` returns `AgentConfig`, defines `AgentConfigExtended`
- `src/agents/custom-agent-factory.ts` — `buildCustomAgentConfig()` returns `AgentConfig`

Agent factory files (each imports `AgentConfig` and returns it from factory):
- `src/agents/loom/index.ts`, `src/agents/loom/default.ts`
- `src/agents/tapestry/index.ts`, `src/agents/tapestry/default.ts`
- `src/agents/pattern/index.ts`, `src/agents/pattern/default.ts`
- `src/agents/thread/index.ts`, `src/agents/thread/default.ts`
- `src/agents/spindle/index.ts`, `src/agents/spindle/default.ts`
- `src/agents/weft/index.ts`, `src/agents/weft/default.ts`
- `src/agents/warp/index.ts`, `src/agents/warp/default.ts`
- `src/agents/shuttle/index.ts`, `src/agents/shuttle/default.ts`

Manager/plugin files:
- `src/create-managers.ts` — `agents: Record<string, AgentConfig>` parameter
- `src/managers/config-handler.ts` — `agents?: Record<string, AgentConfig>` parameter
- `src/plugin/plugin-interface.ts` — `agents: Record<string, AgentConfig>` in state

Test files (will need updated imports):
- `src/agents/agent-builder.test.ts`
- `src/agents/types.test.ts`
- `src/managers/config-handler.test.ts`
- `src/agents/custom-agent-factory.test.ts`

Reference-only (comment, no import):
- `src/tools/permissions.ts` — JSDoc comment references `AgentConfig.tools` shape

**CLI-agnostic core (already isolated):**
- `src/hooks/` — All hook logic is pure functions (context-window-monitor, write-guards, pattern-md-only, rules-injector, keyword-detector, work-continuation, verification-reminder, start-work-hook)
- `src/features/work-state/` — File-based state at `.weave/state.json` (no OpenCode dependency)
- `src/features/workflow/` — Workflow engine, templates, step management (file-based)
- `src/features/analytics/` — Session tracking, fingerprinting, token reports (file-based)
- `src/agents/` defaults — Pure prompt strings and config objects (only the `AgentConfig` type from SDK)
- `src/config/schema.ts` — Zod schema for `weave.json` (CLI-agnostic already)
- `src/tools/permissions.ts` — Tool permission maps (generic)

**Key architectural insight**: The `src/plugin/plugin-interface.ts` file is the single "adapter" that translates between Weave's internal concepts and OpenCode's plugin hooks. The refactoring strategy is to:
1. Extract a CLI-agnostic `WeaveCore` from the shared logic
2. Keep `plugin-interface.ts` as the OpenCode adapter
3. Build parallel adapters for Claude Code and Copilot CLI

## Objectives

### Core Objective
Enable Weave to function as a multi-CLI agent system where the same agent definitions, hooks, workflows, analytics, and work-state tracking work across OpenCode, Claude Code, and GitHub Copilot CLI, with graceful degradation where CLIs have fewer capabilities.

### Deliverables
- [ ] `WeaveCore` — CLI-agnostic core module containing all shared logic
- [ ] `CLIAdapter` interface — Abstract contract each CLI adapter must implement
- [ ] `OpenCodeAdapter` — Refactored from current `plugin-interface.ts` (no behavior change)
- [ ] `ClaudeCodeAdapter` — Shell-hook-based adapter for Claude Code
- [ ] `CopilotCLIAdapter` — Markdown-agent + MCP-based adapter for Copilot CLI
- [ ] `CLIDetector` — Auto-detect which CLI is running and select the right adapter
- [ ] `ConfigGenerator` — `weave init` command that generates per-CLI config files
- [ ] Multi-CLI coexistence — Multiple CLI configs can exist simultaneously in a project
- [ ] **Integration test harness** — Shared utilities for testing adapters + per-adapter integration tests
- [ ] **CLI smoke test suite** — End-to-end tests using real CLIs (gated behind `RUN_SMOKE_TESTS=true`)

### Definition of Done
- [ ] `bun test` passes with all existing tests + new adapter tests
- [ ] `bun run typecheck` passes
- [ ] OpenCode behavior is identical to current (zero regression)
- [ ] Claude Code adapter generates valid `.claude/settings.json` hook entries
- [ ] Claude Code hook scripts pass stdin/stdout integration tests (allow/block decisions, JSON protocol)
- [ ] Copilot CLI adapter generates valid `.github/agents/` markdown files
- [ ] Copilot MCP server passes in-process integration tests (`tools/list`, `tools/call`)
- [ ] All generated config files pass structural validation tests (JSON parse, frontmatter parse)
- [ ] A single `weave.json` config drives all three CLIs
- [ ] Smoke tests pass with real CLIs when `RUN_SMOKE_TESTS=true` (optional for CI)

### Guardrails (Must NOT)
- Must NOT break any existing OpenCode functionality
- Must NOT require OpenCode users to change their config
- Must NOT add `@opencode-ai/plugin` or `@opencode-ai/sdk` as dependencies of the core module
- Must NOT duplicate agent prompt definitions across adapters
- Must NOT create adapter-specific agent prompts (prompts are shared, delivery mechanism differs)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       weave.json                            │
│              (single config, CLI-agnostic)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  WeaveCore  │
                    │             │
                    │ • Agents    │   ← Agent definitions (prompts, metadata, permissions)
                    │ • Hooks     │   ← Hook logic (pure functions)
                    │ • WorkState │   ← Plan execution tracking (.weave/state.json)
                    │ • Workflows │   ← Multi-step workflow engine
                    │ • Analytics │   ← Session tracking, token reports
                    │ • Skills    │   ← Skill loading and resolution
                    │ • Commands  │   ← Command definitions (CLI-agnostic)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──┐  ┌─────▼─────┐  ┌──▼──────────┐
     │  OpenCode │  │  Claude   │  │  Copilot    │
     │  Adapter  │  │  Code     │  │  CLI        │
     │           │  │  Adapter  │  │  Adapter    │
     │ In-proc   │  │ Shell     │  │ Markdown    │
     │ JS plugin │  │ hooks +   │  │ agents +    │
     │           │  │ SKILL.md  │  │ MCP server  │
     └─────┬─────┘  └─────┬─────┘  └──────┬──────┘
           │              │               │
     ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
     │ OpenCode  │  │  Claude   │  │ Copilot   │
     │   CLI     │  │   Code    │  │   CLI     │
     └───────────┘  └───────────┘  └───────────┘

  Config Generation (weave init):

     ┌──────────────────────────────────────────────┐
     │              ConfigGenerator                  │
     │                                              │
     │  OpenCode → opencode.json (plugin entry)     │
     │  Claude   → .claude/settings.json (hooks)    │
     │            + .claude/skills/ (SKILL.md)       │
     │  Copilot  → .github/agents/ (*.md)           │
     │            + .github/copilot-instructions.md  │
     └──────────────────────────────────────────────┘
```

---

## Core Interface Definitions

### 1. WeaveCore — CLI-Agnostic Kernel

```typescript
// src/core/types.ts

/** CLI-agnostic agent definition (mirrors @opencode-ai/sdk AgentConfig without importing it) */
export interface WeaveAgentDefinition {
  name: string
  displayName: string
  description?: string
  prompt?: string
  model?: string
  /** Default model variant for this agent */
  variant?: string
  mode?: "primary" | "subagent" | "all"
  temperature?: number
  top_p?: number
  /** Maximum agentic iterations before forcing text-only response */
  steps?: number
  /** @deprecated Use 'steps' field instead */
  maxSteps?: number
  /** @deprecated Use 'permission' field instead */
  tools?: Record<string, boolean>
  /** Whether this agent is disabled */
  disable?: boolean
  /** Hide from @ autocomplete (subagent only) */
  hidden?: boolean
  /** Hex color code or theme color */
  color?: string
  /** Arbitrary agent-specific options */
  options?: Record<string, unknown>
  /** Per-tool permission rules (replaces deprecated 'tools' map) */
  permission?: WeavePermissionConfig
  metadata: AgentPromptMetadata    // from current types.ts
}

/** CLI-agnostic permission config (mirrors @opencode-ai/sdk PermissionConfig) */
export type WeavePermissionConfig = {
  read?: WeavePermissionRuleConfig
  edit?: WeavePermissionRuleConfig
  glob?: WeavePermissionRuleConfig
  grep?: WeavePermissionRuleConfig
  list?: WeavePermissionRuleConfig
  bash?: WeavePermissionRuleConfig
  task?: WeavePermissionRuleConfig
  external_directory?: WeavePermissionRuleConfig
  [key: string]: WeavePermissionRuleConfig | WeavePermissionActionConfig | undefined
} | WeavePermissionActionConfig

export type WeavePermissionRuleConfig = /* ... rule config ... */
export type WeavePermissionActionConfig = /* ... action config ... */

/** CLI-agnostic command definition */
export interface WeaveCommandDefinition {
  name: string
  description: string
  agent: string           // agent config key (e.g., "tapestry")
  template: string        // prompt template with $SESSION_ID, $TIMESTAMP, $ARGUMENTS
  argumentHint?: string
}

/** CLI-agnostic hook event types (Weave's internal event model) */
export type WeaveHookEvent =
  | "message.before"        // user message about to be sent
  | "message.after"         // assistant response received
  | "tool.before"           // tool about to execute
  | "tool.after"            // tool finished executing
  | "session.idle"          // session went idle
  | "session.created"       // new session started
  | "session.deleted"       // session ended
  | "config.init"           // config phase (register agents, commands)
  | "command.execute"       // slash command invoked
  | "params.resolve"        // chat params being resolved (model, limits)

/** Core initialization result */
export interface WeaveCoreInstance {
  agents: Record<string, WeaveAgentDefinition>
  hooks: CreatedHooks     // from current create-hooks.ts
  commands: Record<string, WeaveCommandDefinition>
  config: WeaveConfig
  analytics: Analytics | null
  directory: string
  
  // Core operations (CLI-agnostic)
  handleStartWork(promptText: string, sessionId: string): StartWorkResult
  handleWorkflowStart(promptText: string, sessionId: string): WorkflowHookResult
  handleWorkContinuation(sessionId: string): ContinuationResult
  handleWorkflowContinuation(sessionId: string, lastAssistant?: string, lastUser?: string): WorkflowContinuationResult
  checkToolBefore(agentName: string, toolName: string, filePath: string, sessionId: string): ToolCheckResult
  checkToolAfter(toolName: string, sessionId: string, callId: string): void
  handleSessionIdle(sessionId: string): IdleAction
  getAgentDisplayName(configKey: string): string
  resolveSkills(names: string[], disabled?: Set<string>): string
}
```

### 2. CLIAdapter Interface

```typescript
// src/adapters/types.ts

/** Capability flags — what a CLI can and cannot do */
export interface CLICapabilities {
  /** In-process plugin hooks (OpenCode only) */
  inProcessHooks: boolean
  /** Shell command hooks (Claude Code) */
  shellHooks: boolean
  /** Custom agent registration (OpenCode: config, Claude: subagents, Copilot: markdown) */
  agentRegistration: "plugin-config" | "skill-files" | "markdown-files" | "none"
  /** Slash commands */
  slashCommands: boolean
  /** Session management API */
  sessionAPI: boolean
  /** Programmatic prompt injection */
  promptInjection: boolean
  /** MCP server support */
  mcpSupport: boolean
  /** Tool permission enforcement */
  toolPermissions: boolean
  /** Idle loop / continuation */
  idleLoop: boolean
  /** Primary continuation mechanism */
  continuationStrategy: "prompt-async" | "mcp-channel" | "autopilot-mode" | "none"
  /** Fallback continuation mechanism (if primary unavailable) */
  continuationFallback?: "exit-code-block" | "acp-server" | "none"
  /** Fleet orchestration (parallel agents) */
  fleetOrchestration: "native" | "mcp-based" | "none"
  /** Todo/sidebar integration */
  todoIntegration: boolean
}

/** Result of adapter initialization */
export interface AdapterInitResult {
  /** Generated config files (path → content) */
  generatedFiles: Map<string, string>
  /** Warnings about features that won't work */
  warnings: string[]
}

/** Abstract CLI adapter */
export interface CLIAdapter {
  /** Human-readable CLI name */
  readonly name: string
  /** CLI identifier for config/detection */
  readonly id: "opencode" | "claude-code" | "copilot-cli"
  /** Capability flags */
  readonly capabilities: CLICapabilities
  
  /** Initialize the adapter with core instance */
  init(core: WeaveCoreInstance): Promise<AdapterInitResult>
  
  /** Generate CLI-specific config files */
  generateConfig(core: WeaveCoreInstance, outputDir: string): Promise<GeneratedConfig>
  
  /** Map a Weave agent to this CLI's agent format */
  mapAgent(agent: WeaveAgentDefinition): CLIAgentManifest
  
  /** Map a Weave hook to this CLI's hook mechanism */
  mapHook(event: WeaveHookEvent): CLIHookManifest | null
  
  /** Map a Weave command to this CLI's command mechanism */
  mapCommand(command: WeaveCommandDefinition): CLICommandManifest | null
  
  /** Feature degradation report */
  getDegradationReport(): FeatureDegradation[]
}

export interface GeneratedConfig {
  files: Array<{ path: string; content: string; description: string }>
  instructions: string[]   // human-readable setup instructions
}

export interface CLIAgentManifest {
  /** How the agent is registered in this CLI */
  type: "plugin-agent" | "skill-file" | "markdown-agent" | "system-prompt"
  /** Content for the registration (config object, markdown, etc.) */
  content: string | Record<string, unknown>
  /** File path where this agent's config lives (if file-based) */
  filePath?: string
}

export interface CLIHookManifest {
  /** How the hook is delivered */
  type: "in-process" | "shell-command" | "mcp-tool" | "unsupported"
  /** Hook name in the CLI's native format */
  nativeName?: string
  /** Shell command (for Claude Code) */
  command?: string
  /** MCP tool definition (for Copilot) */
  mcpTool?: Record<string, unknown>
}

export interface CLICommandManifest {
  type: "slash-command" | "natural-language" | "unsupported"
  nativeName?: string
  content?: string
}

export interface FeatureDegradation {
  feature: string
  status: "full" | "partial" | "unavailable"
  reason: string
  workaround?: string
}
```

### 3. CLI Detection

```typescript
// src/adapters/detect.ts

export interface CLIDetection {
  cli: "opencode" | "claude-code" | "copilot-cli" | "unknown"
  confidence: "high" | "medium" | "low"
  evidence: string[]
}

/**
 * Detection strategy (checked in order):
 * 1. WEAVE_CLI env var (explicit override)
 * 2. Process parent detection (OPENCODE_*, CLAUDE_*, GITHUB_COPILOT_*)
 * 3. Config file presence (.opencode/, .claude/, .github/copilot-instructions.md)
 * 4. SDK availability (can import @opencode-ai/plugin?)
 */
export function detectCLI(directory: string): CLIDetection
```

---

## Per-CLI Adapter Design

### A. OpenCode Adapter (Refactored Current)

**File**: `src/adapters/opencode/index.ts`

This is a thin wrapper around the current `plugin-interface.ts`. The refactoring extracts shared logic into `WeaveCore` and keeps only OpenCode-specific wiring here.

**What stays in the OpenCode adapter:**
- The `Plugin` type export and OpenCode's hook signature matching
- `config` hook → registers agents with display names, slash commands
- `chat.message` → OpenCode-specific message mutation (parts array, message.agent)
- `chat.params` → OpenCode-specific model limit capture
- `event` → OpenCode-specific event routing (session.created/deleted, message.updated, message.part.updated, tui.command.execute, session.idle)
- `tool.execute.before/after` → OpenCode's tool hook signature
- `command.execute.before` → OpenCode's command hook
- `client.session.promptAsync()` calls for continuation injection

**What moves to `WeaveCore`:**
- `handleStartWork()` logic (already in `start-work-hook.ts`)
- `handleWorkflowStart()` logic (already in `hook.ts`)
- Work continuation logic (already in `work-continuation.ts`)
- Context window monitoring (already in `context-window-monitor.ts`)
- Write guard tracking (already in `write-existing-file-guard.ts`)
- Pattern MD-only guard (already in `pattern-md-only.ts`)
- Analytics tracking (already in `session-tracker.ts`)
- Todo finalization logic (currently inline in plugin-interface.ts → extract)

**Import dependencies:**
- `@opencode-ai/plugin` — ONLY imported in this adapter
- `@opencode-ai/sdk` — ONLY imported in this adapter (for `AgentConfig` type)

### B. Claude Code Adapter

**File**: `src/adapters/claude-code/index.ts`

Claude Code uses **shell command hooks** that receive JSON on stdin and output JSON on stdout. The adapter generates:

1. **Hook Scripts** — Small executable scripts in `.claude/hooks/weave/` that invoke Weave's core logic
2. **Skill Files** — Agent prompts as `.claude/skills/` SKILL.md files
3. **Settings** — `.claude/settings.json` entries for hook registration

**How hooks work in Claude Code:**

```json
// .claude/settings.json (generated by weave init)
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "node .claude/hooks/weave/pre-tool-use.mjs"
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "node .claude/hooks/weave/post-tool-use.mjs"
      }
    ],
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node .claude/hooks/weave/user-prompt-submit.mjs"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "node .claude/hooks/weave/on-stop.mjs"
      }
    ],
    "SessionStart": [
      {
        "type": "command",
        "command": "node .claude/hooks/weave/on-session-start.mjs"
      }
    ]
  }
}
```

**Hook script structure:**
Each hook script is a small Node.js/Bun script that:
1. Reads JSON from stdin (Claude Code hook payload)
2. Imports WeaveCore
3. Calls the appropriate core method
4. Outputs JSON response to stdout
5. Exits with code 0 (allow) or 2 (block)

**Example: `.claude/hooks/weave/pre-tool-use.mjs`**
```javascript
// Generated by weave init — do not edit manually
import { createWeaveCore } from '@opencode_weave/weave/core'
const input = JSON.parse(await readStdin())
const core = await createWeaveCore(process.cwd())
const result = core.checkToolBefore(input.agent, input.tool_name, input.tool_input?.file_path ?? '', input.session_id)
if (!result.allowed) {
  console.log(JSON.stringify({ decision: "block", reason: result.reason }))
  process.exit(2)
}
process.exit(0)
```

**Agent mapping for Claude Code:**
- Each Weave agent becomes a SKILL.md file in `.claude/skills/weave/`
- Claude Code discovers skills from the `.claude/skills/` directory
- Subagent-mode agents (pattern, thread, spindle, weft, warp) become skills
- Primary agents (loom, tapestry) become the main instruction + skills
- The `CLAUDE.md` file at project root gets a Weave section appended

**Continuation strategy in Claude Code:**
Claude Code supports two mechanisms for automatic work continuation:
1. **Primary: Channels (MCP push)** — Claude Code's "research preview" Channels feature allows an MCP server to push messages into an active session. Weave registers an MCP channel that monitors plan state; when the `Stop` hook fires with remaining tasks, the channel pushes a continuation prompt directly into the session, achieving the same auto-continuation as OpenCode's `promptAsync()`. This requires running the Weave MCP server alongside the hook scripts.
2. **Fallback: Stop hook exit code 2 + system prompt engineering** — If Channels are unavailable (older Claude Code versions), the `Stop` hook returns exit code 2 (block stopping) with a continuation reason. Combined with system prompt instructions telling the agent "when stop is blocked, continue with the next plan task", this achieves semi-automatic continuation. Less reliable than Channels since it depends on the model following the system prompt instruction.

**Limitations in Claude Code:**
- No display name UI — skills are identified by their SKILL.md `name` frontmatter
- No slash commands — Weave commands become documented natural-language triggers
- Tool permissions cannot be enforced as strictly (shell hook can only block, not restrict per-agent)

### C. Copilot CLI Adapter

**File**: `src/adapters/copilot-cli/index.ts`

Copilot CLI has the most limited extension model: custom agents as markdown files and MCP servers.

**Agent mapping:**
- Each Weave agent becomes a markdown file in `.github/agents/`
- The markdown file IS the agent's system prompt
- Copilot routes to agents via `@agent-name` mentions

**Example: `.github/agents/loom.md`**
```markdown
---
name: Loom
description: Main Orchestrator — routes tasks to specialist agents
---

[Full Loom system prompt from src/agents/loom/default.ts]
```

**Hook implementation via MCP:**
Since Copilot CLI has no hook system, Weave exposes an MCP server that Copilot can call:

```json
// .github/copilot-mcp.json or ~/.copilot/mcp-config.json
{
  "servers": {
    "weave": {
      "type": "stdio",
      "command": "npx",
      "args": ["@opencode_weave/weave", "mcp-server"]
    }
  }
}
```

The MCP server exposes tools like:
- `weave_start_work` — equivalent of /start-work
- `weave_run_workflow` — equivalent of /run-workflow
- `weave_check_plan_progress` — read plan state
- `weave_pause_work` — pause current plan
- `weave_metrics` — show analytics

**Instructions integration:**
- `.github/copilot-instructions.md` gets a Weave section explaining available agents and MCP tools
- Agents reference each other via `@agent-name` syntax

**Continuation strategy in Copilot CLI:**
Copilot CLI supports automatic continuation via:
1. **Primary: Autopilot mode** — `copilot --autopilot --yolo --max-autopilot-continues N` enables fully autonomous multi-step execution. Weave's agent prompts include plan-checking instructions so the agent naturally reads `.weave/state.json` and continues with the next task after each step. The `--max-autopilot-continues` flag provides a safety limit (maps to Weave's stale detection). Minimal integration code needed — `agent-mapper` injects plan-checking instructions and the MCP `weave_check_progress` tool provides the `shouldContinue` safety signal.
2. **Alternative: ACP server** — Copilot's Agent Client Protocol (ACP) server mode allows programmatic session management. Weave can run an ACP server that injects continuation prompts, similar to OpenCode's `promptAsync()`. More complex to implement but offers fine-grained control over the continuation flow.

**Limitations in Copilot CLI:**
- No lifecycle hooks — cannot intercept tool calls, no write guards
- No session tracking — analytics limited to what MCP server can observe
- Fleet orchestration unavailable (no subagent spawning API)
- Continuation safety coarser-grained — `--max-autopilot-continues` is the primary guard; stale detection and user-pause require agent prompt compliance with `weave_check_progress shouldContinue` flag

---

## Agent Mapping Table

| Weave Agent | OpenCode | Claude Code | Copilot CLI |
|---|---|---|---|
| **Loom** (Main Orchestrator) | Primary agent via `config` hook. Display name: "Loom (Main Orchestrator)" | CLAUDE.md section + `.claude/skills/weave/loom.md`. Default routing. | `.github/agents/loom.md`. Invoked via `@loom`. |
| **Tapestry** (Execution) | Primary agent via `config` hook. Display name: "Tapestry (Execution Orchestrator)" | `.claude/skills/weave/tapestry.md`. Activated by Loom delegation. | `.github/agents/tapestry.md`. Invoked via `@tapestry`. |
| **Pattern** (Planning) | Subagent. Restricted to .md writes in .weave/. | `.claude/skills/weave/pattern.md` + `PreToolUse` hook enforces .md-only guard. | `.github/agents/pattern.md`. Write restriction noted in prompt only (not enforced). |
| **Thread** (Codebase Explorer) | Subagent. Read-only tools. | `.claude/skills/weave/thread.md`. Read-only enforced via prompt. | `.github/agents/thread.md`. Read-only via prompt. |
| **Spindle** (External Research) | Subagent. Read-only tools. | `.claude/skills/weave/spindle.md`. Read-only enforced via prompt. | `.github/agents/spindle.md`. Read-only via prompt. |
| **Weft** (Code Review) | Subagent. Review-focused. | `.claude/skills/weave/weft.md`. Post-implementation review. | `.github/agents/weft.md`. Invoked via `@weft`. |
| **Warp** (Security Review) | Subagent. Security-focused. | `.claude/skills/weave/warp.md`. Security audit. | `.github/agents/warp.md`. Invoked via `@warp`. |
| **Shuttle** (Domain Specialist) | Worker agent. Category system. | `.claude/skills/weave/shuttle.md`. Domain dispatch. | `.github/agents/shuttle.md`. Invoked via `@shuttle`. |

---

## Hook Mapping Table

| Weave Hook | OpenCode Hook | Claude Code Hook | Copilot CLI Equivalent |
|---|---|---|---|
| **message.before** | `chat.message` | `UserPromptSubmit` (shell) | ❌ None |
| **tool.before** | `tool.execute.before` | `PreToolUse` (shell) | ❌ None |
| **tool.after** | `tool.execute.after` | `PostToolUse` (shell) | ❌ None |
| **session.idle** | `event` (session.idle) | `Stop` (shell) → MCP Channel push or exit 2 | Autopilot mode auto-continues; ACP for programmatic control |
| **session.created** | `event` (session.created) | `SessionStart` (shell) | ❌ None |
| **session.deleted** | `event` (session.deleted) | ❌ None (no explicit end) | ❌ None |
| **config.init** | `config` | `.claude/settings.json` (static) | `.github/agents/*.md` (static) |
| **params.resolve** | `chat.params` | ❌ None | ❌ None |
| **command.execute** | `command.execute.before` | Natural language trigger | MCP tool call |
| **context-window-monitor** | `event` (message.updated tokens) | ❌ None (no token access) | ❌ None |
| **write-guard** | `tool.execute.before` (read tracking) | `PreToolUse` (approximate) | ❌ Not enforceable |
| **pattern-md-only** | `tool.execute.before` (agent check) | `PreToolUse` (agent detection) | Prompt instruction only |
| **rules-injector** | `tool.execute.before` (file path) | CLAUDE.md (project rules) | `.github/copilot-instructions.md` |
| **work-continuation** | `event` (session.idle) + `client.session.promptAsync` | Primary: MCP Channel push; Fallback: `Stop` hook exit 2 + system prompt | Autopilot mode (`--autopilot --yolo`); Alternative: ACP server |
| **workflow-continuation** | `event` (session.idle) + `client.session.promptAsync` | Primary: MCP Channel push; Fallback: `Stop` hook exit 2 + system prompt | Autopilot mode (`--autopilot --yolo`); Alternative: ACP server |
| **start-work** | `chat.message` (command detection) | Natural language + `.claude/hooks/weave/` | MCP `weave_start_work` tool |
| **analytics** | `event` (message.updated) | `PostToolUse` (partial) | MCP server logging |
| **todo-finalize** | `event` (session.idle) + `client.session.todo` | ❌ No todo API | ❌ No todo API |
| **tui.command.execute** | `event` (tui.command.execute) — handles session.interrupt (pause work/workflow) and session.compact | ❌ None (no TUI commands) | ❌ None |
| **message.part.updated** | `event` (message.part.updated) — tracks assistant text for workflow continuation detection | `PostToolUse` / `Stop` (partial — text available in hook payload) | ❌ None |
| **first-message-variant** | `event` (session.created/deleted) + `chat.message` — selects prompt variant for first message | `SessionStart` (approximate) | ❌ None |
| **keyword-detector** | `chat.message` — fires on every user message to detect keywords | `UserPromptSubmit` (shell) | ❌ None |
| **verification-reminder** | `chat.message` — reminds agent to verify work | `UserPromptSubmit` (shell, approximate) | Prompt instruction only |
| **workflow-command** | `chat.message` — detects natural language workflow commands during active workflows | `UserPromptSubmit` (shell) | MCP tool (manual trigger) |

---

## Shared vs. CLI-Specific Boundary

### Shared Core (`src/core/`)
| Module | Current Location | Notes |
|---|---|---|
| Agent definitions | `src/agents/*/default.ts` | Prompts, metadata, permissions |
| Agent builder | `src/agents/agent-builder.ts` | Skill resolution, prompt composition |
| Agent metadata | `src/agents/builtin-agents.ts` | AGENT_METADATA, AGENT_FACTORIES |
| Custom agents | `src/agents/custom-agent-factory.ts` | Custom agent building |
| Hook logic | `src/hooks/*.ts` | All pure hook functions |
| Work state | `src/features/work-state/` | Plan tracking (file-based) |
| Workflow engine | `src/features/workflow/` | Workflow management (file-based) |
| Analytics | `src/features/analytics/` | Session tracking, reports |
| Skills | `src/features/skill-loader/` | Skill discovery and resolution |
| Config schema | `src/config/schema.ts` | Zod schema for weave.json |
| Config loader | `src/config/loader.ts` | Needs parameterized paths |
| Config merge | `src/config/merge.ts` | Deep merge logic |
| Tool permissions | `src/tools/permissions.ts` | Permission maps |
| Commands | `src/features/builtin-commands/` | Command definitions |
| Shared utils | `src/shared/` | Logging, version, types |

### CLI-Specific (`src/adapters/{cli}/`)
| Module | OpenCode | Claude Code | Copilot CLI |
|---|---|---|---|
| Plugin entry | `src/adapters/opencode/index.ts` (current `src/index.ts`) | `src/adapters/claude-code/index.ts` | `src/adapters/copilot-cli/index.ts` |
| Hook wiring | In-process callbacks | Shell script generation | MCP server |
| Agent registration | Config mutation | SKILL.md generation | Markdown file generation |
| Config generation | `opencode.json` plugin entry | `.claude/settings.json` hooks | `.github/agents/*.md` |
| Session management | `@opencode-ai/sdk` client | Shell I/O | MCP protocol |
| Display names | Formatted with role suffixes | Skill frontmatter names | Markdown frontmatter |
| Command delivery | Slash commands via config | Natural language documentation | MCP tools |
| Continuation | `client.session.promptAsync` | MCP Channel push (primary) / Stop hook exit 2 (fallback) | Autopilot mode (primary) / ACP server (alternative) |

---

## Configuration Generation (`weave init`)

### New CLI Entry Point

```
npx @opencode_weave/weave init [--cli opencode|claude-code|copilot-cli|all]
```

When `--cli` is omitted, `CLIDetector` is used. When `--cli all`, generates configs for all three.

### Per-CLI Generated Files

**OpenCode:**
```
opencode.json → adds plugin entry: { "name": "@opencode_weave/weave" }
.opencode/weave-opencode.json → symlink to weave.json (or copy)
```

**Claude Code:**
```
.claude/settings.json → merge hook entries
.claude/skills/weave/loom.md → Loom skill
.claude/skills/weave/tapestry.md → Tapestry skill
.claude/skills/weave/pattern.md → Pattern skill (with constraints)
.claude/skills/weave/thread.md → Thread skill
.claude/skills/weave/spindle.md → Spindle skill
.claude/skills/weave/weft.md → Weft skill
.claude/skills/weave/warp.md → Warp skill
.claude/skills/weave/shuttle.md → Shuttle skill
.claude/hooks/weave/pre-tool-use.mjs → Write guard + Pattern guard
.claude/hooks/weave/post-tool-use.mjs → Analytics tracking
.claude/hooks/weave/user-prompt-submit.mjs → Start-work detection
.claude/hooks/weave/on-stop.mjs → Work continuation
.claude/hooks/weave/on-session-start.mjs → Session init
CLAUDE.md → append Weave instructions section (or create if missing)
```

**Copilot CLI:**
```
.github/agents/loom.md → Loom agent
.github/agents/tapestry.md → Tapestry agent
.github/agents/pattern.md → Pattern agent
.github/agents/thread.md → Thread agent
.github/agents/spindle.md → Spindle agent
.github/agents/weft.md → Weft agent
.github/agents/warp.md → Warp agent
.github/agents/shuttle.md → Shuttle agent
.github/copilot-instructions.md → append Weave instructions
.github/copilot-mcp.json → Weave MCP server config (or merge into existing)
```

### Config Path Parameterization

The config loader (`src/config/loader.ts`) currently hardcodes `.opencode/` paths. This must be parameterized:

```typescript
// src/core/paths.ts
export interface WeavePaths {
  /** User-level config dir (~/.config/{cli}/weave-{cli}.json) */
  userConfigBase: string
  /** Project-level config dir ({dir}/.{cli}/weave-{cli}.json) */
  projectConfigBase: string
  /** User-level skills dir */
  userSkillsDir: string
  /** Project-level skills dir */
  projectSkillsDir: string
  /** User-level workflows dir */
  userWorkflowsDir: string
  /** Project-level workflows dir */
  projectWorkflowsDir: string
  /** Weave state dir (always .weave/ — shared across CLIs) */
  weaveStateDir: string
}

export function getPathsForCLI(cli: "opencode" | "claude-code" | "copilot-cli"): WeavePaths
```

**Critical**: `.weave/` is ALWAYS shared. WorkState, analytics, and plan files are CLI-agnostic. Only the CLI integration surface (hooks, agent registration) differs.

---

## Fleet / Orchestration Mapping

| Feature | OpenCode | Claude Code | Copilot CLI |
|---|---|---|---|
| **Parallel agents** | Fleet API (`client.session.promptAsync` to new sessions) | Agent teams (worktree-based parallel execution) | ❌ Not available |
| **Background tasks** | BackgroundManager + session spawning | Claude Code `--background` flag or worktree cloning | ❌ Not available |
| **Subagent delegation** | `task()` tool | Claude Code task tool (native) | `@agent-name` mention in prompt |
| **Continuation loop** | `session.idle` event + `promptAsync` | MCP Channel push (primary); Stop hook exit 2 + system prompt (fallback) | Autopilot mode `--max-autopilot-continues N` (primary); ACP server (alternative) |

For Copilot CLI, the MCP server could expose a `weave_fleet_spawn` tool that uses subprocess-based execution (running Claude Code or OpenCode headlessly), but this is a future enhancement.

---

## Limitations & Trade-offs

### Feature Support Matrix

| Feature | OpenCode | Claude Code | Copilot CLI |
|---|---|---|---|
| 8 agents | ✅ Full | ✅ Full (as skills) | ✅ Full (as markdown agents) |
| Tool guards (write, pattern) | ✅ In-process enforcement | ⚠️ Shell hook (exit code 2 blocks) | ❌ Prompt-based only |
| Work continuation | ✅ Automatic (idle loop) | ✅ Automatic (MCP Channel push) / ⚠️ Semi-auto fallback (Stop hook exit 2) | ✅ Automatic (autopilot mode) / ⚠️ Semi-auto (ACP server) |
| Workflow engine | ✅ Full | ✅ Full (via MCP Channel continuation) / ⚠️ Partial fallback | ✅ Full (via autopilot mode) / ⚠️ Partial (ACP) |
| Analytics | ✅ Full (tokens, cost, timing) | ⚠️ Partial (no token counts from hooks) | ⚠️ Minimal (MCP call counts) |
| Context window monitor | ✅ Full | ❌ No token data in hooks | ❌ No token data |
| Todo sidebar | ✅ Native | ❌ No API | ❌ No API |
| Slash commands | ✅ Native | ❌ Natural language | ⚠️ MCP tools |
| Custom agents | ✅ Full | ✅ Full (as additional skills) | ✅ Full (as additional .md files) |
| Fleet orchestration | ✅ Full | ⚠️ Limited (worktrees) | ❌ None |
| Skill system | ✅ Full | ✅ Native skills | ⚠️ Embedded in agent prompts |
| Config hot-reload | ✅ Plugin reload | ❌ Requires restart | ❌ Requires restart |

### Key Trade-offs

1. **Shell hooks have cold-start overhead** — Each Claude Code hook invocation spawns a new Node.js process. For frequently-fired hooks (PreToolUse), this adds ~100-200ms latency. Mitigation: Use a persistent background process with IPC, or cache WeaveCore initialization.

2. **Copilot CLI agents can't enforce constraints** — Without lifecycle hooks, Pattern's .md-only restriction and write guards are prompt-based only. The agent's prompt says "don't do X" but there's no enforcement. Acceptable trade-off since Copilot CLI is the most basic integration tier.

3. **Analytics coverage varies** — OpenCode provides rich token/cost data via events. Claude Code provides tool-level data via shell hooks but no token counts. Copilot CLI only sees MCP tool invocations. Analytics will have different fidelity per CLI.

4. **Dual-CLI projects** — When multiple team members use different CLIs, all generated configs coexist but `.weave/` state is shared. This means work-continuation from OpenCode will try to continue plans started in Claude Code. This is actually desirable — the plan state is CLI-agnostic.

5. **Continuation reliability varies by mechanism** — OpenCode's `promptAsync()` is 100% reliable (programmatic injection). Claude Code's MCP Channel push is expected to be equally reliable but is in "research preview" status — the fallback (Stop hook exit 2 + system prompt) is less reliable since it depends on model compliance. Copilot's autopilot mode is reliable for continuation but the `--max-autopilot-continues` safety limit is coarser-grained than Weave's 7-check system (stale detection, user pause, etc. are enforced via prompt instructions + MCP tool response flags rather than programmatic control).

---

## Migration Path

The migration is designed as a series of **non-breaking refactoring steps** where each step leaves the OpenCode integration working identically.

### Phase 0: Prerequisite — Decouple Type Dependencies
Before any structural changes, remove `@opencode-ai/sdk` types from core modules.

### Phase 1: Extract WeaveCore (OpenCode still works identically)
1. Create `src/core/` module with CLI-agnostic types
2. Move pure logic from `plugin-interface.ts` into core
3. `plugin-interface.ts` becomes a thin OpenCode adapter calling core methods
4. All existing tests pass unchanged

### Phase 2: Adapter Interface + Config Generator CLI
1. Define `CLIAdapter` interface
2. Wrap existing OpenCode code as `OpenCodeAdapter`
3. Build `CLIDetector`
4. Build `ConfigGenerator` scaffolding
5. Create integration test harness and shared utilities

### Phase 3: Claude Code Adapter
1. Build Claude Code adapter
2. Generate hook scripts, skill files, settings.json
3. Claude Code hook stdin/stdout integration tests (Layer 1 — no CLI needed)
4. Document feature degradation

### Phase 4: Copilot CLI Adapter
1. Build Copilot CLI adapter
2. Generate agent markdown files, MCP server
3. Build MCP server entry point
4. MCP server in-process integration tests (Layer 1 — no CLI needed)
5. Document feature degradation

### Phase 5: Polish & Documentation
1. Unified `weave init` experience
2. Multi-CLI coexistence testing
3. README and docs updates
4. Package exports for core + adapters
5. CLI smoke tests (Layer 2 — requires real CLIs + API keys)

---

## TODOs

### Phase 0: Decouple Type Dependencies

- [ ] 1. **Create CLI-agnostic agent type**
  **What**: Define `WeaveAgentDefinition` and `WeavePermissionConfig` in `src/core/types.ts` that mirror `AgentConfig` and `PermissionConfig` from `@opencode-ai/sdk` without importing them. Add a mapping function `toOpenCodeAgentConfig(agent: WeaveAgentDefinition): AgentConfig` in the OpenCode adapter. Update all 26 files that import `AgentConfig` from `@opencode-ai/sdk` to use `WeaveAgentDefinition` instead, keeping the SDK import only in the OpenCode adapter's mapper.
  **Files**:
    - Create `src/core/types.ts` — `WeaveAgentDefinition`, `WeavePermissionConfig`
    - Create `src/core/index.ts` — re-exports
    - Modify `src/agents/types.ts` — `AgentFactory` and `AgentSource` use `WeaveAgentDefinition`
    - Modify `src/agents/builtin-agents.ts` — returns `Record<string, WeaveAgentDefinition>`
    - Modify `src/agents/agent-builder.ts` — `buildAgent()` returns `WeaveAgentDefinition`
    - Modify `src/agents/custom-agent-factory.ts` — `buildCustomAgentConfig()` returns `WeaveAgentDefinition`
    - Modify `src/agents/loom/index.ts` + `src/agents/loom/default.ts`
    - Modify `src/agents/tapestry/index.ts` + `src/agents/tapestry/default.ts`
    - Modify `src/agents/pattern/index.ts` + `src/agents/pattern/default.ts`
    - Modify `src/agents/thread/index.ts` + `src/agents/thread/default.ts`
    - Modify `src/agents/spindle/index.ts` + `src/agents/spindle/default.ts`
    - Modify `src/agents/weft/index.ts` + `src/agents/weft/default.ts`
    - Modify `src/agents/warp/index.ts` + `src/agents/warp/default.ts`
    - Modify `src/agents/shuttle/index.ts` + `src/agents/shuttle/default.ts`
    - Modify `src/create-managers.ts` — `agents: Record<string, WeaveAgentDefinition>`
    - Modify `src/managers/config-handler.ts` — `agents?: Record<string, WeaveAgentDefinition>`
    - Modify `src/plugin/plugin-interface.ts` — use `WeaveAgentDefinition` internally, convert to `AgentConfig` via adapter mapper at the OpenCode boundary
    - Modify `src/agents/agent-builder.test.ts` — update type references
    - Modify `src/agents/types.test.ts` — update type references
    - Modify `src/managers/config-handler.test.ts` — update type references
    - Modify `src/agents/custom-agent-factory.test.ts` — update type references
    - Update `src/tools/permissions.ts` — update JSDoc reference
  **Acceptance**: `bun run typecheck` passes. No `@opencode-ai/sdk` imports outside `src/adapters/opencode/`. All 26 files compile against `WeaveAgentDefinition`.

- [ ] 2. **Parameterize config paths and skill loading**
  **What**: Replace hardcoded `.opencode/` paths in config loader and skill loader with a `WeavePaths` configuration. Default to OpenCode paths for backward compatibility. **Critically**, make `serverUrl` optional in `LoadSkillsOptions` — the current `loadSkills()` requires `serverUrl` (from OpenCode's `PluginInput`) and calls `fetchSkillsFromOpenCode(serverUrl, directory)` as the primary skill source. For non-OpenCode CLIs there is no server URL, so skill loading must fall back to filesystem-only mode. When `serverUrl` is undefined, skip the API call entirely and use only `scanFilesystemSkills()`. The filesystem paths themselves must also be parameterized (currently hardcoded to `~/.config/opencode/skills/` and `{dir}/.opencode/skills/`).
  **Files**:
    - Create `src/core/paths.ts`
    - Modify `src/config/loader.ts` — accept `WeavePaths` parameter, default to OpenCode
    - Modify `src/features/skill-loader/loader.ts` — make `serverUrl` optional in `LoadSkillsOptions`, skip `fetchSkillsFromOpenCode()` when absent, parameterize filesystem skill directories via `WeavePaths`
    - Modify `src/features/skill-loader/discovery.ts` — accept paths parameter
    - Modify `src/features/workflow/constants.ts` — parameterize workflow dirs
  **Acceptance**: All existing tests pass. Config loading works with explicit paths for any CLI. `loadSkills({ directory })` (no `serverUrl`) returns only filesystem skills without error.

- [ ] 3. **Parameterize rules file detection**
  **What**: `src/hooks/rules-injector.ts` hardcodes `RULES_FILENAMES = ["AGENTS.md", ".rules", "CLAUDE.md"]`. Make this configurable per-CLI so each adapter specifies which instruction files to discover.
  **Files**:
    - Modify `src/hooks/rules-injector.ts` — accept filenames parameter
    - Modify `src/hooks/create-hooks.ts` — pass filenames through
  **Acceptance**: Rules injector can be told to look for `CLAUDE.md` or `AGENTS.md` or `.github/copilot-instructions.md`.

### Phase 1: Extract WeaveCore

- [ ] 4. **Extract core initialization**
  **What**: Create `createWeaveCore()` function that performs all CLI-agnostic initialization (config loading, agent building, hook creation, skill loading, analytics setup) and returns a `WeaveCoreInstance`. The current `src/index.ts` becomes a thin wrapper: `WeavePlugin = async (ctx) => { const core = createWeaveCore(...); return OpenCodeAdapter.init(core); }`.
  **Files**:
    - Create `src/core/create-core.ts`
    - Modify `src/index.ts` — delegate to core + OpenCode adapter
    - Modify `src/create-managers.ts` — remove `PluginInput` dependency, accept generic context
    - Modify `src/create-tools.ts` — remove `PluginInput` dependency
  **Acceptance**: `bun test` passes. OpenCode behavior identical. No regression.

- [ ] 5. **Extract todo finalization from plugin-interface.ts**
  **What**: The todo finalization logic (lines 501-539 of `plugin-interface.ts`) is inline and depends on `client.session.todo()` and `client.session.promptAsync()`. Extract the decision logic (should we finalize?) into core, keep the OpenCode-specific `client` calls in the adapter.
  **Files**:
    - Create `src/core/todo-finalization.ts`
    - Modify `src/plugin/plugin-interface.ts` — call core for decision, adapter for execution
  **Acceptance**: Todo finalization works identically in OpenCode.

- [ ] 6. **Extract session idle orchestration**
  **What**: The `session.idle` handler in `plugin-interface.ts` (lines 440-539) orchestrates workflow continuation → work continuation → todo finalization. Extract this priority chain into core as `handleSessionIdle()` that returns an action discriminated union (`{ type: "workflow-continue" | "work-continue" | "todo-finalize" | "none", ... }`).
  **Files**:
    - Create `src/core/idle-orchestrator.ts`
    - Modify `src/plugin/plugin-interface.ts` — call orchestrator, execute action
  **Acceptance**: Idle behavior identical in OpenCode. Core function is testable independently.

- [ ] 7. **Extract event routing from plugin-interface.ts**
  **What**: The `event` handler (lines 278-539) is a massive switch over event types. Extract the core logic for each event type into separate core functions. The adapter just routes events to the right core function and handles CLI-specific side effects (like `client.session.promptAsync`).
  **Files**:
    - Modify `src/core/create-core.ts` — add event handling methods
    - Create `src/core/event-handlers.ts`
    - Modify `src/plugin/plugin-interface.ts` — thin event routing
  **Acceptance**: All event handling works identically.

- [ ] 8. **Extract message handling from plugin-interface.ts**
  **What**: The `chat.message` handler (lines 78-253) handles start-work, workflow-start, workflow-commands, user message tracking, and auto-pause. Extract the decision logic into core. The adapter handles OpenCode-specific mutations (parts array, message.agent, `_output` mutation).
  **Files**:
    - Create `src/core/message-handler.ts`
    - Modify `src/plugin/plugin-interface.ts` — thin message routing
  **Acceptance**: Message handling works identically.

### Phase 2: Adapter Interface + OpenCode Adapter

- [ ] 9. **Define CLIAdapter interface**
  **What**: Create the `CLIAdapter` interface, `CLICapabilities`, `CLIAgentManifest`, `CLIHookManifest`, `CLICommandManifest`, and `FeatureDegradation` types as specified in the Core Interface Definitions section above.
  **Files**:
    - Create `src/adapters/types.ts`
    - Create `src/adapters/index.ts`
  **Acceptance**: Types compile. No runtime code yet.

- [ ] 10. **Implement OpenCodeAdapter**
  **What**: Wrap the refactored `plugin-interface.ts` as a class implementing `CLIAdapter`. The `init()` method returns the current `PluginInterface` object. `generateConfig()` outputs the `opencode.json` plugin entry. `mapAgent()` converts `WeaveAgentDefinition` to OpenCode's `AgentConfig`.
  **Files**:
    - Create `src/adapters/opencode/index.ts`
    - Create `src/adapters/opencode/agent-mapper.ts`
    - Create `src/adapters/opencode/hook-wiring.ts` (refactored plugin-interface.ts)
    - Modify `src/index.ts` — use OpenCodeAdapter
    - Modify `src/plugin/plugin-interface.ts` — becomes thin re-export or is absorbed
  **Acceptance**: `bun test` passes. OpenCode behavior identical.

- [ ] 11. **Implement CLIDetector**
  **What**: Implement `detectCLI()` function that checks environment variables (`OPENCODE_*`, `CLAUDE_*`, `GITHUB_COPILOT_*`), process ancestry, and config file presence to determine which CLI is active.
  **Files**:
    - Create `src/adapters/detect.ts`
    - Create `src/adapters/detect.test.ts`
  **Acceptance**: Detection returns correct CLI for known environment setups. Tests cover all detection strategies.

- [ ] 12. **Build ConfigGenerator scaffolding**
  **What**: Create the `weave init` CLI entry point that accepts `--cli` flag, runs detection, and delegates to the selected adapter's `generateConfig()` method. Initially only supports OpenCode.
  **Files**:
    - Create `src/cli/init.ts`
    - Create `src/cli/index.ts`
    - Modify `package.json` — add `bin` entry for `weave` CLI
  **Acceptance**: `npx @opencode_weave/weave init --cli opencode` generates correct config.

- [ ] 13. **Create integration test harness and shared utilities**
  **What**: Create shared test infrastructure for adapter integration testing. This includes: (a) a `runHookScript()` utility that spawns a Node.js process with JSON on stdin and captures exit code + stdout — used to test Claude Code shell hooks without Claude Code installed; (b) an `mcpTestClient()` utility that connects to a Weave MCP server in-process via `@modelcontextprotocol/sdk` Client and StdioClientTransport; (c) a `validateGeneratedConfig()` utility that parses and structurally validates generated files (JSON parse, YAML/TOML frontmatter parse, required fields check); (d) a `createTestProject()` utility that creates a temp directory with a `weave.json` config, optional `.weave/state.json`, and optional plan files — used by all adapter tests. These are the building blocks that Phase 3/4/5 tests depend on.
  **Files**:
    - Create `src/test-utils/hook-runner.ts` — `runHookScript(scriptPath, input): Promise<{ exitCode, stdout, stderr }>`
    - Create `src/test-utils/mcp-client.ts` — `createMCPTestClient(serverCommand, args): Promise<MCPTestClient>`
    - Create `src/test-utils/config-validator.ts` — `validateClaudeSettings(path)`, `validateSkillMd(path)`, `validateCopilotAgentMd(path)`
    - Create `src/test-utils/test-project.ts` — `createTestProject(opts): Promise<{ dir, cleanup }>` with optional weave.json, state.json, plan files
    - Create `src/test-utils/index.ts` — re-exports
    - Modify `package.json` — add `@modelcontextprotocol/sdk` as devDependency
  **Acceptance**: All 4 utilities work in isolation. `runHookScript()` can execute a trivial echo script. `createTestProject()` creates and cleans up temp dirs. `validateClaudeSettings()` rejects malformed JSON.

### Phase 3: Claude Code Adapter

- [ ] 14. **Implement ClaudeCodeAdapter**
  **What**: Implement `CLIAdapter` for Claude Code. `mapAgent()` generates SKILL.md content from `WeaveAgentDefinition`. `mapHook()` maps Weave hooks to Claude Code hook events. `generateConfig()` produces all Claude Code config files.
  **Files**:
    - Create `src/adapters/claude-code/index.ts`
    - Create `src/adapters/claude-code/agent-mapper.ts` (generates SKILL.md content)
    - Create `src/adapters/claude-code/hook-mapper.ts` (maps hooks to PreToolUse, PostToolUse, etc.)
    - Create `src/adapters/claude-code/config-generator.ts` (generates .claude/ files)
    - Create `src/adapters/claude-code/index.test.ts`
  **Acceptance**: `generateConfig()` produces valid `.claude/settings.json` and SKILL.md files.

- [ ] 15. **Generate Claude Code hook scripts**
  **What**: Create the hook script templates that get installed into `.claude/hooks/weave/`. Each script imports WeaveCore, processes stdin JSON, and outputs the hook result.
  **Files**:
    - Create `src/adapters/claude-code/scripts/pre-tool-use.ts` (template)
    - Create `src/adapters/claude-code/scripts/post-tool-use.ts` (template)
    - Create `src/adapters/claude-code/scripts/user-prompt-submit.ts` (template)
    - Create `src/adapters/claude-code/scripts/on-stop.ts` (template)
    - Create `src/adapters/claude-code/scripts/on-session-start.ts` (template)
    - Create `src/adapters/claude-code/script-generator.ts` (bundles scripts)
  **Acceptance**: Generated hook scripts are valid JS that can be executed by `node`. They correctly read stdin JSON and write stdout JSON per Claude Code hook protocol.

- [ ] 16. **Claude Code SKILL.md generation**
  **What**: Generate SKILL.md files for each Weave agent. Include proper frontmatter (name, description) and the full agent prompt. Handle tool restrictions in prompt text (Claude Code skills can't enforce tool restrictions, so they're stated as instructions).
  **Files**:
    - Modify `src/adapters/claude-code/agent-mapper.ts`
    - Create `src/adapters/claude-code/agent-mapper.test.ts`
  **Acceptance**: Generated SKILL.md files have valid frontmatter and complete prompts.

- [ ] 17. **Claude Code work continuation via MCP Channel push + Stop hook fallback**
  **What**: Implement two-tier continuation for Claude Code:
  
  **(a) Primary: MCP Channel push** — Register a Weave MCP Channel that monitors plan/workflow state. When the `Stop` hook fires and there are remaining tasks, the Channel pushes a rich continuation prompt (same format as OpenCode: plan name, file path, progress counts, prioritized instructions, "do not stop" directive) directly into the active Claude Code session. This achieves true automatic continuation equivalent to OpenCode's `promptAsync()`. The MCP Channel is registered via the Weave MCP server that's already configured in `.claude/settings.json` for the hook scripts.
  
  **(b) Fallback: Stop hook exit code 2 + system prompt** — For Claude Code versions that don't support Channels: the `Stop` hook checks for active plans/workflows, and if continuation is needed, returns exit code 2 (block stopping) with a JSON body containing the continuation reason. The agent's system prompt (injected via CLAUDE.md or skill prompts) includes instructions: "If your stop was blocked with a continuation reason, read the next task from `.weave/state.json` and execute it." Less reliable but functional.
  
  **(c) Safety mechanisms** — Both paths must respect all 7 continuation safety checks from `work-continuation.ts`: plan completion, stale detection (3 cycles), user message auto-pause, manual pause, session interrupt, context window limit, workflow takeover.
  
  **Files**:
    - Modify `src/adapters/claude-code/scripts/on-stop.ts` — Check plan state, return exit 2 with continuation reason (fallback path)
    - Create `src/adapters/claude-code/continuation.ts` — Shared continuation decision logic (calls core's `handleWorkContinuation`)
    - Create `src/adapters/claude-code/mcp-channel.ts` — MCP Channel registration and push logic (primary path)
    - Create `src/adapters/claude-code/continuation.test.ts` — Tests for both primary and fallback paths
  **Acceptance**: When a plan has remaining tasks: (a) MCP Channel pushes continuation prompt into session, OR (b) Stop hook returns exit code 2 with continuation reason. Both paths use the same continuation prompt format as OpenCode. All 7 safety mechanisms are enforced.

- [ ] 18. **Claude Code adapter integration tests (Layer 1)**
  **What**: Write integration tests that verify the Claude Code adapter end-to-end WITHOUT Claude Code installed. Uses the `runHookScript()` and `validateGeneratedConfig()` test utilities from task 13. Tests cover 3 areas:
  
  **(a) Hook stdin/stdout protocol tests** — For each generated hook script (`pre-tool-use.mjs`, `post-tool-use.mjs`, `user-prompt-submit.mjs`, `on-stop.mjs`, `on-session-start.mjs`):
  - Pipe valid Claude Code hook JSON to stdin, assert correct exit code (0=allow, 2=block) and valid JSON on stdout
  - `pre-tool-use`: normal tool → exit 0; Pattern agent writing `.ts` file → exit 2 with block reason; Pattern agent writing `.md` in `.weave/` → exit 0
  - `on-stop` (primary path — MCP Channels available): no active plan → exit 0; active plan with remaining tasks → exit 0 (hook allows stopping; the MCP Channel push handles continuation separately)
  - `on-stop` (fallback path — MCP Channels unavailable): no active plan → exit 0; active plan with remaining tasks → exit 2 (hook blocks stopping) with continuation reason in stdout JSON
  - `user-prompt-submit`: message containing `/start-work` → stdout JSON injects work context
  - Test malformed JSON input → graceful error (exit 1), not crash
  - **Note**: Primary vs fallback mode is determined by a `channelsAvailable` flag in the test project's config (or environment variable). Both paths must be tested.
  
  **(b) Generated config validation tests** — Run `ClaudeCodeAdapter.generateConfig()` against a test project, then validate:
  - `.claude/settings.json` is valid JSON with `hooks.PreToolUse`, `hooks.PostToolUse`, `hooks.Stop`, `hooks.SessionStart` entries
  - Each hook entry has `type: "command"` and `command` pointing to an existing script path
  - All 8 SKILL.md files exist in `.claude/skills/weave/` with valid YAML frontmatter (`name`, `description` fields)
  - SKILL.md content includes the full agent prompt (not empty, not truncated)
  - No duplicate skill names across files
  
  **(c) WeaveCore integration via hooks** — Create a test project with a `.weave/state.json` containing an active plan, then:
  - **Fallback path tests** (set `channelsAvailable: false`): Run the `on-stop` hook script and verify: (1) exit code 2 (block stopping), (2) JSON body contains continuation reason referencing the correct next task
  - **Primary path tests** (set `channelsAvailable: true`): Run the `on-stop` hook script and verify exit code 0; call the MCP Channel continuation module directly and verify the generated push message matches the continuation prompt format (plan name, progress counts, prioritized instructions)
  - Test with completed plan → exit code 0 (allow stopping), no continuation (both paths)
  - Test with paused plan → exit code 0 (allow stopping), no continuation (both paths)
  - Test stale detection: same task 3 cycles → exit code 0 (allow stopping) (both paths)
  
  **Files**:
    - Create `src/adapters/claude-code/hooks-integration.test.ts`
    - Create `src/adapters/claude-code/config-validation.test.ts`
    - Create `src/adapters/claude-code/fixtures/` — sample hook payloads (pre-tool-use-allow.json, pre-tool-use-block.json, etc.)
  **Acceptance**: All tests pass with `bun test`. No Claude Code binary or API key required. Hook scripts correctly implement the Claude Code hook protocol (stdin JSON → stdout JSON + exit code).

### Phase 4: Copilot CLI Adapter

- [ ] 19. **Implement CopilotCLIAdapter**
  **What**: Implement `CLIAdapter` for Copilot CLI. `mapAgent()` generates markdown agent file content. `generateConfig()` produces `.github/agents/*.md` files and MCP config.
  **Files**:
    - Create `src/adapters/copilot-cli/index.ts`
    - Create `src/adapters/copilot-cli/agent-mapper.ts`
    - Create `src/adapters/copilot-cli/config-generator.ts`
    - Create `src/adapters/copilot-cli/index.test.ts`
  **Acceptance**: `generateConfig()` produces valid `.github/agents/*.md` files.

- [ ] 20. **Build Weave MCP server for Copilot CLI**
  **What**: Create an MCP server that exposes Weave commands as MCP tools. This runs as a stdio server that Copilot CLI connects to. Implements: `weave_start_work`, `weave_run_workflow`, `weave_check_progress`, `weave_pause_work`, `weave_metrics`.
  **Files**:
    - Create `src/adapters/copilot-cli/mcp-server.ts`
    - Create `src/adapters/copilot-cli/mcp-tools.ts`
    - Create `src/adapters/copilot-cli/mcp-server.test.ts`
    - Modify `package.json` — add `bin` entry for `weave mcp-server`
  **Acceptance**: MCP server starts, responds to tool list requests, and executes `weave_start_work` correctly.

- [ ] 21. **Copilot CLI agent markdown generation**
  **What**: Generate markdown files for `.github/agents/` with proper frontmatter and complete agent prompts. Include instructions about available MCP tools and agent cross-references (`@agent-name` syntax).
  **Files**:
    - Modify `src/adapters/copilot-cli/agent-mapper.ts`
    - Create `src/adapters/copilot-cli/agent-mapper.test.ts`
  **Acceptance**: Generated markdown agents include proper frontmatter, full prompts, and MCP tool references.

- [ ] 22. **Copilot CLI instructions file generation**
  **What**: Generate or append to `.github/copilot-instructions.md` with a Weave section explaining the agent system, available MCP tools, and usage patterns.
  **Files**:
    - Modify `src/adapters/copilot-cli/config-generator.ts`
  **Acceptance**: Instructions file accurately describes the Weave agent system for Copilot CLI users.

- [ ] 22a. **Copilot CLI work continuation via autopilot mode + ACP fallback**
  **What**: Implement two-tier continuation for Copilot CLI:
  
  **(a) Primary: Autopilot mode integration** — Generate agent prompts that include plan-state-checking instructions. When Copilot CLI runs in autopilot mode (`--autopilot --yolo --max-autopilot-continues N`), the agent naturally reads `.weave/state.json` after each task, finds the next uncompleted task, and continues execution. The `--max-autopilot-continues` flag maps to a safety limit. Weave's `weave init` output instructs users to launch with autopilot flags for plan execution. The MCP tool `weave_check_progress` provides structured task progress data so the agent doesn't need to parse markdown.
  
  **(b) Alternative: ACP server** — For programmatic control, implement an ACP (Agent Client Protocol) server mode that allows external processes to inject continuation prompts into Copilot sessions. This follows the same pattern as OpenCode's `promptAsync()` but uses Copilot's ACP protocol. More complex but enables fine-grained continuation control (exact prompt text, safety checks, stale detection).
  
  **(c) Safety mechanisms** — Autopilot mode relies on `--max-autopilot-continues N` as the primary safety limit. The MCP `weave_check_progress` tool returns a `shouldContinue: false` flag when any of the 7 safety conditions are met (plan complete, stale, paused, etc.), and agent prompts instruct the agent to check this before each continuation.
  
  **Files**:
    - Create `src/adapters/copilot-cli/continuation.ts` — Continuation prompt generation for autopilot mode
    - Modify `src/adapters/copilot-cli/agent-mapper.ts` — Inject plan-checking instructions into agent prompts
    - Modify `src/adapters/copilot-cli/mcp-tools.ts` — Add `shouldContinue` flag to `weave_check_progress` response
    - Create `src/adapters/copilot-cli/continuation.test.ts`
  **Acceptance**: Agent prompts include plan-checking instructions. `weave_check_progress` returns `shouldContinue` flag. `weave init --cli copilot-cli` output includes autopilot launch instructions.

- [ ] 23. **Copilot CLI adapter integration tests (Layer 1)**
  **What**: Write integration tests that verify the Copilot CLI adapter end-to-end WITHOUT Copilot CLI installed. Uses the `mcpTestClient()` and `validateGeneratedConfig()` test utilities from task 13. Tests cover 3 areas:
  
  **(a) MCP server protocol tests** — Start the Weave MCP server as a child process and connect via `@modelcontextprotocol/sdk` Client with StdioClientTransport:
  - `tools/list` returns all expected tools: `weave_start_work`, `weave_run_workflow`, `weave_check_progress`, `weave_pause_work`, `weave_metrics`
  - Each tool has a valid JSON Schema for its input parameters
  - `weave_check_progress` with no active plan → returns structured "no active plan" response
  - `weave_start_work` with a valid plan file → creates `.weave/state.json` and returns success
  - `weave_start_work` with a non-existent plan → returns structured error (not crash)
  - `weave_pause_work` with active plan → sets `paused: true` in state.json
  - `weave_metrics` → returns analytics summary (even if empty)
  - Server handles malformed tool call arguments gracefully
  
  **(b) Generated config validation tests** — Run `CopilotCLIAdapter.generateConfig()` against a test project, then validate:
  - All 8 agent markdown files exist in `.github/agents/` with valid YAML frontmatter (`name`, `description` fields)
  - Agent markdown content includes the full agent prompt
  - `.github/copilot-instructions.md` exists and contains a Weave section
  - MCP config JSON (`.github/copilot-mcp.json` or `~/.copilot/mcp-config.json`) is valid JSON with a `weave` server entry
  - No duplicate agent names across files
  - Agent files reference other agents with `@agent-name` syntax where appropriate
  
  **(c) MCP-to-WeaveCore integration** — Create a test project with a `.weave/state.json` containing an active plan with 3 tasks (1 completed, 2 remaining). Connect via MCP client and:
  - Call `weave_check_progress` → verify it returns correct task counts, the next uncompleted task name, and `shouldContinue: true`
  - Test `shouldContinue` safety signals:
    - Completed plan (all tasks done) → `shouldContinue: false`
    - Paused plan (`paused: true` in state.json) → `shouldContinue: false`
    - Stale detection (same task reported as current for 3+ cycles) → `shouldContinue: false`
    - No active plan → `shouldContinue: false`
  - Call `weave_pause_work` then `weave_check_progress` → verify `shouldContinue` flips to `false`
  
  **Files**:
    - Create `src/adapters/copilot-cli/mcp-integration.test.ts`
    - Create `src/adapters/copilot-cli/config-validation.test.ts`
    - Create `src/adapters/copilot-cli/fixtures/` — sample plan files, state.json snapshots
  **Acceptance**: All tests pass with `bun test`. No Copilot CLI binary or API key required. MCP server correctly implements the MCP protocol and all tool calls return structured responses.

### Phase 5: Polish & Multi-CLI Coexistence

- [ ] 24. **Multi-CLI coexistence testing**
  **What**: Test that `weave init --cli all` generates configs for all three CLIs simultaneously without conflicts. Verify that `.weave/` state is shared correctly (start plan in OpenCode, continue in Claude Code). Test that generated configs don't overwrite each other.
  **Files**:
    - Create `src/adapters/coexistence.test.ts`
    - Modify `src/cli/init.ts` — support `--cli all`
  **Acceptance**: All three CLI configs can coexist. Plan state is shared. No config conflicts.

- [ ] 25. **Package exports for adapters**
  **What**: Update `package.json` exports to expose core and adapter modules separately so downstream consumers can import specific adapters.
  **Files**:
    - Modify `package.json` — add exports for `./core`, `./adapters/opencode`, `./adapters/claude-code`, `./adapters/copilot-cli`
    - Modify `tsconfig.json` — ensure declaration generation covers new paths
  **Acceptance**: `import { createWeaveCore } from '@opencode_weave/weave/core'` works.

- [ ] 26. **Feature degradation documentation**
  **What**: Each adapter implements `getDegradationReport()` that returns a structured list of features with their support status. The `weave init` command displays this after generating config.
  **Files**:
    - Modify each adapter's `index.ts` — implement `getDegradationReport()`
    - Modify `src/cli/init.ts` — display degradation report
  **Acceptance**: `weave init --cli copilot-cli` shows which features are unavailable and suggests workarounds.

- [ ] 27. **Config sync command**
  **What**: Add `weave sync` command that regenerates CLI-specific files from the current `weave.json`. Useful when agents or hooks change. Detects which CLI configs exist and updates them.
  **Files**:
    - Create `src/cli/sync.ts`
    - Modify `src/cli/index.ts` — add sync subcommand
  **Acceptance**: `weave sync` updates all generated files based on current weave.json.

- [ ] 28. **CLI smoke tests (Layer 2 — requires real CLIs + API keys)**
  **What**: Write end-to-end smoke tests that actually launch each CLI headlessly, send a minimal prompt, and verify Weave's integration fires correctly. These are gated behind `RUN_SMOKE_TESTS=true` environment variable — they are NOT part of the default `bun test` run because they require CLI binaries installed and valid API keys. Each test uses the cheapest possible model and `--max-turns 1` to minimize cost.
  
  **(a) OpenCode smoke test** — Run `opencode run --format json "respond with just the word OK"` in a temp project directory with `opencode.json` pointing to Weave. Assert: process exits 0, JSON output contains a response, `.weave/analytics/session-summaries.jsonl` was written (proving the plugin loaded and analytics hook fired).
  
  **(b) Claude Code smoke test** — Run `claude -p "respond with just the word OK" --output-format json --max-turns 1 --max-budget-usd 0.05` in a temp project directory with `.claude/settings.json` hooks configured. Assert: process exits 0, hook side-effects occurred (check a breadcrumb file the `on-session-start.mjs` hook writes to `.weave/smoke-test-marker`).
  
  **(c) Copilot CLI smoke test** — Run `copilot -p "@loom respond with just the word OK" --allow-all-tools` in a temp project directory with `.github/agents/` and MCP config. Assert: process exits 0, output is non-empty.
  
  **(d) Cross-CLI state sharing (Layer 3)** — Start a plan via OpenCode (`opencode run --format json "/start-work .weave/plans/smoke-test-plan.md"`), verify `.weave/state.json` exists, then run Claude Code (`claude -p "check current plan progress" --max-turns 1`) and verify it can read the same state. This proves the shared `.weave/` directory works across CLIs.
  
  **Files**:
    - Create `src/adapters/smoke-tests/opencode.smoke.test.ts`
    - Create `src/adapters/smoke-tests/claude-code.smoke.test.ts`
    - Create `src/adapters/smoke-tests/copilot-cli.smoke.test.ts`
    - Create `src/adapters/smoke-tests/cross-cli.smoke.test.ts`
    - Create `src/adapters/smoke-tests/fixtures/smoke-test-plan.md` — minimal 2-task plan for testing
    - Create `src/adapters/smoke-tests/helpers.ts` — `setupSmokeProject(cli)` creates temp dir with correct config, `cleanupSmokeProject()` tears down
  **Acceptance**: When `RUN_SMOKE_TESTS=true` and the respective CLI is installed with valid API keys, all smoke tests pass. When `RUN_SMOKE_TESTS` is not set, all smoke tests are skipped (not failed). Each smoke test costs < $0.05 per run.

---

## Verification

### Layer 0: Existing Tests (regression)
- [ ] All existing 1246 tests pass (`bun test`) — zero regression
- [ ] TypeScript compiles cleanly (`bun run typecheck`)
- [ ] OpenCode integration is byte-for-byte identical behavior

### Layer 1: Adapter Integration Tests (no CLI, no API key)
- [ ] Claude Code hook scripts pass stdin/stdout protocol tests (allow/block/error exit codes, valid JSON output)
- [ ] Claude Code `pre-tool-use` hook blocks Pattern agent from writing non-.md files (exit 2)
- [ ] Claude Code `on-stop` hook returns continuation prompt when plan has remaining tasks
- [ ] Claude Code `user-prompt-submit` hook injects work context for `/start-work` messages
- [ ] Claude Code hook scripts handle malformed JSON input gracefully (exit 1, not crash)
- [ ] Claude Code generated `.claude/settings.json` is valid JSON with all required hook entries
- [ ] Claude Code generated SKILL.md files have valid YAML frontmatter and non-empty prompts (all 8 agents)
- [ ] Copilot MCP server `tools/list` returns all 5 expected tools with valid JSON Schemas
- [ ] Copilot MCP server `weave_start_work` creates state.json from a plan file
- [ ] Copilot MCP server `weave_check_progress` returns correct task counts from state.json
- [ ] Copilot MCP server `weave_pause_work` sets paused flag in state.json
- [ ] Copilot MCP server handles malformed tool call arguments without crashing
- [ ] Copilot generated `.github/agents/*.md` files have valid frontmatter and non-empty prompts (all 8 agents)
- [ ] Copilot generated MCP config JSON has valid `weave` server entry
- [ ] All adapter `generateConfig()` outputs can be round-tripped (generate → validate → no errors)
- [ ] `weave init --cli all` generates all three CLI configs without conflicts in same directory

### Layer 2: CLI Smoke Tests (requires real CLIs + API keys)
- [ ] `RUN_SMOKE_TESTS=true` — OpenCode loads Weave plugin and writes analytics
- [ ] `RUN_SMOKE_TESTS=true` — Claude Code fires hooks and writes breadcrumb marker
- [ ] `RUN_SMOKE_TESTS=true` — Copilot CLI discovers agents and connects to MCP server
- [ ] `RUN_SMOKE_TESTS=true` — Cross-CLI state: plan started in OpenCode is readable from Claude Code

### General
- [ ] `.weave/` state directory is shared across all CLIs
- [ ] Config loader accepts parameterized paths for all CLIs
- [ ] No `@opencode-ai/plugin` or `@opencode-ai/sdk` imports in `src/core/`
- [ ] Each adapter's `getDegradationReport()` is accurate
