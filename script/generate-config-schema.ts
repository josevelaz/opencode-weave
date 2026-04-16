#!/usr/bin/env bun

import { mkdir } from "fs/promises"
import { dirname } from "path"

import {
  generateWeaveConfigJsonSchema,
  getWeaveConfigJsonSchemaArtifactPath,
  stringifyWeaveConfigJsonSchema,
} from "../src/config/json-schema"
import { getWeaveVersion } from "../src/shared/version"

const checkMode = Bun.argv.includes("--check")
const rootDir = process.cwd()
const artifactPath = getWeaveConfigJsonSchemaArtifactPath(rootDir)
const nextArtifact = stringifyWeaveConfigJsonSchema(
  generateWeaveConfigJsonSchema({ version: getWeaveVersion() }),
)
const artifactFile = Bun.file(artifactPath)
const currentArtifact = (await artifactFile.exists()) ? await artifactFile.text() : null

if (checkMode) {
  if (currentArtifact !== nextArtifact) {
    console.error(`Config schema artifact is stale: ${artifactPath}`)
    console.error("Run `bun run schema:config` to regenerate it.")
    process.exit(1)
  }

  console.log(`Config schema artifact is up to date: ${artifactPath}`)
  process.exit(0)
}

await mkdir(dirname(artifactPath), { recursive: true })
await Bun.write(artifactPath, nextArtifact)
console.log(`Wrote config schema artifact: ${artifactPath}`)
