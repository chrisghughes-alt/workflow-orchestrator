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

// The main conversation's context window, as $.session.usage() last reported it.
// `percent` is the share USED (tokens over window, 0-100), not the share left.
export type Gauge = {
  percent?: number
  window: number
  tokens?: number
}

// The context watch. `off` until /hr-watch arms it on a run folder; `armed`
// waits for the gauge to reach the threshold; `nudged` has asked the main loop
// for a handoff and waits for the file; `clearing` runs /clear and the resume.
export type HrPhase = 'off' | 'armed' | 'nudged' | 'clearing'
export type Hr = {
  runFolder: string
  phase: HrPhase
  threshold: number
  nudgedAt?: number
  handoffPath?: string
  // Set when the watch re-arms after a handoff: no new nudge until the gauge
  // has read below the threshold, so a context still over it does not ask for
  // a second handoff on the very next poll.
  waitsForDrop?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-sidebar': {
      agents: Shaped<Record<string, AgentRow>>
      now: number
      gauge: Gauge
      hr: Hr
    }
  }
}
