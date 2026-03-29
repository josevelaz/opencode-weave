import * as path from 'path'
import * as os from 'os'
import type { LoadedSkill, SkillDiscoveryResult } from './types'
import { fetchSkillsFromOpenCode } from './opencode-client'
import { scanDirectory } from './discovery'
import { log } from '../../shared/log'
import { resolveSafePath } from '../../shared/resolve-safe-path'

export interface LoadSkillsOptions {
  serverUrl: string | URL
  directory?: string
  disabledSkills?: string[]
  /** Additional directories to scan for skills (from config `skill_directories`) */
  customDirs?: string[]
}

/**
 * Scan the filesystem for skills in OpenCode's standard locations plus any custom directories.
 * This covers both user-level (~/.config/opencode/skills/) and
 * project-level ({directory}/.opencode/skills/) skill directories,
 * plus any extra directories provided via config.
 */
function scanFilesystemSkills(directory: string, customDirs?: string[]): LoadedSkill[] {
  const userDir = path.join(os.homedir(), '.config', 'opencode', 'skills')
  const projectDir = path.join(directory, '.opencode', 'skills')
  const userSkills = scanDirectory({ directory: userDir, scope: 'user' })
  const projectSkills = scanDirectory({ directory: projectDir, scope: 'project' })

  // Custom directories (from config) — scanned as "project" scope, sandboxed to project root
  const customSkills: LoadedSkill[] = []
  if (customDirs) {
    for (const dir of customDirs) {
      const resolved = resolveSafePath(dir, directory)
      if (resolved) {
        customSkills.push(...scanDirectory({ directory: resolved, scope: 'project' }))
      }
    }
  }

  return [...projectSkills, ...customSkills, ...userSkills]
}

/**
 * Merge API-sourced skills with filesystem-sourced skills.
 * API results take precedence when both sources provide the same skill name.
 */
function mergeSkillSources(apiSkills: LoadedSkill[], fsSkills: LoadedSkill[]): LoadedSkill[] {
  const seen = new Set(apiSkills.map((s) => s.name))
  const merged = [...apiSkills]
  for (const skill of fsSkills) {
    if (!seen.has(skill.name)) {
      merged.push(skill)
      seen.add(skill.name)
    }
  }
  return merged
}

export async function loadSkills(options: LoadSkillsOptions): Promise<SkillDiscoveryResult> {
  const { serverUrl, directory = process.cwd(), disabledSkills = [], customDirs } = options

  // Primary: fetch from OpenCode HTTP API
  const apiSkills = await fetchSkillsFromOpenCode(serverUrl, directory)

  // Fallback: scan filesystem for skills the API may not have returned
  const fsSkills = scanFilesystemSkills(directory, customDirs)

  const skills = mergeSkillSources(apiSkills, fsSkills)

  if (apiSkills.length === 0 && fsSkills.length > 0) {
    log('OpenCode API returned no skills — using filesystem fallback', {
      fsSkillCount: fsSkills.length,
      fsSkillNames: fsSkills.map((s) => s.name),
    })
  }

  if (disabledSkills.length === 0) return { skills }
  const disabledSet = new Set(disabledSkills)
  return { skills: skills.filter((s) => !disabledSet.has(s.name)) }
}
