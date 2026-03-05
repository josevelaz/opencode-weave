/** Check whether an agent is enabled (not in the disabled set). */
export function isAgentEnabled(name: string, disabled: Set<string>): boolean {
  return !disabled.has(name)
}
