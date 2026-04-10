export interface PolicyResult<TEffect> {
  effects: TEffect[]
}

export function createPolicyResult<TEffect>(effects: TEffect[] = []): PolicyResult<TEffect> {
  return { effects }
}

export async function mergePolicyResults<TEffect>(
  results: Array<PolicyResult<TEffect> | Promise<PolicyResult<TEffect>>>,
): Promise<TEffect[]> {
  const resolvedResults = await Promise.all(results)
  return resolvedResults.flatMap((result) => result.effects)
}
