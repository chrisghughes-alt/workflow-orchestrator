import { atom, read, update } from 'claude-code'
import type { AgentInfo, Register } from 'claude-code'

import type { AgentRow } from '../types'

const PANE = 'agent-sidebar'
const COMMAND = 'agent-sidebar'
const MAX_ROWS = 40
const POLL_MS = 1000
const UNLISTED_GRACE_MS = 10_000

// Change the tag when AgentRow's fields change: a reload keeps what the old
// code stored, and the tag makes the new code start fresh instead of misreading it.
const agents = atom({ plugin: 'agent-sidebar', key: 'agents' } as const, {}, {
  shape: 'agents-1',
})
// The clock the pane draws elapsed times from; ticks only while an agent runs.
const now = atom({ plugin: 'agent-sidebar', key: 'now' } as const, 0)

type Dollar = Parameters<typeof update>[0]
type Map = Record<string, AgentRow>

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
    void $.ui.open({ id: PANE, title: 'Agents' })

    // Poll the engine's agent list: it is the only source of each agent's
    // status (running, idle, done). Write only on a change, so an idle
    // session does not redraw every second.
    $.clock.every(POLL_MS, () => {
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
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents', focus: true })

    return { text: 'Agents sidebar opened.' }
  }).catch(() => ({ text: 'The agents sidebar could not open.' }))

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
      await patch($, id, at, row => ({
        ...row,
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
    }

    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const map = await read($, agents)
    const clock = await read($, now)
    const width = Math.max(20, e.props.bodyColumns ?? 40)
    const viewing = e.props.view?.agentId

    const rows = Object.values(map).sort((a, b) => {
      const aDone = DONE.has(a.status) ? 1 : 0
      const bDone = DONE.has(b.status) ? 1 : 0
      return aDone - bDone || b.startedAt - a.startedAt
    })
    const running = rows.filter(row => !DONE.has(row.status)).length
    const spent = rows.reduce((sum, row) => sum + row.tokensOut, 0)

    const show = async (agentId?: string) => {
      const r = await $.ui.view(agentId === undefined ? {} : { agentId })
      if (r.deny !== undefined) $.ui.toast(`Can't open that agent: ${r.deny}`)
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {running} running · {rows.length - running} done · {tokens(spent)} out
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
          const label = row.name ?? (row.description || row.type || row.id)
          const elapsed = duration((row.endedAt ?? (clock || row.lastAt)) - row.startedAt)
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
                  {tokens(row.context)}
                </Text>
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
