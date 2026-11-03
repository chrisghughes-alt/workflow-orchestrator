import { expect, mock, test } from 'claude-code/testing'

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
    ['activity', 'context', 'endedAt', 'id', 'lastAt', 'model', 'name', 'startedAt', 'status', 'steps', 'tokensIn', 'tokensOut'].sort(),
  )
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
