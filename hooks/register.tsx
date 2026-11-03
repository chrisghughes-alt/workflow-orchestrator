import { atom, read, update } from 'claude-code'
import type { AgentInfo, Register, Timer } from 'claude-code'

import type { AgentRow, Gauge, Hr, HrMode } from '../types'

const PANE = 'agent-sidebar'
const COMMAND = 'agent-sidebar'
// The model calls it as mcp__workflow-orchestrator__agents.
const ROSTER_TOOL = 'agents'
const MAX_ROWS = 40
const POLL_MS = 1000
const UNLISTED_GRACE_MS = 10_000
// A running agent with no model request or tool call for this long is marked silent.
const SILENT_MS = 10 * 60_000

// The context watch: at this share of the main window used, ask for a handoff.
const HR_THRESHOLD = 50
// On since the /clear survival test passed live on 2026-11-03. After a /clear,
// a named background agent survives, still receives messages and replies.
// A session cron survives. The agent's row in the roster survives.
// This plugin's own stored values do not survive: they read as their defaults,
// so the watch re-arms from what it captured before the clear.
// Set it to false to refuse auto mode and arm in nudge mode instead.
const CLEAR_ENABLED = true
const AUTO_DISABLED_TEXT = 'auto mode is not enabled in this build yet; armed in nudge mode'
const HR_WATCH = 'hr-watch'
const HR_OFF = 'hr-off'
const WORKFLOW_DOC = 'C:\\Code-Repos\\Equipment Check\\docs\\Native-Agent-Workflow.md'

// Change the tag when AgentRow's fields change: a reload keeps what the old
// code stored, and the tag makes the new code start fresh instead of misreading it.
const agents = atom({ plugin: 'workflow-orchestrator', key: 'agents' } as const, {}, {
  shape: 'agents-2',
})
// The clock the pane draws elapsed times from; ticks only while an agent runs.
const now = atom({ plugin: 'workflow-orchestrator', key: 'now' } as const, 0)
// The main conversation's context window. `percent` is the share USED, not left.
const gauge = atom({ plugin: 'workflow-orchestrator', key: 'gauge' } as const, { window: 0 } as Gauge)
const hr = atom({ plugin: 'workflow-orchestrator', key: 'hr' } as const, {
  runFolder: '',
  phase: 'off',
  mode: 'nudge',
  threshold: HR_THRESHOLD,
} as Hr)

// A value stored before modes existed has none: it was a nudge-only watch.
function modeOf(state: Hr): HrMode {
  return state.mode === 'auto' ? 'auto' : 'nudge'
}

function nudgeText(percent: number, runFolder: string): string {
  return (
    `[HR] Context used ${Math.round(percent)}%. Write the orchestrator handoff to ${runFolder}\\handoffs\\orchestrator-handoff-YYYYMMDD-HHMM.md ` +
    "(use the clock for the stamp), bring the Run tracker section of the run's plan document up to date and commit it " +
    `on main as a docs-only commit, update ${runFolder}\\orchestrator-state.md, then end your turn.`
  )
}

// The successor arms the watch through the tool, since a model cannot run a
// slash command, and in the mode the watch was armed in.
function resumeText(handoffPath: string, runFolder: string, mode: HrMode): string {
  return (
    `[HR] Successor start. Read ${handoffPath}, ${runFolder}\\orchestrator-state.md and ${WORKFLOW_DOC} in full, ` +
    'check CronList and re-create the 30-minute heartbeat cron only if it is gone, call the ' +
    `mcp__workflow-orchestrator__hr_watch tool with runFolder ${runFolder} and mode ${mode}, ` +
    "then continue from the handoff's next three actions."
  )
}

// A path inside a folder, joined with the separator the folder already uses, so
// a Windows path stays all backslashes.
function within(folder: string, name: string): string {
  const sep = folder.includes('\\') ? '\\' : '/'
  return folder.endsWith(sep) ? `${folder}${name}` : `${folder}${sep}${name}`
}

type HandoffIo = {
  list: (path: string) => Promise<readonly { name: string; kind: string; mtimeMs: number }[]>
  toast: (text: string) => void
}

// After the main loop's turn ends while nudged: looks for a handoff written
// since the nudge (the newest .md in the run's handoffs folder). None: still
// nudged. Found: in auto mode with /clear enabled, the next poll clears and
// resumes; otherwise the watch is ready and waits for the owner to clear.
export async function seeHandoff(state: Hr, io: HandoffIo, clearEnabled: boolean): Promise<Hr> {
  if (state.phase !== 'nudged') return state
  const since = state.nudgedAt ?? 0
  const folder = within(state.runFolder, 'handoffs')
  const entries = await io.list(folder)
  const newest = entries
    .filter(f => f.kind === 'file' && f.name.toLowerCase().endsWith('.md') && f.mtimeMs > since)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  if (newest === undefined) return state
  const handoffPath = within(folder, newest.name)
  if (modeOf(state) === 'auto' && clearEnabled) return { ...state, handoffPath, phase: 'clearing' }
  io.toast('HR: handoff written; run /clear when ready')
  return { ...state, handoffPath, phase: 'ready' }
}

type ClearIo = {
  clear: () => Promise<unknown>
  submit: (text: string) => Promise<unknown>
  toast: (text: string) => void
}

// Clears the conversation, then hands the fresh one its start prompt. Run from
// the poll, never from a hook the turn waits on, where the engine refuses a
// slash command. Either way it ends armed.
export async function finishClear(state: Hr, io: ClearIo): Promise<Hr> {
  try {
    await io.clear()
    await io.submit(resumeText(state.handoffPath ?? '', state.runFolder, modeOf(state)))
  } catch (error) {
    io.toast(`HR: clear and resume failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { ...state, phase: 'armed', waitsForDrop: true }
}

type Dollar = Parameters<typeof update>[0]
type Map = Record<string, AgentRow>

// Kept per process, not per session start: the one running poll, and whether a
// clear and resume is in flight. A /clear that raises a new session start
// mid-clear must neither start a second poll nor a second clear.
let poll: Timer | undefined
let isClearing = false
// Set when /hr-off or the hr_off tool runs while a clear is in flight, so the
// end of that clear does not re-arm a watch the owner turned off.
let isOffDuringClear = false

// Whether the stored watch reads as never armed, which is how it reads once a
// /clear has wiped the plugin's values. /hr-off leaves the same shape behind,
// which is why the clear also checks isOffDuringClear.
function isFresh(state: Hr): boolean {
  return state.phase === 'off' && state.runFolder === ''
}

// Splits /hr-watch's arguments into the run folder, an optional mode word and
// an optional threshold word after the mode. The folder may hold spaces, so a
// word is taken as the mode only when it is nudge or auto, and as the
// threshold only when it follows the mode. A threshold word that is not a
// whole number becomes NaN, which armWatch refuses.
function watchArgs(args: string): { runFolder: string; mode?: string; threshold?: number } {
  const text = args.trim()
  const found = /^(.*\S)\s+(nudge|auto)(?:\s+(\S+))?$/i.exec(text)
  if (!found) return { runFolder: text }
  const word = found[3]
  return {
    runFolder: found[1]!,
    mode: found[2]!.toLowerCase(),
    ...(word === undefined ? {} : { threshold: /^[+-]?\d+$/.test(word) ? Number(word) : Number.NaN }),
  }
}

// A threshold the watch accepts: a whole percent from 1 to 100.
function isThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100
}

// "HR armed on <folder>", then the mode when auto and the threshold when not
// the default: "(auto)", "(5%)" or "(auto, 5%)".
function armedText(path: string, state: Hr): string {
  const parts: string[] = []
  if (modeOf(state) === 'auto') parts.push('auto')
  if (state.threshold !== HR_THRESHOLD) parts.push(`${state.threshold}%`)
  return parts.length === 0 ? `HR armed on ${path}` : `HR armed on ${path} (${parts.join(', ')})`
}

// Arms the context watch on a run folder that exists, in nudge mode unless
// auto is asked for and /clear is enabled, at the given threshold or the
// default. Arming it again on the same folder, mode and threshold (or none
// given) leaves it where it is (armed, or mid-nudge); from ready it re-arms.
// Returns the reply shown to whoever asked.
async function armWatch(
  $: Dollar,
  runFolder: string,
  mode: string | undefined,
  threshold?: unknown,
): Promise<string> {
  const path = runFolder.trim()
  if (path === '')
    return 'HR: give the run folder: /hr-watch <absolute path> [nudge|auto] [threshold]. The watch stays off.'
  if (mode !== undefined && mode !== 'nudge' && mode !== 'auto')
    return `HR: unknown mode ${mode}; use nudge or auto. The watch is unchanged.`
  if (threshold !== undefined && !isThreshold(threshold)) return 'HR: threshold must be a whole number from 1 to 100'
  const exists = await $.fs.exists(path).catch(() => false)
  if (!exists) return `HR: no folder at ${path}. The watch stays off.`
  const wanted: HrMode = mode === 'auto' && CLEAR_ENABLED ? 'auto' : 'nudge'
  let stored: Hr | undefined
  await update($, hr, (cur: Hr) => {
    const isWatching = cur.phase === 'armed' || cur.phase === 'nudged' || cur.phase === 'clearing'
    const isSameThreshold = threshold === undefined || threshold === cur.threshold
    if (isWatching && cur.runFolder === path && modeOf(cur) === wanted && isSameThreshold) {
      stored = cur
      return cur
    }
    stored = {
      runFolder: path,
      phase: 'armed',
      mode: wanted,
      threshold: isThreshold(threshold) ? threshold : HR_THRESHOLD,
      // Re-armed from ready the context is likely still over the threshold:
      // wait for it to drop before asking for another handoff.
      ...(cur.phase === 'ready' ? { waitsForDrop: true } : {}),
    }
    return stored
  })
  if (mode === 'auto' && !CLEAR_ENABLED) return AUTO_DISABLED_TEXT
  return armedText(path, stored ?? { runFolder: path, phase: 'armed', mode: wanted, threshold: HR_THRESHOLD })
}

// Turns the watch off and forgets its run.
async function disarmWatch($: Dollar): Promise<string> {
  if (isClearing) isOffDuringClear = true
  await update($, hr, (cur: Hr) => ({
    runFolder: '',
    phase: 'off',
    mode: 'nudge',
    threshold: cur.threshold || HR_THRESHOLD,
  }))
  return 'HR off'
}

const DONE = new Set(['completed', 'failed', 'killed'])

function blank(id: string, at: number): AgentRow {
  return {
    id,
    description: '',
    type: '',
    model: '',
    status: 'running',
    activity: '',
    tokensIn: 0,
    tokensOut: 0,
    context: 0,
    steps: 0,
    startedAt: at,
    lastAt: at,
    isListed: false,
  }
}

async function patch($: Dollar, id: string, at: number, fn: (row: AgentRow) => AgentRow) {
  await update($, agents, (map: Map) => ({ ...map, [id]: fn(map[id] ?? blank(id, at)) }))
}

// Folds the engine's agent list into what the sidebar keeps. The engine drops a
// finished agent from its list a while after it ends, and from then on the
// agent can no longer be opened, so the sidebar drops it too.
function merge(map: Map, list: readonly AgentInfo[], at: number): Map {
  const next: Map = { ...map }
  const listed = new Set<string>()
  for (const info of list) {
    listed.add(info.id)
    const row = next[info.id] ?? blank(info.id, at)
    const isDone = DONE.has(info.status)
    next[info.id] = {
      ...row,
      description: row.description || info.description,
      type: row.type || info.type,
      name: info.name ?? row.name,
      status: info.status,
      activity: isDone ? '' : row.activity,
      endedAt: isDone ? (row.endedAt ?? at) : undefined,
      isListed: true,
    }
  }
  for (const [id, row] of Object.entries(next)) {
    if (!listed.has(id) && row.isListed) delete next[id]
    // An agent the list never showed (a workflow's) cannot be opened either. Its
    // end is known from its last turn; wait a little in case the list is just late.
    else if (!row.isListed && row.endedAt !== undefined && at - row.endedAt > UNLISTED_GRACE_MS)
      delete next[id]
  }
  const kept = Object.values(next)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_ROWS)
  return Object.fromEntries(kept.map(row => [row.id, row]))
}

// The pane's order: running agents first, then done ones, newest first within each.
function ordered(map: Map): AgentRow[] {
  return Object.values(map).sort((a, b) => {
    const aDone = DONE.has(a.status) ? 1 : 0
    const bDone = DONE.has(b.status) ? 1 : 0
    return aDone - bDone || b.startedAt - a.startedAt
  })
}

// The name a row shows under: the engine's name, else what it was spawned to do.
function labelOf(row: AgentRow): string {
  return row.name ?? (row.description || row.type || row.id)
}

// One row as the agents tool hands it to the model. `endedAt` is null while it
// runs, so the key is always there (JSON drops an undefined one).
function rosterRow(row: AgentRow) {
  return {
    name: labelOf(row),
    id: row.id,
    model: row.model,
    status: row.status,
    activity: row.activity,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    context: row.context,
    steps: row.steps,
    startedAt: row.startedAt,
    lastAt: row.lastAt,
    endedAt: row.endedAt ?? null,
    // As read inside the agent's own step; null before its first.
    window: row.window ?? null,
  }
}

// "123k", or "123k (41%)" once a window is known for the row.
function contextOf(row: AgentRow): string {
  if (row.window === undefined || row.window <= 0) return tokens(row.context)
  return `${tokens(row.context)} (${Math.round((row.context / row.window) * 100)}%)`
}

// Each model family gets a color, and also a glyph and a text tag, so the
// model can be told apart without relying on color.
function family(model: string): { tag: string; glyph: string; color: string } {
  const m = model.toLowerCase()
  if (m.includes('opus')) return { tag: 'OPUS', glyph: '◆', color: '#c678dd' }
  if (m.includes('sonnet')) return { tag: 'SONN', glyph: '●', color: '#61afef' }
  if (m.includes('haiku')) return { tag: 'HAIK', glyph: '▲', color: '#98c379' }
  if (m.includes('fable')) return { tag: 'FABL', glyph: '★', color: '#e5c07b' }
  if (m === '') return { tag: '····', glyph: '·', color: 'inactive' }
  return { tag: m.slice(0, 4).toUpperCase(), glyph: '■', color: 'text' }
}

function state(row: AgentRow): { label: string; color: string } {
  if (row.status === 'completed') return { label: '✓ done', color: 'inactive' }
  if (row.status === 'failed') return { label: '✗ failed', color: 'error' }
  if (row.status === 'killed') return { label: '✗ stopped', color: 'error' }
  if (row.status === 'pending') return { label: '… starting', color: 'warning' }
  if (row.status === 'idle' || row.status === 'waiting') return { label: '‖ idle', color: 'warning' }
  if (row.activity === '' || row.activity === 'thinking') return { label: '▶ thinking', color: 'success' }
  return { label: `▶ ${row.activity}`, color: 'success' }
}

function tokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

function clip(text: string, width: number): string {
  if (width <= 1) return ''
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show the background agents sidebar',
    })
    await $.command
      .register({
        name: HR_WATCH,
        description: 'Arm the context watch: nudge a handoff at the threshold, then clear and resume',
        argumentHint: '<run-folder> [nudge|auto] [threshold]',
      })
      .catch(() => undefined)
    await $.command.register({ name: HR_OFF, description: 'Disarm the context watch' }).catch(() => undefined)
    void $.ui.open({ id: PANE, title: 'Agents' })
    // A failed registration costs the model the tool, never the sidebar its poll.
    await $.tool
      .register({
        name: ROSTER_TOOL,
        description:
          'The agents sidebar as JSON: one row per background agent with name, model, status, activity, tokens, context size and timestamps. Read-only.',
        inputSchema: { type: 'object', properties: {} },
      })
      .catch(() => undefined)
    // The watch's two doors for the model, which cannot run slash commands.
    await $.tool
      .register({
        name: 'hr_watch',
        description:
          'Arm the context watch for this session: nudge for a handoff at the threshold (percent of context used, 1 to 100, default 50), then (mode auto) clear and resume, or (mode nudge, the default) wait for the owner. Pass the absolute run folder.',
        inputSchema: {
          type: 'object',
          properties: {
            runFolder: { type: 'string' },
            mode: { type: 'string', enum: ['nudge', 'auto'] },
            threshold: { type: 'integer', minimum: 1, maximum: 100 },
          },
          required: ['runFolder'],
        },
      })
      .catch(() => undefined)
    await $.tool
      .register({
        name: 'hr_off',
        description: 'Disarm the context watch.',
        inputSchema: { type: 'object', properties: {} },
      })
      .catch(() => undefined)

    // Asks the main loop for a handoff once, the first time an armed watch sees
    // the gauge at the threshold. The phase moves to nudged before the prompt
    // goes, so a later poll never sends a second one.
    const nudgeAtThreshold = async (reading: Gauge) => {
      const percent = reading.percent
      if (percent === undefined) return
      const seen = await read($, hr)
      if (seen.phase !== 'armed') return
      if (seen.waitsForDrop) {
        if (percent < seen.threshold) {
          await update($, hr, (cur: Hr) =>
            cur.phase === 'armed' ? { ...cur, waitsForDrop: undefined } : cur,
          )
        }
        return
      }
      if (percent < seen.threshold) return
      const at = await $.clock.now()
      let state: Hr | undefined
      await update($, hr, (cur: Hr) => {
        state = undefined
        if (cur.phase !== 'armed' || cur.waitsForDrop || percent < cur.threshold) return cur
        state = { ...cur, phase: 'nudged', nudgedAt: at, handoffPath: undefined }
        return state
      })
      if (state === undefined) return
      const runFolder = state.runFolder
      void $.prompt.submit({ text: nudgeText(percent, runFolder) }).catch(async (error: unknown) => {
        $.ui.toast(`HR: the handoff nudge failed, watch off: ${error instanceof Error ? error.message : String(error)}`)
        await update($, hr, (cur: Hr) => (cur.phase === 'nudged' ? { ...cur, phase: 'off' } : cur))
      })
    }

    // Poll the engine's agent list: it is the only source of each agent's
    // status (running, idle, done). Write only on a change, so an idle
    // session does not redraw every second.
    // One poll per process: a later session start (a /clear may raise one)
    // stops the poll before it and starts one on the new session, so there are
    // never two, and never none if the old session's timer died with it.
    try {
      poll?.cancel()
    } catch {
      // A timer of a session already gone; nothing left to stop.
    }
    poll = $.clock.every(POLL_MS, () => {
      void (async () => {
        const [list, at, map] = await Promise.all([$.agent.list(), $.clock.now(), read($, agents)])
        const merged = merge(map, list, at)
        if (JSON.stringify(merged) !== JSON.stringify(map)) {
          await update($, agents, (current: Map) => merge(current, list, at))
        }
        if (Object.values(merged).some(row => !DONE.has(row.status))) {
          await update($, now, () => at)
        }
      })()
      // Separate from the list refresh, so a failed usage read never stops it.
      void (async () => {
        const { context } = await $.session.usage()
        // `percent` is tokens over window: the share of the window USED, not left.
        const reading: Gauge = { percent: context.percent, window: context.window, tokens: context.tokens }
        const last = await read($, gauge)
        if (JSON.stringify(reading) !== JSON.stringify(last)) await update($, gauge, () => reading)
        await nudgeAtThreshold(reading)
      })().catch(() => undefined)
      // The clear and resume run here, off any hook, once a handoff was seen.
      void (async () => {
        if (isClearing) return
        const state = await read($, hr)
        if (state.phase !== 'clearing') return
        isClearing = true
        isOffDuringClear = false
        try {
          // `state` was read before the clear; finishClear takes the handoff,
          // run folder, mode and threshold from it, never from the store.
          const after = await finishClear(state, {
            clear: () => $.command.run({ command: 'clear' }),
            submit: text => $.prompt.submit({ text }),
            toast: text => $.ui.toast(text),
          })
          // The clear wiped the store, so the watch reads as never armed: re-arm
          // it unless the owner turned it off meanwhile. If the successor armed
          // it first through hr_watch, keep what it set.
          await update($, hr, (cur: Hr) =>
            cur.phase === 'clearing' || (isFresh(cur) && !isOffDuringClear) ? after : cur,
          )
        } finally {
          isClearing = false
        }
      })().catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents', focus: true })

    return { text: 'Agents sidebar opened.' }
  }).catch(() => ({ text: 'The agents sidebar could not open.' }))

  // Arms the context watch on a run folder that exists. Arming it again on the
  // same folder leaves it where it is (armed, or mid-nudge).
  on('command.run', { command: HR_WATCH }, async ($, e) => {
    const { runFolder, mode, threshold } = watchArgs(e.args)
    return { text: await armWatch($, runFolder, mode, threshold) }
  }).catch(() => ({ text: 'HR: the watch could not be armed.' }))

  on('command.run', { command: HR_OFF }, async $ => ({ text: await disarmWatch($) })).catch(() => ({
    text: 'HR: the watch could not be turned off.',
  }))

  // The same two functions as the commands above, for the model: the reply
  // text comes back as the tool's result.
  on('tool.call', { tool: 'mcp__workflow-orchestrator__hr_watch' }, async ($, e) => {
    const input = e as unknown as { runFolder?: unknown; mode?: unknown; threshold?: unknown }
    const runFolder = typeof input.runFolder === 'string' ? input.runFolder : ''
    const mode = typeof input.mode === 'string' ? input.mode : undefined
    // Passed through as given, so a value of the wrong type is refused, not dropped.
    return { result: await armWatch($, runFolder, mode, input.threshold) }
  }).catch(() => ({ deny: 'HR: the watch could not be armed.' }))

  on('tool.call', { tool: 'mcp__workflow-orchestrator__hr_off' }, async $ => ({
    result: await disarmWatch($),
  })).catch(() => ({ deny: 'HR: the watch could not be turned off.' }))

  // The spawn is the one place the engine says which model an agent runs on.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId !== undefined) {
      const id = r.agentId
      const at = await $.clock.now()
      await patch($, id, at, row => ({
        ...row,
        model: r.model,
        description: e.description,
        type: e.subagentType,
        // Its first model request can land before the spawn resolves.
        startedAt: Math.min(row.startedAt, at),
        lastAt: at,
      }))
    }

    return r
    // On any failure here, let the spawn go through untouched.
  }).catch(($, e, next) => next(e))

  // Each model request an agent makes: mark it thinking, then add up its tokens.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) return yield* next(e)
    const id = e.agentId
    const start = await $.clock.now()
    await patch($, id, start, row => ({
      ...row,
      model: row.model || e.model,
      activity: 'thinking',
      lastAt: start,
    }))
    const r = yield* next(e)
    const usage = r.usage
    if (usage !== null) {
      const sent =
        usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      const at = await $.clock.now()
      // Read from inside this agent's own hook, in case the engine scopes it to
      // the agent. The contract does not say it does; unverified per agent.
      const window = await $.session
        .usage()
        .then(u => u.context.window)
        .catch(() => undefined)
      await patch($, id, at, row => ({
        ...row,
        window: window ?? row.window,
        model: row.model || usage.model,
        tokensIn: row.tokensIn + sent,
        tokensOut: row.tokensOut + usage.output_tokens,
        context: sent + usage.output_tokens,
        steps: row.steps + 1,
        lastAt: at,
      }))
    }

    return r
  })

  // The roster tool: the sidebar's rows, in the pane's order, as JSON.
  on('tool.call', { tool: 'mcp__workflow-orchestrator__agents' }, async $ => {
    const map = await read($, agents)
    return { result: JSON.stringify(ordered(map).map(rosterRow)) }
  }).catch(() => ({ deny: 'The agents sidebar could not be read.' }))

  // The tool an agent is running right now.
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) return next(e)
    const id = e.agentId
    const at = await $.clock.now()
    await patch($, id, at, row => ({ ...row, activity: e.tool, lastAt: at }))
    try {
      return await next(e)
    } finally {
      const end = await $.clock.now()
      await patch($, id, end, row => ({
        ...row,
        activity: row.activity === e.tool ? 'thinking' : row.activity,
        lastAt: end,
      }))
    }
    // On any failure here, let the tool call go through untouched.
  }).catch(($, e, next) => next(e))

  // An agent's run ended. Agents the engine never lists (a workflow's) are
  // marked done here, since no list change will do it for them.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) {
      const at = await $.clock.now()
      await patch($, e.agentId, at, row => ({
        ...row,
        activity: '',
        status: row.isListed ? row.status : 'completed',
        endedAt: row.isListed ? row.endedAt : at,
        lastAt: at,
      }))
    } else {
      // The main loop's turn ended: if the watch nudged, look for the handoff.
      try {
        const state = await read($, hr)
        if (state.phase === 'nudged') {
          const seen = await seeHandoff(
            state,
            { list: path => $.fs.list(path), toast: text => $.ui.toast(text) },
            CLEAR_ENABLED,
          )
          if (seen !== state) await update($, hr, (cur: Hr) => (cur.phase === 'nudged' ? seen : cur))
        }
      } catch {
        // The watch stays nudged; the next main turn's end looks again.
      }
    }

    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const map = await read($, agents)
    const clock = await read($, now)
    const fill = await read($, gauge)
    const watch = await read($, hr)
    // Armed shows the mode (nudge or auto); every later phase shows itself.
    const hrPart =
      watch.phase === 'off' ? '' : ` · HR ${watch.phase === 'armed' ? modeOf(watch) : watch.phase}`
    const width = Math.max(20, e.props.bodyColumns ?? 40)
    const viewing = e.props.view?.agentId

    const rows = ordered(map)
    const running = rows.filter(row => !DONE.has(row.status)).length
    const spent = rows.reduce((sum, row) => sum + row.tokensOut, 0)

    const show = async (agentId?: string) => {
      const r = await $.ui.view(agentId === undefined ? {} : { agentId })
      if (r.deny !== undefined) $.ui.toast(`Can't open that agent: ${r.deny}`)
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>
          ctx used {fill.percent === undefined ? '?' : Math.round(fill.percent)}%{hrPart} · {running} running ·{' '}
          {rows.length - running} done · {tokens(spent)} out
        </Text>
        <Button key="main" plain onPress={() => void show()}>
          {viewing === undefined ? '▸ ' : '  '}
          <Text bold={viewing === undefined}>Main conversation</Text>
        </Button>
        {rows.length === 0 && <Text dimColor>No background agents yet.</Text>}
        {rows.map(row => {
          const fam = family(row.model)
          const st = state(row)
          const isDone = DONE.has(row.status)
          const isViewed = viewing === row.id
          const label = labelOf(row)
          const elapsed = duration((row.endedAt ?? (clock || row.lastAt)) - row.startedAt)
          const quiet = isDone ? 0 : clock - row.lastAt
          return (
            <Box key={`box-${row.id}`} flexDirection="column" marginTop={1}>
              <Button key={row.id} plain onPress={() => void show(row.id)}>
                {isViewed ? '▸ ' : '  '}
                <Text color={fam.color} dimColor={isDone}>
                  {fam.glyph} {fam.tag}
                </Text>{' '}
                <Text bold={isViewed} dimColor={isDone}>
                  {clip(label, width - 10)}
                </Text>
              </Button>
              <Text>
                {'    '}
                <Text color={st.color}>{st.label}</Text>
                <Text dimColor>
                  {' '}
                  · {elapsed} · ↑{tokens(row.tokensIn)} ↓{tokens(row.tokensOut)} · ctx{' '}
                  {contextOf(row)}
                </Text>
                {/* The glyph and the word carry the warning, not the color alone. */}
                {quiet > SILENT_MS && <Text color="warning"> · ⚠ silent {duration(quiet)}</Text>}
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
