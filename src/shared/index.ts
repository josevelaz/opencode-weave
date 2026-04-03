export type { DeepPartial, Brand } from "./types"
export { getWeaveVersion } from "./version"
export { log, logDelegation, debug, info, warn, error, setLogLevel, setClient } from "./log"
export type { DelegationEvent, LogLevel } from "./log"
export {
  AGENT_DISPLAY_NAMES,
  getAgentDisplayName,
  getAgentConfigKey,
  registerAgentDisplayName,
  updateBuiltinDisplayName,
  resetDisplayNames,
} from "./agent-display-names"
