// One background agent as the sidebar knows it.
export type AgentRow = {
  id: string
  description: string
  type: string
  name?: string
  // The model id or alias it runs on; '' until the engine says.
  model: string
  // The engine's AgentStatus word: running, waiting, idle, completed, ...
  status: string
  // What it is doing right now: a tool name, 'thinking', or ''.
  activity: string
  // Every token sent to the model across all its requests (cache reads included).
  tokensIn: number
  tokensOut: number
  // The size of its last request: how full its context window is.
  context: number
  steps: number
  startedAt: number
  lastAt: number
  endedAt?: number
  // True once $.agent.list() has shown it, so its disappearing from the list means it ended.
  isListed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-sidebar': {
      agents: Shaped<Record<string, AgentRow>>
      now: number
    }
  }
}
