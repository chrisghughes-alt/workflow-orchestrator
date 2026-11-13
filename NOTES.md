# Implementation notes

Notes for anyone changing `hooks/register.tsx` or `tests/sidebar.test.tsx`. They record how the
plugin engine's contract behaves where the tests depend on it, and the traps that were found the hard
way. `types/index.d.ts` is the contract itself; read it when these notes and the code disagree.

## Engine contract shapes the tests rely on

In a test, **a hook answering a `$` call returns `{ value }`**. A hook answering an event returns the
event's bare result.

- **`session.usage`**: the plugin calls `$.session.usage()` with no arguments. A test answers
  `on('session.usage', () => ({ value: { startedAt, context: { window, percent?, tokens? }, rateLimits: [] } }))`.
  `context.percent` is tokens over window, from 0 to 100: the share of the window **used**, not left.
- **`prompt.submit`** is an event. The plugin calls `$.prompt.submit({ text })`. A test hook reads
  `e.text` and returns `{ text }`.
- **`command.run`** is an event. The plugin calls `$.command.run({ command, args? })`. A test hook
  reads `e.command` and `e.args` and returns `{ text }`. The plugin's own command hooks also return
  `{ text }`.
- **`fs.list`**: `$.fs.list(path)` returns entries shaped
  `{ name, kind: 'file' | 'dir' | 'other', size, mtimeMs, isLink }`. A test answers
  `on('fs.list', (_, e) => ({ value: [...] }))` and reads the path from `e.path`.
- **`fs.exists`**: `$.fs.exists(path)` returns a boolean. A test answers `{ value: true }` or
  `{ value: false }`.
- **`tool.register`**: `$.tool.register({ name, description, inputSchema?, isDeferred? })` returns
  `{ tool: 'mcp__<plugin>__<name>' }`. A test hook receives the registered spec and returns
  `{ value: { tool } }`. It rejects until the session is bound, which happens at `session.start`.
- **`tool.call`**: the plugin serves a tool with
  `on('tool.call', { tool: 'mcp__workflow-orchestrator__agents' }, …)` and returns `{ result }`;
  `{ deny }` refuses the call. The roster tool returns `{ result: JSON.stringify(rows) }`. Keep the
  matcher a plain string, so `claude plugin validate` can read it.
- **`ui.toast`**: the plugin calls `$.ui.toast(text)`. A test hook receives `{ text }` and returns
  `{ value: undefined }`.
- **`turn.complete`** in a test: `$.turn.complete({ answer, durationMs, isAborted, turnId, reason, agentId? })`;
  the test hook returns `{ text }`.

## Traps

- **A rejected `tool.register` skips the whole `session.start` hook unless it is caught.** Without a
  `.catch`, a failed registration also stops the poll from starting, so the pane and the watch go dead.
  The engine reports it as "session.start hook was skipped: no implementation for tool.register". Every
  registration of a command or tool other than `/agent-sidebar` is caught, so a failure costs the model
  that one tool and nothing else.
- **`/clear` never runs from a `turn.complete` hook.** The contract says `$.command.run` rejects inside
  a hook the turn waits on. `turn.complete` only notices the new handoff file and moves the watch on.
  The clear and the resume prompt run from the poll, which is a timer, not a hook. A flag guards
  against two clears overlapping.
- **Neither a prompt nor `/clear` runs from a `command.run` hook.** The engine refuses
  `$.prompt.submit` there too ("it would wait on the turn this hook is holding"). So `/hr-handoff`
  only writes the watch's state (`handsOffNow`, or `clearing` when the hand-off is already written),
  and the poll sends the request and runs the clear.
- **The nudge is not awaited.** `$.prompt.submit` runs a turn of its own once the session is idle, so
  awaiting it inside the poll could hang the poll. The watch moves to its "nudged" state before the
  submit, which is what stops a second nudge. If the submit rejects, the watch shows a toast and turns
  off, so it cannot loop.
- **Re-arming over the threshold waits for a drop.** After a handoff the context is usually still over
  the threshold, so a re-arm would nudge again on the next poll. A re-armed watch therefore carries
  `waitsForDrop` and sends no nudge until one reading has been below the threshold.
- **A ready hand-off goes stale, and the plugin then rewrites it before clearing.** Stale means more
  than 5 minutes old (`HR_STALE_MS`, from the file's `mtimeMs`) and at least one main turn finished
  since it was seen. Both are needed: age alone would rewrite after a lunch break, and a turn alone
  would rewrite after one quick question. The turn in which the hand-off was written does not count,
  because `workedSince` is set only on a turn end while the phase is already `ready`. `/hr-handoff`
  and `/hr-watch auto` on a stale `ready` watch go back to `armed` with `handsOffNow` set, and the poll
  asks for a fresh file. The poll also sets `isStale` and toasts once, because the pane header has no
  clock of its own while no agent runs. Typing `/clear` is not intercepted.
- **Tests cannot set the plugin's stored state.** The `$` in a test is the engine's, not the plugin's.
  So the two steps worth testing alone, `seeHandoff` and `finishClear`, are exported and take their
  effects (list, toast, clear, submit) as arguments. The tests pass fakes and assert the call order.
- **Paths arrive in Windows form on Windows.** The engine hands file-system hooks backslash paths even
  when the plugin passed forward slashes. The plugin joins paths with whichever separator the run
  folder uses.
- **Quotes around the folder are kept.** `/hr-watch "/path/to/run"` fails the folder check because the
  quotes are part of the argument. Give the folder unquoted; spaces in it are fine.
- **The per-agent context window is not scoped to the agent.** The contract's `$.session.usage()` has
  no agent argument, and its window is documented as the session model's window. The plugin records the
  window inside each agent's own step, but every agent may still show the main session's window. Treat
  the per-row percent as a hint, and state agent recycle thresholds in tokens.

## What `/clear` resets

`/clear` resets every value the plugin stores: the watch's settings and the roster's counters. It does
not touch the engine's own agent list or the session's crons, so background agents and crons survive,
and the roster rows come back rebuilt from the engine's list, with an empty model and zeroed counters.
In `auto` mode the plugin runs the clear itself, so its write after the clear lands on an empty store:
the clear step uses the values it read **before** the clear, never values read from the store
afterwards. In `nudge` mode (since 2.1.0) the plugin keeps the pending resume in module memory when
the watch reaches `ready`, detects the person's `/clear` from a change in `$.session.usage().startedAt`
on the poll, then sends the same resume prompt auto mode sends and re-arms the watch with `waitsForDrop`
set. `/hr-off` or a successful arm drops the pending resume, so a disarmed watch never resumes.

## The threshold across a clear

A clear wipes the stored threshold along with everything else. In both modes the plugin writes the
watch back from the values it captured before the clear (its own clear in `auto`, the person's in
`nudge`), and the resume prompt repeats every `hr_watch` argument, so the successor re-arms
identically. Arming again with the same folder and mode and no
threshold keeps the stored threshold. The edge case: if the plugin's own write were lost before the
successor's call, a call that leaves out the threshold would arm at the default of 50%. Repeating the
threshold in the resume prompt is what closes that gap.

## One poll per process

The poll is a module-level timer, not one per session start. Each `session.start` cancels the previous
timer (a throw from a timer whose session is gone is caught) and starts one on the new session's `$`.
A `/clear` may raise a new session start, and a plain "already started" flag would then stop the new
session from ever polling if the old session's timer died with it. The clearing flag is module-level
too, so a session start raised in the middle of a clear cannot start a second clear; the clear already
in flight runs to the end, because cancelling stops only future ticks.
