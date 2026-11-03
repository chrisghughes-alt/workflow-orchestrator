import { expect, mock, test } from 'claude-code/testing'

import { finishClear, seeHandoff } from '../hooks/register'
import type { Hr } from '../types'

const PANE = {
  plugin: 'agent-sidebar',
  component: 'Pane',
  requestId: 'agent-sidebar',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('a spawned agent shows its model, activity and tokens', async ($, on) => {
  // Each hook here stands in for the engine beneath the plugin.
  let clock = 1_000_000
  on('clock.now', () => ({ value: (clock += 1000) }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'tool_use',
      usage: {
        model: 'claude-opus-5-5',
        input_tokens: 1200,
        output_tokens: 300,
        cache_read_input_tokens: 10000,
        cache_creation_input_tokens: 0,
      },
    }
  })
  let seenDuringTool = ''
  on('tool.call', async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    seenDuringTool = (await ui.find({ type: 'Text', text: /Bash/ }))?.text ?? ''
    await ui.unmount()
    return { result: {} }
  })

  await $.agent.spawn({ prompt: 'look around', description: 'Survey the repo' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a1' } as never)) {
    // drain
  }
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' } as never)

  expect(seenDuringTool).toContain('▶ Bash')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
  const ui = await $.ui.mount({ ...PANE, surface })
  const title = await ui.find({ type: 'Text', text: /Survey the repo/ })
  expect(title?.text).toContain('Survey the repo')
  const tag = await ui.find({ type: 'Text', text: /OPUS/ })
  expect(tag?.text).toBe('◆ OPUS')
  const stats = await ui.find({ type: 'Text', text: /↑/ })
  expect(stats?.text).toContain('↑11k ↓300')
  await ui.unmount()
  }
})

test('a value an earlier version stored is declined', async ($, on) => {
  on('state.get', () => ({ value: { value: [{ id: 'old' }], version: 1 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /No background agents/ }))?.text).toBe(
    'No background agents yet.',
  )
  await ui.unmount()
})

// Stands in for $.session.usage(): the main conversation's context window.
function usage(percent: number | undefined) {
  return {
    value: {
      startedAt: 0,
      context: { window: 200_000, percent, tokens: percent === undefined ? undefined : percent * 2000 },
      rateLimits: [],
    },
  }
}

test('the header shows how much of the main context window is used', async ($, on) => {
  const clock = mock.clock(on)
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => usage(43))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await clock.advance(1500)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /running/ }))?.text).toContain('ctx used 43%')
  await ui.unmount()
})

test('the header says ? when the context share is not known yet', async ($, on) => {
  const clock = mock.clock(on)
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => usage(undefined))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await clock.advance(1500)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /running/ }))?.text).toContain('ctx used ?%')
  await ui.unmount()
})

test('an agent with no activity for over ten minutes is marked silent, a done one never', async ($, on) => {
  const clock = mock.clock(on)
  let list = [{ id: 'a1', description: 'Survey the repo', type: 'Explore', status: 'running' }]
  on('agent.list', () => ({ value: list }))
  on('session.usage', () => usage(10))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const stats = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const row = await ui.find({ type: 'Text', text: /↑/ })
    await ui.unmount()
    return row?.text ?? ''
  }

  await clock.advance(1500)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' } as never)
  await clock.advance(5 * 60_000)
  expect(await stats()).not.toContain('silent')

  await clock.advance(6 * 60_000)
  // The pane's clock moves on the 1-second poll, so the figure lags by up to a second.
  expect(await stats()).toMatch(/ · ⚠ silent 1[01]m\d\ds$/)

  list = [{ ...list[0]!, status: 'completed' }]
  await clock.advance(1500)
  expect(await stats()).not.toContain('silent')
})

test('the model can read the sidebar as JSON through the agents tool', async ($, on) => {
  const clock = mock.clock(on)
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => usage(10))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const registered: { name: string; description: string; inputSchema?: unknown }[] = []
  on('tool.register', (_, e) => {
    registered.push(e)
    return { value: { tool: `mcp__agent-sidebar__${e.name}` } }
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(registered.map(t => t.name)).toEqual(['agents'])
  expect(registered[0]!.inputSchema).toEqual({ type: 'object', properties: {} })

  await $.agent.spawn({ prompt: 'look around', description: 'Survey the repo' })
  await clock.advance(1500)

  const r = await $.tool.call({ tool: 'mcp__agent-sidebar__agents' } as never)
  const rows = JSON.parse(r.result as string) as Record<string, unknown>[]
  expect(rows.length).toBe(1)
  expect(rows[0]).toEqual(
    expect.objectContaining({
      name: 'Survey the repo',
      id: 'a1',
      model: 'claude-sonnet-5-5',
      status: 'running',
      tokensIn: 0,
      tokensOut: 0,
      context: 0,
      steps: 0,
    }),
  )
  expect(Object.keys(rows[0]!).sort()).toEqual(
    ['activity', 'context', 'endedAt', 'id', 'lastAt', 'model', 'name', 'startedAt', 'status', 'steps', 'tokensIn', 'tokensOut', 'window'].sort(),
  )
  // No step yet, so no window read.
  expect(rows[0]!.window).toBe(null)
})

test('an agent whose step read a context window shows how full it is', async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('session.usage', () => usage(10))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: 'claude-sonnet-5-5',
        input_tokens: 1200,
        output_tokens: 300,
        cache_read_input_tokens: 10000,
        cache_creation_input_tokens: 0,
      },
    }
  })

  await $.agent.spawn({ prompt: 'look around', description: 'Survey the repo' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'a1' } as never)) {
    // drain
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // 11,500 of a 200,000 window.
  expect((await ui.find({ type: 'Text', text: /↑/ }))?.text).toContain('ctx 12k (6%)')
  await ui.unmount()
  const r = await $.tool.call({ tool: 'mcp__agent-sidebar__agents' } as never)
  expect((JSON.parse(r.result as string) as { window: unknown }[])[0]!.window).toBe(200_000)
})

const RUN = 'C:\\runs\\r1'
const NUDGE_55 =
  `[HR] Context used 55%. Write the orchestrator handoff to ${RUN}\\handoffs\\orchestrator-handoff-YYYYMMDD-HHMM.md ` +
  '(use the clock for the stamp), bring the Run tracker section of the run\'s plan document up to date and commit it ' +
  `on main as a docs-only commit, update ${RUN}\\orchestrator-state.md, then end your turn.`

type Fs = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }

// Stands in for the engine under the context watch: a run folder that exists,
// a gauge the test sets, and a record of every prompt, command and toast.
function hrEngine(on: Parameters<Parameters<typeof test>[1]>[1]) {
  const clock = mock.clock(on)
  const world = {
    percent: 10 as number | undefined,
    handoffs: [] as Fs[],
    submits: [] as string[],
    commands: [] as string[],
    toasts: [] as string[],
  }
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => usage(world.percent))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__agent-sidebar__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    world.toasts.push(typeof e === 'string' ? e : JSON.stringify(e))
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // The engine hands these hooks the path in Windows form, backslashes throughout.
  on('fs.exists', (_, e) => ({ value: e.path === RUN }))
  on('fs.list', (_, e) => ({ value: e.path === `${RUN}\\handoffs` ? world.handoffs : [] }))
  on('prompt.submit', (_, e) => {
    world.submits.push(e.text)
    return { text: e.text }
  })
  on('command.run', (_, e) => {
    world.commands.push(e.command)
    return { text: '' }
  })
  on('turn.complete', () => ({ text: '' }))
  return { clock, world }
}

async function header($: Parameters<Parameters<typeof test>[1]>[0]) {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = (await ui.find({ type: 'Text', text: /running/ }))?.text ?? ''
  await ui.unmount()
  return text
}

const mainTurnEnds = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('/hr-watch on a missing folder stays off', async ($, on) => {
  const { clock } = hrEngine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const r = await $.command.run({ command: 'hr-watch', args: 'C:/runs/nope' })
  expect(r.text).toContain('C:/runs/nope')
  const none = await $.command.run({ command: 'hr-watch', args: '' })
  expect(none.text).toBeDefined()
  await clock.advance(1500)
  expect(await header($)).not.toContain('HR')
})

test('the watch nudges once at the threshold, then waits for a new handoff file', async ($, on) => {
  const { clock, world } = hrEngine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const r = await $.command.run({ command: 'hr-watch', args: RUN })
  expect(r.text).toBe(`HR armed on ${RUN}`)
  // Arming again changes nothing.
  expect((await $.command.run({ command: 'hr-watch', args: RUN })).text).toBe(`HR armed on ${RUN}`)
  await clock.advance(1500)
  expect(await header($)).toContain('ctx used 10% · HR armed · 0 running')
  expect(world.submits).toEqual([])

  world.percent = 55
  await clock.advance(1500)
  expect(world.submits).toEqual([NUDGE_55])
  expect(await header($)).toContain('HR nudged')

  // A later poll over the threshold does not nudge again.
  world.percent = 56
  await clock.advance(3000)
  expect(world.submits.length).toBe(1)

  // The turn ends with no handoff written since the nudge: still waiting.
  world.handoffs = [{ name: 'old.md', kind: 'file', size: 1, mtimeMs: 1, isLink: false }]
  await $.turn.complete(mainTurnEnds)
  await clock.advance(1500)
  expect(await header($)).toContain('HR nudged')

  // An agent's turn ending is not the main loop's.
  world.handoffs.push({ name: 'agent.md', kind: 'file', size: 1, mtimeMs: clock.now(), isLink: false })
  await $.turn.complete({ ...mainTurnEnds, agentId: 'a1' })
  await clock.advance(1500)
  expect(await header($)).toContain('HR nudged')

  // The main turn ends with a new handoff: with /clear disabled the watch re-arms and does nothing else.
  await $.turn.complete(mainTurnEnds)
  await clock.advance(1500)
  expect(await header($)).toContain('HR armed')
  expect(world.commands.filter(c => c === 'clear')).toEqual([])
  expect(world.submits.length).toBe(1)
  expect(world.toasts.some(t => t.includes('HR: handoff seen; /clear disabled'))).toBe(true)

  // Re-armed while still over the threshold: no second nudge until the gauge
  // has dropped below it and climbed back.
  await clock.advance(3000)
  expect(world.submits.length).toBe(1)
  world.percent = 30
  await clock.advance(1500)
  expect(world.submits.length).toBe(1)
  world.percent = 60
  await clock.advance(1500)
  expect(world.submits.length).toBe(2)
  expect(world.submits[1]).toContain('[HR] Context used 60%.')

  // Off.
  expect((await $.command.run({ command: 'hr-off', args: '' })).text).toBe('HR off')
  await clock.advance(1500)
  expect(await header($)).not.toContain('HR')
})

test('with /clear enabled, a seen handoff clears and then hands the successor its start prompt', async () => {
  const nudged: Hr = { runFolder: RUN, phase: 'nudged', threshold: 50, nudgedAt: 5000 }
  const toasts: string[] = []
  const handoffs: Fs[] = [
    { name: 'older.md', kind: 'file', size: 1, mtimeMs: 6000, isLink: false },
    { name: 'newer.md', kind: 'file', size: 1, mtimeMs: 7000, isLink: false },
    { name: 'notes.txt', kind: 'file', size: 1, mtimeMs: 9000, isLink: false },
    { name: 'stale.md', kind: 'file', size: 1, mtimeMs: 4000, isLink: false },
  ]
  const seen = await seeHandoff(nudged, { list: async () => handoffs, toast: t => void toasts.push(t) }, true)
  expect(seen.phase).toBe('clearing')
  expect(seen.handoffPath).toBe(`${RUN}\\handoffs\\newer.md`)

  const calls: string[] = []
  const done = await finishClear(seen, {
    clear: async () => void calls.push('clear'),
    submit: async text => void calls.push(text),
    toast: t => void toasts.push(t),
  })
  expect(done.phase).toBe('armed')
  expect(done.waitsForDrop).toBe(true)
  expect(calls).toEqual([
    'clear',
    `[HR] Successor start. Read ${RUN}\\handoffs\\newer.md, ${RUN}\\orchestrator-state.md and ` +
      'C:\\Code-Repos\\Equipment Check\\docs\\Native-Agent-Workflow.md in full, re-arm the heartbeat cron, ' +
      `run /hr-watch ${RUN}, then continue from the handoff's next three actions.`,
  ])

  // A failed clear: toast it, re-arm, and send no resume.
  const failed: string[] = []
  const after = await finishClear(seen, {
    clear: async () => {
      throw new Error('no clear here')
    },
    submit: async text => void failed.push(text),
    toast: t => void toasts.push(t),
  })
  expect(after.phase).toBe('armed')
  expect(failed).toEqual([])
  expect(toasts.some(t => t.includes('no clear here'))).toBe(true)
})

test('a finished agent leaves the sidebar once the engine stops listing it', async ($, on) => {
  const clock = mock.clock(on)
  let list: { id: string; description: string; type: string; status: string }[] = [
    { id: 'a1', description: 'Survey the repo', type: 'Explore', status: 'running' },
  ]
  on('agent.list', () => ({ value: list }))
  on('command.register', () => ({ value: { command: 'agent-sidebar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const find = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const row = await ui.find({ type: 'Text', text: /Survey the repo/ })
    await ui.unmount()
    return row
  }

  await clock.advance(1500)
  expect(await find()).toBeDefined()

  // Finished but still listed: still shown, so it can still be opened.
  list = [{ ...list[0]!, status: 'completed' }]
  await clock.advance(1500)
  expect(await find()).toBeDefined()

  // Dropped from the list: gone from the sidebar.
  list = []
  await clock.advance(1500)
  expect(await find()).toBeUndefined()
})
