import { join } from "path"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

import { WeaveConfigSchema } from "./schema"

export type JsonSchemaObject = Record<string, unknown>

export const WEAVE_CONFIG_JSON_SCHEMA_RELATIVE_PATH = "schema/weave-config.schema.json"
export const WEAVE_CONFIG_JSON_SCHEMA_ID =
  "https://raw.githubusercontent.com/pgermishuys/opencode-weave/main/schema/weave-config.schema.json"
export const WEAVE_CONFIG_JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema"
export const WEAVE_CONFIG_JSON_SCHEMA_TITLE = "Weave Config"
export const WEAVE_CONFIG_JSON_SCHEMA_DESCRIPTION =
  "Configuration for the @opencode_weave/weave OpenCode plugin. Runtime loading accepts JSONC, while the generated schema artifact is plain JSON Schema."
export const WEAVE_CONFIG_JSON_SCHEMA_VERSION_KEY = "x-weave-version"
export const WEAVE_CONFIG_JSON_SCHEMA_ROOT_NAME = "WeaveConfig"
export const WEAVE_CONFIG_JSON_SCHEMA_DEFINITION_PATH = "$defs"
export const WEAVE_CONFIG_JSON_SCHEMA_REF_STRATEGY = "root"
export const WEAVE_CONFIG_JSON_SCHEMA_ZOD_TO_JSON_SCHEMA_TARGET = "jsonSchema2019-09"
export const WEAVE_CONFIG_JSON_SCHEMA_FALLBACK_TARGET = "draft-2020-12"
export const SAFE_RELATIVE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+"
export const SAFE_RELATIVE_PATH_DESCRIPTION =
  "Relative directory path only. Absolute paths and '..' traversal segments are rejected at runtime."

/**
 * Root-level metadata contract shared by the config schema generator, tests,
 * and docs. The artifact stays at one stable repository path; version
 * traceability is embedded as metadata instead of versioning filenames.
 */
export function getWeaveConfigJsonSchemaMetadata(version: string) {
  return {
    $schema: WEAVE_CONFIG_JSON_SCHEMA_DRAFT,
    $id: WEAVE_CONFIG_JSON_SCHEMA_ID,
    title: WEAVE_CONFIG_JSON_SCHEMA_TITLE,
    description: WEAVE_CONFIG_JSON_SCHEMA_DESCRIPTION,
    [WEAVE_CONFIG_JSON_SCHEMA_VERSION_KEY]: version,
  }
}

export function getWeaveConfigJsonSchemaArtifactPath(rootDir: string) {
  return join(rootDir, WEAVE_CONFIG_JSON_SCHEMA_RELATIVE_PATH)
}

type GenerateWeaveConfigJsonSchemaOptions = {
  version: string
}

function asObject(value: unknown): JsonSchemaObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonSchemaObject)
    : undefined
}

function resolveJsonSchemaRef(root: JsonSchemaObject, value: unknown): JsonSchemaObject | undefined {
  const schema = asObject(value)
  const ref = schema?.$ref
  if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) return schema

  const segments = ref.slice(2).split("/")
  let current: unknown = root

  for (const segment of segments) {
    current = asObject(current)?.[segment]
  }

  return asObject(current)
}

function appendDescription(schema: JsonSchemaObject, description: string) {
  const existing = typeof schema.description === "string" ? schema.description : undefined
  schema.description = existing ? `${existing} ${description}` : description
}

function hasResolvedRootDefinition(schema: JsonSchemaObject) {
  const root = resolveJsonSchemaRef(schema, { $ref: `#/$defs/${WEAVE_CONFIG_JSON_SCHEMA_ROOT_NAME}` })
  return !!root && Object.keys(root).length > 0
}

function createWrappedNativeSchema() {
  const nativeSchema = asObject(
    z.toJSONSchema(WeaveConfigSchema, {
      target: WEAVE_CONFIG_JSON_SCHEMA_FALLBACK_TARGET,
      reused: "inline",
    }),
  )

  if (!nativeSchema) {
    throw new Error("Failed to generate a JSON Schema from WeaveConfigSchema")
  }

  const { $schema: _ignoredDraft, ...rootSchema } = nativeSchema

  return {
    $ref: `#/$defs/${WEAVE_CONFIG_JSON_SCHEMA_ROOT_NAME}`,
    $defs: {
      [WEAVE_CONFIG_JSON_SCHEMA_ROOT_NAME]: rootSchema,
    },
  } satisfies JsonSchemaObject
}

function createBaseWeaveConfigJsonSchema() {
  const legacySchema = zodToJsonSchema(
    WeaveConfigSchema as unknown as Parameters<typeof zodToJsonSchema>[0],
    {
      name: WEAVE_CONFIG_JSON_SCHEMA_ROOT_NAME,
      target: WEAVE_CONFIG_JSON_SCHEMA_ZOD_TO_JSON_SCHEMA_TARGET,
      definitionPath: WEAVE_CONFIG_JSON_SCHEMA_DEFINITION_PATH,
      $refStrategy: WEAVE_CONFIG_JSON_SCHEMA_REF_STRATEGY,
    },
  ) as JsonSchemaObject

  return hasResolvedRootDefinition(legacySchema) ? legacySchema : createWrappedNativeSchema()
}

function annotateSafeRelativePathArray(root: JsonSchemaObject, value: unknown) {
  const schema = resolveJsonSchemaRef(root, value)
  const items = asObject(schema?.items)
  if (!items) return

  items.pattern = SAFE_RELATIVE_PATH_PATTERN
  appendDescription(items, SAFE_RELATIVE_PATH_DESCRIPTION)
}

function postProcessWeaveConfigJsonSchema(schema: JsonSchemaObject) {
  const rootDefinition = resolveJsonSchemaRef(
    schema,
    { $ref: `#/$defs/${WEAVE_CONFIG_JSON_SCHEMA_ROOT_NAME}` },
  )
  const properties = asObject(rootDefinition?.properties)
  if (!properties) return schema

  annotateSafeRelativePathArray(schema, properties.skill_directories)

  const workflows = resolveJsonSchemaRef(schema, properties.workflows)
  const workflowProperties = asObject(workflows?.properties)
  annotateSafeRelativePathArray(schema, workflowProperties?.directories)

  return schema
}

/**
 * Applies the repository's agreed root metadata contract to a generated
 * Weave config schema object. Pure so scripts and tests can share it.
 */
export function generateWeaveConfigJsonSchema({ version }: GenerateWeaveConfigJsonSchemaOptions): JsonSchemaObject {
  const schema = createBaseWeaveConfigJsonSchema()

  return postProcessWeaveConfigJsonSchema({
    ...schema,
    ...getWeaveConfigJsonSchemaMetadata(version),
  })
}

export function stringifyWeaveConfigJsonSchema(schema: JsonSchemaObject) {
  return `${JSON.stringify(schema, null, 2)}\n`
}
