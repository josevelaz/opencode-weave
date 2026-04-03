# Logging Upgrade Plan

## Summary

Replace Weave's flat, level-less file logger (`src/shared/log.ts`) with a thin wrapper
around OpenCode's `client.app.log()` API. The wrapper adds log levels, level gating,
and a `setClient()` lifecycle hook. There is **no separate log file** — OpenCode owns
all log storage, rotation, and formatting. During the narrow init window before the
client is available, ERROR and WARN entries fall back to `console.error`; DEBUG and
INFO are silently dropped. All ~18 existing `log()` call sites keep working unchanged —
the current `log(message, data?)` signature becomes an alias for `info(message, data)`.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  src/shared/log.ts                │
│                                                   │
│  LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"   │
│                                                   │
│  Exported functions:                              │
│    debug(msg, data?) / info / warn / error        │
│    log(msg, data?)       → alias for info()       │
│    logDelegation(event)  → unchanged semantics    │
│    setLogLevel(level)    → runtime threshold      │
│    setClient(client)     → activates OpenCode sink│
│                                                   │
│  Level gate: WEAVE_LOG_LEVEL env / config,        │
│              default INFO                         │
│                                                   │
│  Single sink:                                     │
│    ┌──────────────────────────────────────────┐   │
│    │  client.app.log()  (OpenCode /log POST)  │   │
│    │  service: "weave", level, message, extra │   │
│    └──────────────────────────────────────────┘   │
│                                                   │
│  Pre-client fallback (init window only):          │
│    ERROR/WARN → console.error(formatted)          │
│    DEBUG/INFO → silently dropped                  │
└──────────────────────────────────────────────────┘
```

### Key design decisions

1. **Single module, backward-compatible exports.** The existing `log()` and
   `logDelegation()` named exports remain. No import changes needed at any of the
   18+ call sites.
2. **Single sink — OpenCode's logging infrastructure.** No separate Weave log file.
   OpenCode handles rotation, structured format, `--log-level` flag support. Weave
   delegates entirely via `client.app.log()`.
3. **Pre-client fallback is minimal.** Before `setClient()` is called (the ~3-5 log
   calls during module init), only ERROR and WARN are surfaced via `console.error()`.
   DEBUG and INFO are silently dropped. This avoids file I/O entirely while keeping
   critical init errors visible in stderr.
4. **Fire-and-forget.** `client.app.log()` returns a promise; we `.catch(() => {})`
   it silently. A failing HTTP call must never crash the plugin or block the hot path.
5. **No file I/O, no rotation.** All `fs`, `path`, `os` imports are removed from
   `log.ts`. The `getLogDir()`, `resolveLogFile()`, `LOG_FILE` constants, and
   `getLogFilePath()` export are deleted. OpenCode handles its own log rotation.
6. **Level gating happens before the sink.** A log entry below the active threshold
   is discarded before it reaches the client or the console fallback.

---

## Slices

### Slice 1 — Log levels, OpenCode sink, and client wiring

Delivers: leveled logging via `client.app.log()`, `WEAVE_LOG_LEVEL` env var support,
`console.error` fallback for ERROR/WARN during init, zero behavioral change for
existing `log()` callers (they emit at INFO).

- [x] **`src/shared/log.ts`** — Rewrite internals:
  - **Remove all file-writing code:** delete `import * as fs`, `import * as path`,
    `import * as os`, `getLogDir()`, `resolveLogFile()`, `const LOG_FILE`, the
    `fs.appendFileSync` call, and the `getLogFilePath()` export. The module should
    have zero `fs`/`path`/`os` imports after this change.
  - Define `LogLevel` type: `"DEBUG" | "INFO" | "WARN" | "ERROR"`. This is the
    canonical definition — all other modules that need the type import it from here.
  - Define `LEVEL_PRIORITY` map: `{ DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }`.
  - Add module-level `let activeLevel: LogLevel` initialized from
    `process.env.WEAVE_LOG_LEVEL` (validated against `LogLevel`, default `"INFO"`).
  - **Initialization timing note:** Early log calls during module initialization
    (before `setLogLevel()` is called from `src/index.ts`) will use the env-var
    level or the default (`INFO`). This is acceptable because the config-based level
    is applied as soon as the plugin context is ready in `src/index.ts`, and critical
    errors during module load are rare. The ~3-5 log calls that may fire before
    `setLogLevel()` (e.g., config parsing warnings in `loader.ts`) will behave
    correctly at the `INFO` default.
  - Add `shouldLog(level: LogLevel): boolean` — internal, returns
    `LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[activeLevel]`.
  - Add module-level `let client: { app: { log: (opts: any) => Promise<any> } } | null = null`.
  - Add exported `setClient(c: typeof client): void` — stores the client reference.
  - Add exported `setLogLevel(level: LogLevel): void` — updates `activeLevel`.
  - Add internal `emit(level: LogLevel, message: string, data?: unknown): void`:
    - If `!shouldLog(level)`, return immediately.
    - If `client` is set: call
      `client.app.log({ body: { service: "weave", level: level.toLowerCase(), message, extra: data !== undefined ? (typeof data === "object" && data !== null ? data as Record<string, unknown> : { value: data }) : undefined } })`
      with `.catch(() => {})` — fire-and-forget.
    - If `client` is NOT set (pre-init fallback): if level is `ERROR` or `WARN`,
      call `` console.error(`[weave:${level}] ${message}`, data ?? "") ``. Otherwise
      silently drop.
  - Add exported functions: `debug(msg, data?)`, `info(msg, data?)`,
    `warn(msg, data?)`, `error(msg, data?)` — each delegates to `emit`.
  - **Keep existing `log(message, data?)` export** — re-implement as alias for
    `info(message, data)`.
  - **Keep `logDelegation` unchanged** — it calls `log()` internally, which now
    routes to `info`.
  - **Keep `DelegationEvent` interface** unchanged.

- [x] **`src/shared/index.ts`** — Update exports:
  - Remove `getLogFilePath` from the export list.
  - Add `{ debug, info, warn, error, setLogLevel, setClient }` to exports from `"./log"`.
  - Add `type { LogLevel }` to type exports from `"./log"`.
  - Existing `log`, `logDelegation`, `DelegationEvent` exports unchanged.

- [x] **`src/index.ts`** — Wire client at startup:
  - Import `{ setClient }` from `"./shared/log"`.
  - Immediately after `const pluginConfig = loadWeaveConfig(...)`, call
    `setClient(ctx.client)`. This must happen before `createManagers` / `createHooks`
    so that all log calls during initialization are routed to OpenCode.

- [x] **`src/shared/log.test.ts`** — Rewrite tests (mock-based, no file I/O):
  - Remove all `fs` imports and file-reading assertions. Remove `getLogFilePath`
    import. Remove the `beforeEach` that clears the log file.
  - Add a helper to create a mock client:
    ```ts
    function mockClient() {
      const calls: any[] = []
      return {
        client: { app: { log: (opts: any) => { calls.push(opts); return Promise.resolve(true) } } },
        calls,
      }
    }
    ```
  - Add `afterEach` that calls `setClient(null)` and `setLogLevel("INFO")` to
    reset state between tests.
  - **Backward compat tests:**
    - `log("msg")` with mock client -> mock receives `{ body: { service: "weave", level: "info", message: "msg" } }`.
    - `log("msg", { key: "val" })` -> mock receives extra `{ key: "val" }`.
  - **Level gating tests:**
    - `setLogLevel("WARN")`, then `info("x")` -> mock not called.
    - `setLogLevel("WARN")`, then `warn("x")` -> mock called.
    - `setLogLevel("DEBUG")`, then `debug("x")` -> mock called.
    - `error("x")` with any level -> mock always called (ERROR is highest priority).
  - **setLogLevel tests:**
    - `setLogLevel("ERROR")` then `warn("x")` -> mock not called.
    - `setLogLevel("DEBUG")` then `debug("x")` -> mock called.
    - Invalid env var falls back to `INFO` (test by checking debug is suppressed
      at default level).
  - **Pre-client fallback tests:**
    - Without calling `setClient`, `error("x")` -> spy on `console.error`, assert it
      was called with message containing `[weave:ERROR]`.
    - Without calling `setClient`, `info("x")` -> spy on `console.error`, assert it
      was NOT called (silently dropped).
    - Without calling `setClient`, `warn("x")` -> spy on `console.error`, assert it
      was called with message containing `[weave:WARN]`.
  - **Bridge error swallowing tests:**
    - Mock client where `app.log` returns `Promise.reject(new Error("network"))` ->
      `info("x")` does not throw.
  - **logDelegation tests** (keep existing semantics, adapt to mock):
    - `logDelegation({ phase: "start", agent: "thread" })` -> mock receives message
      containing `[delegation:start]` and `agent=thread`.
    - `logDelegation({ phase: "complete", agent: "pattern", sessionId: "s123" })` ->
      mock receives extra containing `sessionId`.

- [x] **`src/plugin/plugin-interface.test.ts`** — Remove file-based log assertions:
  - Remove `import { getLogFilePath } from "../shared/log"` (line 13).
  - Remove the `beforeEach` block that clears the log file via
    `fs.writeFileSync(logFile, "")` (lines 62-68).
  - Update the "delegation logging via tool hooks" `describe` block (lines 990-1070):
    - Remove `const logFile = getLogFilePath()` (line 991).
    - Replace `fs.readFileSync(logFile, "utf8")` assertions with mock-based
      assertions: inject a mock client into `createPluginInterface`, capture
      `client.app.log()` calls, and assert on the call arguments. Alternatively,
      spy on the `log`/`logDelegation` functions from `../shared/log` and assert
      they were called with the expected arguments.
    - The test for "does not log delegation for non-task tools" should assert the
      mock/spy was NOT called for delegation.

**Acceptance criteria:**
- `bun test src/shared/log.test.ts` passes — all tests use mocks, zero file I/O.
- `bun test src/plugin/plugin-interface.test.ts` passes — no `getLogFilePath`
  references.
- `log("x")` routes to `client.app.log()` with level `"info"` when client is set.
- Before `setClient()`, `error("x")` outputs to `console.error`; `info("x")` is
  silently dropped.
- `WEAVE_LOG_LEVEL=DEBUG` enables debug-level entries.
- No `fs`, `path`, or `os` imports remain in `src/shared/log.ts`.
- No `weave-opencode.log` file is created at runtime.

---

### Slice 2 — Config-driven log level

Delivers: Users can set log level in `weave.json` / `weave.jsonc` config, not just env
var. Config takes precedence over env var.

- [x] **`src/config/schema.ts`** — Add `log_level` to `WeaveConfigSchema`:
  - Add field: `log_level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional()`.
  - This goes at the top-level of `WeaveConfigSchema` alongside `agents`, `analytics`, etc.
  - The enum is defined inline via `z.enum()` — do NOT import `LogLevel` from
    `shared/log.ts`. The canonical `LogLevel` type lives in `shared/log.ts` (where
    the log levels are used). The schema derives its own structurally identical type
    via `z.infer<>`. This avoids coupling the config schema to the logger module.

- [x] **`src/config/loader.ts`** — No changes needed (schema change is sufficient;
  `loadWeaveConfig` already parses against the schema).

- [x] **`src/index.ts`** — Apply config log level after loading config:
  - After `loadWeaveConfig(...)`, if `pluginConfig.log_level` is set, call
    `setLogLevel(pluginConfig.log_level)`. The `setLogLevel` import from `shared/log`
    accepts `LogLevel` — the config value is structurally compatible (same string
    union) so no cast is needed.
  - This overrides the env-var default that was applied at module-load time.

- [x] **`src/config/schema.test.ts`** — Add config integration tests for `log_level`:
  - Test that `WeaveConfigSchema.safeParse({ log_level: "DEBUG" })` succeeds.
  - Test that `WeaveConfigSchema.safeParse({ log_level: "INFO" })` succeeds.
  - Test that `WeaveConfigSchema.safeParse({ log_level: "TRACE" })` fails validation.
  - Test that `WeaveConfigSchema.safeParse({})` succeeds with `log_level` being `undefined`.

**Acceptance criteria:**
- Setting `"log_level": "DEBUG"` in `.opencode/weave-opencode.json` enables debug
  logging without needing the env var.
- Env var still works as a fallback when config doesn't specify a level.

---

### Slice 3 — Replace stray console.warn / console.log usage

Delivers: All runtime logging goes through the structured logger. No stray console
output that bypasses levels and sinks.

- [x] **`src/agents/model-resolution.ts:127`** — Replace `console.warn(...)` with
  `warn(...)`:
  - Import `{ warn }` from `"../shared/log"`.
  - Change line 127-129 from:
    ```ts
    console.warn(`[weave] No model resolved for agent "${agentName}" — falling back to ...`)
    ```
    to:
    ```ts
    warn(`No model resolved for agent "${agentName}" — falling back to default github-copilot/claude-opus-4.6`, { agentName })
    ```

- [x] **Codebase sweep** — Grep for any remaining `console.log`, `console.warn`,
  `console.error`, `console.debug` in `src/` (excluding test files). As of research,
  `model-resolution.ts:127` is the only hit. If others are found during implementation,
  replace them with the appropriate log level function.

- [x] **`src/agents/model-resolution.test.ts`** (if exists) — Update any tests that
  assert on `console.warn` output to assert the `warn()` function was called instead
  (via spy or mock).

**Acceptance criteria:**
- `grep -r 'console\.\(log\|warn\|error\|debug\)' src/ --include='*.ts' | grep -v '.test.ts' | grep -v 'node_modules'`
  returns zero results.
- The model fallback warning routes through `client.app.log()` at WARN level.

---

### Slice 4 — Upgrade high-value call sites to use specific levels

Delivers: Existing `log(...)` calls across the codebase are upgraded to use the most
appropriate level, improving signal-to-noise ratio when filtering by level.

This slice is optional / best-effort and can be done incrementally. Each file change
is independent.

- [x] **`src/plugin/plugin-interface.ts`** — Upgrade log calls to specific levels:
  - `log("[config] Merging Weave agents...")` -> `debug(...)` (verbose, only useful for debugging)
  - `log("[config] Weave agents overriding...")` -> `info(...)` (useful operational info)
  - `log("[work-continuation] Auto-paused...")` -> `info(...)`
  - `log("[work-continuation] Injected...")` -> `debug(...)`
  - `log("[work-continuation] Failed...")` -> `error(...)`
  - `log("[workflow] Injected...")` -> `debug(...)`
  - `log("[workflow] Failed...")` -> `error(...)`
  - `log("[workflow] User interrupt...")` -> `info(...)`
  - `log("[analytics] Failed...")` -> `warn(...)` (non-fatal)
  - `log("[context-window] Captured...")` -> `debug(...)`
  - `log("[context-window] Threshold crossed")` -> `warn(...)`
  - Update import from `{ log, logDelegation }` to `{ log, logDelegation, debug, info, warn, error }`.

- [x] **`src/config/loader.ts`** — Upgrade log calls:
  - `log("JSONC parse warnings...")` -> `warn(...)`
  - `log("Failed to read config...")` -> `error(...)`
  - `log("WeaveConfig validation errors...")` -> `error(...)`

- [x] **`src/create-managers.ts`** — Upgrade log calls:
  - `log('Skipping display_name override...')` -> `debug(...)`

- [x] **`src/hooks/*.ts`** — Upgrade log calls in hook files:
  - Review each of: `context-window-monitor.ts`, `compaction-todo-preserver.ts`,
    `todo-continuation-enforcer.ts`, `write-existing-file-guard.ts`,
    `rules-injector.ts`, `keyword-detector.ts`.
  - Error conditions -> `error()` or `warn()`.
  - Diagnostic/trace messages -> `debug()`.
  - State transitions -> `info()`.

- [x] **`src/features/**/*.ts`** — Upgrade log calls in feature files:
  - `workflow/hook.ts`, `workflow/discovery.ts`, `skill-loader/loader.ts`,
    `skill-loader/opencode-client.ts`, `skill-loader/discovery.ts`,
    `analytics/session-tracker.ts`, `analytics/generate-metrics-report.ts`,
    `analytics/fingerprint.ts`.
  - Apply same level-assignment heuristic as above.

**Acceptance criteria:**
- At `INFO` level (default), OpenCode's log output shows operational state changes
  and warnings only — no verbose debug output from Weave.
- At `DEBUG` level, full trace of config merging, continuation injection, etc.
- All existing tests pass.

---

### Slice 5 — Cleanup: remove dead log file references

Delivers: No stale references to the deleted log file concept remain in the codebase.

- [x] **Codebase sweep** — Grep for any remaining references to `weave-opencode.log`,
  `getLogFilePath`, `LOG_FILE`, or `getLogDir` in non-test files. As of research, all
  production references are in `src/shared/log.ts` (deleted in Slice 1) and
  `src/shared/index.ts` (updated in Slice 1).

- [x] **`src/plugin/plugin-interface.test.ts`** — Verify no `fs.readFileSync(logFile)`
  patterns remain after Slice 1 updates. If any were missed, update them to use
  mock/spy-based assertions.

- [x] **Documentation / config examples** — If any `.md` files or config examples
  reference `weave-opencode.log` or `~/.opencode/logs/weave-opencode.log`, update
  them to reference OpenCode's unified log output instead.

**Acceptance criteria:**
- `grep -r 'weave-opencode\.log\|getLogFilePath\|getLogDir' src/ --include='*.ts' | grep -v '.test.ts'`
  returns zero results.
- `grep -r 'weave-opencode\.log' .weave/ docs/ README.md` returns zero results
  (or those files don't exist).

---

## Files changed (summary)

| File | Slices | Nature of change |
|------|--------|------------------|
| `src/shared/log.ts` | 1 | Rewrite: remove file I/O, add levels + client sink |
| `src/shared/log.test.ts` | 1 | Rewrite: mock-based tests, no file I/O |
| `src/shared/index.ts` | 1 | Remove `getLogFilePath`, add new exports |
| `src/index.ts` | 1, 2 | Wire `setClient()` + config log level |
| `src/plugin/plugin-interface.test.ts` | 1 | Remove file-based log assertions |
| `src/config/schema.ts` | 2 | Add `log_level` field |
| `src/config/schema.test.ts` | 2 | Tests for `log_level` schema validation |
| `src/agents/model-resolution.ts` | 3 | Replace `console.warn` |
| `src/plugin/plugin-interface.ts` | 4 | Upgrade to specific levels |
| `src/config/loader.ts` | 4 | Upgrade to specific levels |
| `src/create-managers.ts` | 4 | Upgrade to specific levels |
| `src/hooks/*.ts` (6 files) | 4 | Upgrade to specific levels |
| `src/features/**/*.ts` (8 files) | 4 | Upgrade to specific levels |

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Client is never set (standalone/test usage) | ERROR/WARN fall back to `console.error`; DEBUG/INFO silently dropped. Tests use mock client via `setClient()`. This is by design — Weave is a plugin and always runs inside OpenCode in production. |
| `client.app.log()` HTTP calls add latency | Fire-and-forget with `.catch(() => {})` — never awaited on hot path |
| Existing tests break due to removed `getLogFilePath` | Slice 1 explicitly updates `log.test.ts` (full rewrite) and `plugin-interface.test.ts` (remove file assertions). Both are enumerated in the plan. |
| Config loaded after first log calls | Env var provides the initial level; `setLogLevel()` adjusts as soon as config is parsed — acceptable for the ~3-5 early log calls during init |
| `client.app.log()` SDK shape changes | Type the `setClient` parameter loosely (structural type, not SDK import); test with mock matching current SDK shape |
| Log entries lost during pre-client init window | Only DEBUG/INFO are dropped. ERROR/WARN go to `console.error`. In practice the init window is ~3-5 calls, mostly at INFO level (config parse warnings). Critical errors during init would still be visible via stderr. |

## Out of scope

- Per-module logger instances (e.g., `createLogger("workflow")`). The service tag
  `"weave"` is sufficient; messages use bracket prefixes like `[workflow]` for context.
- External log aggregation or metrics emission.
- Log level per-module filtering.
- Buffering pre-client log entries and flushing them after `setClient()` — the init
  window is too narrow to justify the complexity.
