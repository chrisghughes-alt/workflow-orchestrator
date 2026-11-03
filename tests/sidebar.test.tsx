import { expect, mock, test } from 'claude-code/testing'

import { finishClear, seeHandoff } from '../hooks/register'
import type { Hr } from '../types'

const PANE = {
  plugin: 'workflow-orchestrator',
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
    return { value: { tool: `mcp__workflow-orchestrator__${e.name}` } }
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const roster = registered.find(t => t.name === 'agents')
  expect(roster?.inputSchema).toEqual({ type: 'object', properties: {} })

  await $.agent.spawn({ prompt: 'look around', description: 'Survey the repo' })
  await clock.advance(1500)

  const r = await $.tool.call({ tool: 'mcp__workflow-orchestrator__agents' } as never)
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
  const r = await $.tool.call({ tool: 'mcp__workflow-orchestrator__agents' } as never)
  expect((JSON.parse(r.result as string) as { window: unknown }[])[0]!.window).toBe(200_000)
})

const RUN = 'C:\\runs\\r1'
const NUDGE_55 =
  `[HR] Context used 55%. Write the orchestrator handoff to ${RUN}\\handoffs\\orchestrator-handoff-YYYYMMDD-HHMM.md ` +
  `(use the clock for the stamp), update ${RUN}\\orchestrator-state.md, do whatever your workflow document requires ` +
  'at a handoff, then end your turn.'

// A workflow document whose path holds a space, as a Windows path often does.
const DOC = 'C:\\Docs\\My Workflow.md'
const RESUME_WITH_DOC = (handoff: string, threshold: number) =>
  `[HR] Successor start. Read ${RUN}\\handoffs\\${handoff}, ${RUN}\\orchestrator-state.md and ${DOC} in full, ` +
  'check CronList and re-create the heartbeat cron only if it is gone, call the ' +
  `mcp__workflow-orchestrator__hr_watch tool with runFolder ${RUN}, mode auto, threshold ${threshold} and ` +
  `workflowDoc ${DOC}, then continue from the handoff's next three actions.`

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
    tools: [] as { name: string; description: string; inputSchema: Record<string, unknown> }[],
    // What the engine does beyond recording a command the plugin runs.
    onCommand: undefined as ((command: string) => unknown) | undefined,
  }
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => usage(world.percent))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => {
    world.tools.push(e)
    return { value: { tool: `mcp__workflow-orchestrator__${e.name}` } }
  })
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
  on('command.run', async (_, e) => {
    world.commands.push(e.command)
    await world.onCommand?.(e.command)
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

test('/hr-watch with a mode word: nudge arms in nudge, auto arms in auto', async ($, on) => {
  const { clock } = hrEngine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect((await $.command.run({ command: 'hr-watch', args: `${RUN} nudge` })).text).toBe(`HR armed on ${RUN} (nudge, 50%)`)
  await clock.advance(1500)
  expect(await header($)).toContain('HR nudge ·')

  await $.command.run({ command: 'hr-off', args: '' })
  const auto = await $.command.run({ command: 'hr-watch', args: `${RUN} auto` })
  expect(auto.text).toBe(`HR armed on ${RUN} (auto, 50%)`)
  await clock.advance(1500)
  expect(await header($)).toContain('HR auto ·')
})

test('the model arms and disarms the watch through the hr_watch and hr_off tools', async ($, on) => {
  const { clock, world } = hrEngine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const byName = Object.fromEntries(world.tools.map(t => [t.name, t]))
  expect(Object.keys(byName).sort()).toEqual(['agents', 'hr_off', 'hr_watch'])
  expect(byName.hr_watch!.inputSchema).toEqual({
    type: 'object',
    properties: {
      runFolder: { type: 'string' },
      mode: { type: 'string', enum: ['nudge', 'auto'] },
      threshold: { type: 'integer', minimum: 1, maximum: 100 },
      workflowDoc: { type: 'string' },
    },
    required: ['runFolder'],
  })
  expect(byName.hr_off!.inputSchema).toEqual({ type: 'object', properties: {} })

  // A missing folder is refused with the command's own words.
  const refused = await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_watch', runFolder: 'C:/runs/nope' } as never)
  const typed = await $.command.run({ command: 'hr-watch', args: 'C:/runs/nope' })
  expect(refused.result).toBe(typed.text)
  await clock.advance(1500)
  expect(await header($)).not.toContain('HR')

  const armed = await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_watch', runFolder: RUN, mode: 'nudge' } as never)
  expect(armed.result).toBe(`HR armed on ${RUN} (nudge, 50%)`)
  await clock.advance(1500)
  expect(await header($)).toContain('ctx used 10% · HR nudge · 0 running')

  // Auto: re-arms in auto mode.
  const auto = await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_watch', runFolder: RUN, mode: 'auto' } as never)
  expect(auto.result).toBe(`HR armed on ${RUN} (auto, 50%)`)
  await clock.advance(1500)
  expect(await header($)).toContain('ctx used 10% · HR auto · 0 running')

  const off = await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_off' } as never)
  expect(off.result).toBe('HR off')
  await clock.advance(1500)
  expect(await header($)).not.toContain('HR')
})

const THRESHOLD_REFUSED = 'HR: threshold must be a whole number from 1 to 100'

test('hr_watch takes a threshold: at 5 a 6% reading nudges, and a bad one is refused', async ($, on) => {
  const { clock, world } = hrEngine(on)
  // Below the threshold to be set, so the first poll after arming stays quiet.
  world.percent = 2
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const armed = await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_watch', runFolder: RUN, threshold: 5 } as never)
  expect(armed.result).toBe(`HR armed on ${RUN} (nudge, 5%)`)
  await clock.advance(1500)
  expect(await header($)).toContain('ctx used 2% · HR nudge · 0 running')
  expect(world.submits).toEqual([])

  // Refused, and the watch keeps threshold 5.
  for (const threshold of [101, 0, 5.5, '7']) {
    const r = await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_watch', runFolder: RUN, threshold } as never)
    expect(r.result).toBe(THRESHOLD_REFUSED)
  }
  await clock.advance(1500)
  expect(await header($)).toContain('HR nudge ·')
  expect(world.submits).toEqual([])

  world.percent = 6
  await clock.advance(1500)
  expect(world.submits.length).toBe(1)
  expect(world.submits[0]).toContain('[HR] Context used 6%.')

  // The default threshold, given or not, is still stated in the reply.
  await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_off' } as never)
  const plain = await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_watch', runFolder: RUN, mode: 'auto', threshold: 50 } as never)
  expect(plain.result).toBe(`HR armed on ${RUN} (auto, 50%)`)
})

test('/hr-watch reads a threshold as the word after the mode', async ($, on) => {
  const { clock, world } = hrEngine(on)
  world.percent = 2
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect((await $.command.run({ command: 'hr-watch', args: `${RUN} auto 5` })).text).toBe(`HR armed on ${RUN} (auto, 5%)`)
  // Arming again the same way changes nothing and says so the same way.
  expect((await $.command.run({ command: 'hr-watch', args: `${RUN} auto 5` })).text).toBe(`HR armed on ${RUN} (auto, 5%)`)
  await clock.advance(1500)
  expect(await header($)).toContain('HR auto ·')

  for (const word of ['abc', '0', '101', '5.5']) {
    expect((await $.command.run({ command: 'hr-watch', args: `${RUN} nudge ${word}` })).text).toBe(THRESHOLD_REFUSED)
  }
  await clock.advance(1500)
  expect(await header($)).toContain('HR auto ·')

  world.percent = 6
  await clock.advance(1500)
  expect(world.submits.length).toBe(1)
  expect(world.submits[0]).toContain('[HR] Context used 6%.')

  // Off, then armed with no threshold: back to the default.
  await $.command.run({ command: 'hr-off', args: '' })
  expect((await $.command.run({ command: 'hr-watch', args: `${RUN} nudge 5` })).text).toBe(`HR armed on ${RUN} (nudge, 5%)`)
  await $.command.run({ command: 'hr-off', args: '' })
  expect((await $.command.run({ command: 'hr-watch', args: RUN })).text).toBe(`HR armed on ${RUN} (nudge, 50%)`)
})

test('hr_watch keeps a workflowDoc and the resume prompt hands it to the successor', async ($, on) => {
  const { clock, world } = hrEngine(on)
  world.percent = 2
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const armed = await $.tool.call({
    tool: 'mcp__workflow-orchestrator__hr_watch',
    runFolder: RUN,
    mode: 'auto',
    threshold: 5,
    workflowDoc: DOC,
  } as never)
  expect(armed.result).toBe(`HR armed on ${RUN} (auto, 5%, doc ${DOC})`)
  // A doc that is not a string is refused, and the watch keeps what it has.
  const bad = await $.tool.call({ tool: 'mcp__workflow-orchestrator__hr_watch', runFolder: RUN, workflowDoc: 7 } as never)
  expect(bad.result).toBe('HR: workflowDoc must be a path')

  world.percent = 6
  await clock.advance(1500)
  expect(world.submits.length).toBe(1)
  world.handoffs = [{ name: 'h.md', kind: 'file', size: 1, mtimeMs: clock.now(), isLink: false }]
  await $.turn.complete(mainTurnEnds)
  await clock.advance(3000)

  expect(world.commands.filter(c => c === 'clear')).toEqual(['clear'])
  expect(world.submits[1]).toBe(RESUME_WITH_DOC('h.md', 5))
})

test('/hr-watch reads key=value options, a doc path with spaces last, and refuses an unknown key', async ($, on) => {
  const { clock, world } = hrEngine(on)
  world.percent = 2
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const run = (args: string) => $.command.run({ command: 'hr-watch', args }).then(r => r.text)

  expect(await run(`${RUN} mode=auto threshold=5 doc=${DOC}`)).toBe(`HR armed on ${RUN} (auto, 5%, doc ${DOC})`)
  await $.command.run({ command: 'hr-off', args: '' })
  // The bare mode word and the bare threshold after it still work beside a doc.
  expect(await run(`${RUN} auto 5 doc=${DOC}`)).toBe(`HR armed on ${RUN} (auto, 5%, doc ${DOC})`)
  await $.command.run({ command: 'hr-off', args: '' })
  // A doc with no space may come before the other options.
  expect(await run(`${RUN} doc=C:\\Docs\\flow.md mode=nudge threshold=7`)).toBe(
    `HR armed on ${RUN} (nudge, 7%, doc C:\\Docs\\flow.md)`,
  )
  expect(await run(`${RUN} nudge threshold=abc`)).toBe(THRESHOLD_REFUSED)
  expect(await run(`${RUN} mode=sideways`)).toBe('HR: unknown mode sideways; use nudge or auto. The watch is unchanged.')

  // An unknown key is refused before anything else, and the watch is unchanged.
  expect(await run(`${RUN} auto colour=red`)).toBe('HR: unknown option colour')
  await clock.advance(1500)
  expect(await header($)).toContain('HR nudge ·')

  // The doc travels to the resume prompt.
  await $.command.run({ command: 'hr-off', args: '' })
  expect(await run(`${RUN} auto 5 doc=${DOC}`)).toBe(`HR armed on ${RUN} (auto, 5%, doc ${DOC})`)
  world.percent = 6
  await clock.advance(1500)
  world.handoffs = [{ name: 'h.md', kind: 'file', size: 1, mtimeMs: clock.now(), isLink: false }]
  await $.turn.complete(mainTurnEnds)
  await clock.advance(3000)
  expect(world.submits[1]).toBe(RESUME_WITH_DOC('h.md', 5))
})

test('the watch nudges once at the threshold, then waits for a new handoff file', async ($, on) => {
  const { clock, world } = hrEngine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const r = await $.command.run({ command: 'hr-watch', args: RUN })
  expect(r.text).toBe(`HR armed on ${RUN} (nudge, 50%)`)
  // Arming again changes nothing.
  expect((await $.command.run({ command: 'hr-watch', args: RUN })).text).toBe(`HR armed on ${RUN} (nudge, 50%)`)
  await clock.advance(1500)
  // No mode word: nudge mode, shown as the mode while armed.
  expect(await header($)).toContain('ctx used 10% · HR nudge · 0 running')
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

  // Nudge mode: the main turn ends with a new handoff, the watch is ready and does nothing else.
  await $.turn.complete(mainTurnEnds)
  await clock.advance(1500)
  expect(await header($)).toContain('HR ready')
  expect(world.commands.filter(c => c === 'clear')).toEqual([])
  expect(world.submits.length).toBe(1)
  expect(world.toasts.some(t => t.includes('HR: handoff written; run /clear when ready'))).toBe(true)

  // Ready: nothing fires, whatever the gauge does.
  world.percent = 30
  await clock.advance(1500)
  world.percent = 60
  await clock.advance(1500)
  await $.turn.complete(mainTurnEnds)
  await clock.advance(1500)
  expect(world.submits.length).toBe(1)
  expect(await header($)).toContain('HR ready')

  // /hr-watch again re-arms. Still over the threshold, so no nudge until the
  // gauge has dropped below it and climbed back.
  expect((await $.command.run({ command: 'hr-watch', args: RUN })).text).toBe(`HR armed on ${RUN} (nudge, 50%)`)
  await clock.advance(3000)
  expect(await header($)).toContain('HR nudge ·')
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

test('in auto mode with /clear enabled, a seen handoff clears and then hands the successor its start prompt', async () => {
  const nudged: Hr = { runFolder: RUN, phase: 'nudged', mode: 'auto', threshold: 50, nudgedAt: 5000 }
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

  // Nudge mode never clears, even with /clear enabled; auto with it disabled neither.
  const io = { list: async () => handoffs, toast: (t: string) => void toasts.push(t) }
  expect((await seeHandoff({ ...nudged, mode: 'nudge' }, io, true)).phase).toBe('ready')
  expect((await seeHandoff(nudged, io, false)).phase).toBe('ready')

  const calls: string[] = []
  const done = await finishClear(seen, {
    clear: async () => void calls.push('clear'),
    submit: async text => void calls.push(text),
    toast: t => void toasts.push(t),
  })
  expect(done.phase).toBe('armed')
  expect(done.waitsForDrop).toBe(true)
  // No workflow document given: the resume points at the run-state file instead.
  expect(calls).toEqual([
    'clear',
    `[HR] Successor start. Read ${RUN}\\handoffs\\newer.md, ${RUN}\\orchestrator-state.md and ` +
      "the run-state file's 'how to resume' section in full, check CronList and re-create the " +
      'heartbeat cron only if it is gone, call the mcp__workflow-orchestrator__hr_watch tool with runFolder ' +
      `${RUN}, mode auto, threshold 50, then continue from the handoff's next three actions.`,
  ])

  // A workflow document given: the resume names it and hands it back to the tool.
  const withDoc: string[] = []
  await finishClear(
    { ...seen, threshold: 5, workflowDoc: DOC },
    { clear: async () => undefined, submit: async text => void withDoc.push(text), toast: t => void toasts.push(t) },
  )
  expect(withDoc).toEqual([RESUME_WITH_DOC('newer.md', 5)])

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

// Stands in for the engine's value store, so a test can do what a live /clear
// does to the plugin: forget every value it stored.
function stateStore(on: Parameters<Parameters<typeof test>[1]>[1]) {
  const values = new Map<string, unknown>()
  const versions = new Map<string, number>()
  const keyOf = (e: { plugin: string; key: string; id?: string }) => `${e.plugin}/${e.key}/${e.id ?? ''}`
  on('state.get', (_, e) => {
    const k = keyOf(e as never)
    return { value: { value: values.get(k), version: versions.get(k) ?? 0 } }
  })
  on('state.set', (_, e) => {
    const w = e as unknown as { plugin: string; key: string; id?: string; value: unknown; ifVersion?: number }
    const k = keyOf(w)
    const at = versions.get(k) ?? 0
    if (w.ifVersion !== undefined && w.ifVersion !== at) return { value: { isSet: false, version: at } }
    values.set(k, w.value)
    versions.set(k, at + 1)
    return { value: { isSet: true, version: at + 1 } }
  })
  return {
    forget(plugin: string) {
      for (const k of [...values.keys()]) {
        if (!k.startsWith(`${plugin}/`)) continue
        values.delete(k)
        versions.set(k, (versions.get(k) ?? 0) + 1)
      }
    },
  }
}

test('in auto mode the watch clears, resumes and re-arms, though the clear wipes what the plugin stored', async ($, on) => {
  const store = stateStore(on)
  const { clock, world } = hrEngine(on)
  // A live /clear leaves the plugin's stored values at their defaults.
  world.onCommand = command => {
    if (command === 'clear') store.forget('workflow-orchestrator')
  }
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect((await $.command.run({ command: 'hr-watch', args: `${RUN} auto` })).text).toBe(`HR armed on ${RUN} (auto, 50%)`)
  await clock.advance(1500)
  expect(await header($)).toContain('HR auto ·')

  world.percent = 55
  await clock.advance(1500)
  expect(world.submits).toEqual([NUDGE_55])

  world.handoffs = [{ name: 'orchestrator-handoff-1.md', kind: 'file', size: 1, mtimeMs: clock.now(), isLink: false }]
  await $.turn.complete(mainTurnEnds)
  await clock.advance(3000)

  expect(world.commands.filter(c => c === 'clear')).toEqual(['clear'])
  expect(world.submits.length).toBe(2)
  expect(world.submits[1]).toContain('[HR] Successor start.')
  expect(world.submits[1]).toContain(`${RUN}\\handoffs\\orchestrator-handoff-1.md`)
  expect(world.submits[1]).toContain(`runFolder ${RUN}, mode auto, threshold 50, then`)
  // Re-armed in auto mode on the same run, from what was captured before the clear.
  expect(await header($)).toContain('HR auto ·')

  // Still over the threshold: no new nudge until the gauge has dropped and climbed back.
  world.percent = 56
  await clock.advance(3000)
  expect(world.submits.length).toBe(2)
  world.percent = 30
  await clock.advance(1500)
  world.percent = 60
  await clock.advance(1500)
  expect(world.submits.length).toBe(3)
  expect(world.submits[2]).toContain('[HR] Context used 60%.')
})

test('/hr-off during a clear keeps the watch off afterwards', async ($, on) => {
  const store = stateStore(on)
  const { clock, world } = hrEngine(on)
  world.onCommand = async command => {
    if (command !== 'clear') return
    store.forget('workflow-orchestrator')
    // The owner turns the watch off while the clear is in flight.
    await $.command.run({ command: 'hr-off', args: '' })
  }
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await $.command.run({ command: 'hr-watch', args: `${RUN} auto` })
  world.percent = 55
  await clock.advance(1500)
  world.handoffs = [{ name: 'h.md', kind: 'file', size: 1, mtimeMs: clock.now(), isLink: false }]
  await $.turn.complete(mainTurnEnds)
  await clock.advance(3000)

  expect(world.commands.filter(c => c === 'clear')).toEqual(['clear'])
  expect(await header($)).not.toContain('HR')
})

test('a second session start, as /clear may raise, leaves one poll running, not two', async ($, on) => {
  const clock = mock.clock(on)
  let lists = 0
  on('agent.list', () => {
    lists += 1
    return { value: [] }
  })
  on('session.usage', () => usage(10))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__workflow-orchestrator__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(2000)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  lists = 0
  await clock.advance(5000)
  expect(lists).toBe(5)
})

test('the Agents pane opens once, unfocused, when the first background agent appears', async ($, on) => {
  const clock = mock.clock(on)
  let list: { id: string; description: string; type: string; status: string }[] = []
  on('agent.list', () => ({ value: list }))
  on('session.usage', () => usage(10))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__workflow-orchestrator__${e.name}` } }))
  const opens: { id: string; title?: string; focus?: boolean }[] = []
  on('ui.open', (_, e) => {
    opens.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // No agent yet: the session start and the polls leave the pane closed.
  expect(opens).toEqual([])
  await clock.advance(3000)
  expect(opens).toEqual([])

  // The first agent shows up: one open, without focus.
  list = [{ id: 'a1', description: 'Survey the repo', type: 'Explore', status: 'running' }]
  await clock.advance(1500)
  expect(opens.length).toBe(1)
  expect(opens[0]!.id).toBe('agent-sidebar')
  expect(opens[0]!.focus).toBeUndefined()

  // Later polls, a second agent, and a new session start open nothing more.
  list = [...list, { id: 'a2', description: 'Write the tests', type: 'general-purpose', status: 'running' }]
  await clock.advance(3000)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(3000)
  expect(opens.length).toBe(1)

  // The command still opens it, with focus.
  const r = await $.command.run({ command: 'agent-sidebar' })
  expect(r.text).toBe('Agents sidebar opened.')
  expect(opens.length).toBe(2)
  expect(opens[1]!.focus).toBe(true)
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
