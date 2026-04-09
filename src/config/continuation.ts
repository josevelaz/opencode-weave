import type { ContinuationConfig } from "./schema"

export interface ResolvedContinuationConfig {
  recovery: {
    compaction: boolean
  }
  idle: {
    enabled: boolean
    work: boolean
    workflow: boolean
    todo_prompt: boolean
  }
}

const DEFAULT_CONTINUATION_CONFIG: ResolvedContinuationConfig = {
  recovery: {
    compaction: true,
  },
  idle: {
    enabled: false,
    work: false,
    workflow: false,
    todo_prompt: false,
  },
}

export function resolveContinuationConfig(
  continuation?: ContinuationConfig,
): ResolvedContinuationConfig {
  const idleEnabled = continuation?.idle?.enabled ?? DEFAULT_CONTINUATION_CONFIG.idle.enabled

  return {
    recovery: {
      compaction: continuation?.recovery?.compaction ?? DEFAULT_CONTINUATION_CONFIG.recovery.compaction,
    },
    idle: {
      enabled: idleEnabled,
      work: continuation?.idle?.work ?? idleEnabled,
      workflow: continuation?.idle?.workflow ?? idleEnabled,
      todo_prompt: continuation?.idle?.todo_prompt ?? idleEnabled,
    },
  }
}

export function hasIdleContinuationEnabled(
  continuation?: ContinuationConfig,
): boolean {
  const resolved = resolveContinuationConfig(continuation)
  return resolved.idle.work || resolved.idle.workflow || resolved.idle.todo_prompt
}

export { DEFAULT_CONTINUATION_CONFIG }
