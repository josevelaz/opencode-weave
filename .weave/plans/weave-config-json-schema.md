# Weave Config JSON Schema Artifacts

## TL;DR
> **Summary**: Add a repository-owned JSON Schema generator for `WeaveConfigSchema`, commit a canonical schema artifact, wire generation/check scripts into the Bun workflow, and document how users reference the schema from `weave-opencode.json`/`.jsonc` files.
> **Estimated Effort**: Medium

## Context
### Original Request
Create an execution plan for adding auto-generated JSON Schema files for the Weave config. The config is defined by Zod in `src/config/schema.ts` (`WeaveConfigSchema`), loaded from JSON/JSONC by `src/infrastructure/fs/config-fs-loader.ts`, and there is no existing schema generation utility. The plan should cover schema generation, script wiring, artifact path/versioning, docs/examples updates, and output validation.

### Key Findings
- `src/config/schema.ts` is the single source of truth for the config shape and already exports `WeaveConfigSchema` plus most top-level sub-schemas.
- Config files are loaded from `.opencode/weave-opencode.json[c]` and `~/.config/opencode/weave-opencode.json[c]` via `src/infrastructure/fs/config-fs-loader.ts`; the schema generator can stay separate from runtime loading.
- The repo already uses Bun scripts in `package.json` and repository scripts under `script/` (`build.ts`, `verify.ts`, eval helpers), so a Bun-based generator fits existing patterns.
- `docs/configuration.md` is manually maintained and already drifts from the live schema in a few places, so the plan should treat the generated artifact as the canonical machine-readable reference and tighten docs around it.
- The config schema includes custom `refine()` logic for safe relative paths (`workflows.directories`, `skill_directories`), which JSON Schema generation may not capture perfectly without explicit post-processing or schema annotations.
- There is no checked-in schema artifact path today. A stable, committed file path is needed so editors and docs can reference it reliably.

## Objectives
### Core Objective
Generate and maintain a committed JSON Schema artifact for `WeaveConfigSchema` that stays aligned with the Zod source, is easy to regenerate locally, and is validated in CI.

### Deliverables
- [ ] A reusable JSON Schema generation helper derived from `WeaveConfigSchema`
- [ ] A committed schema artifact at a stable repository path
- [ ] Package scripts for generate/check flows
- [ ] Tests validating generator output and artifact freshness
- [ ] Updated docs/examples showing `$schema` usage and artifact location

### Definition of Done
- [ ] `bun run schema:config` regenerates the committed artifact without manual edits
- [ ] `bun run schema:config:check` exits non-zero when the committed artifact is stale
- [ ] `bun test src/config/schema-json-schema.test.ts` passes
- [ ] `bun run typecheck` passes
- [ ] `bun test` passes
- [ ] CI runs the schema freshness check alongside existing quality gates

### Guardrails (Must NOT)
- Do NOT change runtime config loading semantics in `src/infrastructure/fs/config-fs-loader.ts`
- Do NOT hand-maintain generated schema JSON after the generator exists
- Do NOT version artifacts by copying one file per package version unless a real consumer requires it
- Do NOT couple schema generation to `bun run build` if that would make normal local builds unexpectedly mutate the worktree

## TODOs

- [x] 1. Decide and document the artifact contract
  **What**: Lock in the output location, root metadata, and versioning policy before implementation so scripts, docs, and tests all target the same file.
  **Files**: `schema/weave-config.schema.json`, `src/config/json-schema.ts`, `.weave/plans/weave-config-json-schema.md`
  **Acceptance**: The plan is implemented with one canonical artifact at `schema/weave-config.schema.json`; the root schema includes a stable `$id`, a JSON Schema draft declaration, a human-readable title/description, and embedded Weave package version metadata (for traceability) without introducing versioned filenames.

- [x] 2. Add a reusable generator module next to the config source
  **What**: Create a source-level helper that converts `WeaveConfigSchema` into JSON Schema so the write script and tests share the same generation logic.
  **Files**: `src/config/json-schema.ts`, `src/config/index.ts`
  **Acceptance**: `src/config/json-schema.ts` exports a pure generator function (for example `generateWeaveConfigJsonSchema()`) plus artifact constants/path metadata; `src/config/index.ts` re-exports only if useful to internal callers.

- [x] 3. Implement generation with `zod-to-json-schema` and post-processing
  **What**: Add the library dependency, configure the conversion target/options, and patch gaps where the raw converter output is not good enough for this schema.
  **Files**: `package.json`, `bun.lock`, `src/config/json-schema.ts`
  **Acceptance**: The generator uses `zod-to-json-schema` with an explicit root name and deterministic options (`target`, `$ref` strategy, definitions path, formatting assumptions); generated output is stable across repeated runs; custom path constraints for `SafeRelativePathSchema` are surfaced via generated metadata/pattern/description so users still see the relative-path restriction in editors.

- [x] 4. Create a Bun script for generate and check modes
  **What**: Add a repository script that writes the artifact in normal mode and validates freshness in check mode without duplicating logic.
  **Files**: `script/generate-config-schema.ts`, `package.json`
  **Acceptance**: `bun run schema:config` writes `schema/weave-config.schema.json`; `bun run schema:config:check` compares generated output to the committed file and fails with a clear message if they differ; the script is deterministic and does not depend on runtime plugin state.

- [x] 5. Commit the generated schema artifact
  **What**: Add the first generated JSON Schema file to the repository and ensure its shape is editor-friendly for JSON/JSONC config authoring.
  **Files**: `schema/weave-config.schema.json`
  **Acceptance**: The committed artifact validates the current top-level config keys (`agents`, `custom_agents`, `categories`, `disabled_*`, `skill_directories`, `background`, `analytics`, `continuation`, `tmux`, `experimental`, `workflows`, `log_level`, `$schema`); the file is generated-only and reproducible via the script.

- [x] 6. Add focused tests around generator behavior and artifact freshness
  **What**: Add tests that validate the important parts of the generated schema instead of relying only on visual inspection.
  **Files**: `src/config/schema-json-schema.test.ts`
  **Acceptance**: Tests assert the root schema metadata, presence of expected properties/enums, representation of nested sections, and any post-processed path restrictions; one test verifies the committed artifact matches `generateWeaveConfigJsonSchema()` byte-for-byte (or normalized JSON string equality).

- [x] 7. Wire schema validation into repository quality checks
  **What**: Ensure stale schema artifacts are caught in automation, not only by local convention.
  **Files**: `.github/workflows/ci.yml`, `package.json`, `script/verify.ts`
  **Acceptance**: CI runs `bun run schema:config:check` before or alongside tests/typecheck; if `script/verify.ts` remains the repo-wide verifier, it includes a schema check step so local verification mirrors CI.

- [x] 8. Update config documentation to point at the generated artifact
  **What**: Replace purely manual schema narration with guidance that references the generated JSON Schema as the canonical machine-readable contract.
  **Files**: `docs/configuration.md`, `README.md`
  **Acceptance**: Docs explain where the schema lives, how to regenerate it, how to use `$schema` in local config files, and explicitly note that JSONC comments are still accepted by the loader even though the schema artifact itself is plain JSON.

- [x] 9. Update example config and example docs to demonstrate `$schema`
  **What**: Show real usage in the existing example package so users get completion/validation out of the box.
  **Files**: `examples/config/github-speckit/config/weave-opencode.jsonc`, `examples/config/github-speckit/README.md`
  **Acceptance**: The example config includes a `$schema` entry pointing to the chosen artifact URL/path; the README explains when to use the repo-hosted raw URL versus a copied local schema path.

- [x] 10. Verify edge cases and document known limitations
  **What**: Capture the non-obvious generator caveats so future schema changes do not silently weaken the artifact.
  **Files**: `src/config/schema-json-schema.test.ts`, `docs/configuration.md`
  **Acceptance**: The implementation documents and tests at least these cases: record/dictionary sections preserve `additionalProperties`, optional top-level sections remain optional, enums remain enums, and `refine()`-based path safety is called out as either approximated in JSON Schema or enforced primarily at runtime.

## Verification
- [x] All tests pass
- [x] No regressions
- [x] `bun run schema:config` produces no unexpected diff after a second run
- [x] `bun run schema:config:check` passes on a clean tree and fails on a deliberately stale artifact
- [x] `bun run typecheck` passes
- [x] `bun test src/config/schema-json-schema.test.ts` passes
- [x] `bun test` passes
- [x] CI includes the schema freshness check
