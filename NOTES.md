# agent-sidebar 0.2.0 — implementer report (2026-11-03)

Repo: C:\Users\chrish\.claude\mods\agent-sidebar (branch main, working tree clean)

## Commits
- 78af79c 3a: header gauge shows the share of the main context window used
- f2aa5b5 3b: silent marker on a running agent quiet for over ten minutes
- 789ea05 3c: agents roster tool hands the model the sidebar rows as JSON
- 9b03e20 3d: opt-in HR context watch with /hr-watch and /hr-off, clear gated off
- c6e9952 3e: per-agent context percent from the window read in the agent's own step (unverified per agent)
- 350a1cc 3f: version 0.2.0, description names the context watch and the roster tool
- 747a613 3d: HR watch takes a mode, nudge or auto   <- carries the mode design change
- b1998c2 3g: hr_watch and hr_off as tools the model can call
- fa8c569 3h: resume prompt arms the successor through the hr_watch tool
- b32e7ae 3i: one poll per process across a clear
- cccdacf 3j: version 0.2.1; description names hr_watch, hr_off and agents

## Fix-ups 3h-3j (final run: "Ran 14 tests across 1 file. [1.78s]", 14 pass 0 fail; "✔ Validation passed with warnings", baseline warnings only; tree clean)
- 3h: the resume text is exactly the given wording; {mode} is the mode the watch was armed in (`modeOf(state)`, so auto in practice, since only auto mode clears). The test asserts the full text with `mode auto`.
- 3i, DEVIATION from "module-level flag": the contract's `$.clock.every` returns a Timer with `cancel()` and runs "until cancel()"; it does not say a session's end stops it. A plain flag fails silently in one case: if /clear leaves the old session's timer stopped or its `$` unusable, the flag stops the new session from ever starting a poll, so the sidebar and the watch go dead. I used a module-level `poll: Timer` instead. Each session.start cancels the previous timer (a throw is caught) and starts one on the new session's `$`, so there is exactly one poll per process either way. `isClearing` is module-level, so a session start raised mid-clear cannot start a second clear; the clear chain already in flight runs to the end, because cancel stops only future ticks. Commands and tools are still registered on every session.start. Test: two session starts, then 5 s of clock gives 5 agent.list reads (10 before the fix). If you want the literal flag instead, it is a two-line change; say so.
- While I edited 3i, register.tsx was saved for a few seconds with `isClearing` removed from the start hook before its module-level declaration was added. Live sessions may have hot-reloaded that in-between version. The final version compiles, validates and passes.
- 3j: version 0.2.1; the description names agents, hr_watch, hr_off and both modes.

## Update after the two follow-up requests (latest run: 13 pass, 0 fail, "Ran 13 tests across 1 file. [1.93s]"; "✔ Validation passed with warnings", same warnings as baseline)
Mode (747a613):
- `/hr-watch <folder> [nudge|auto]`; only a LAST word of nudge or auto is read as the mode, so a folder with spaces works unquoted. Default nudge. Any other mode word, e.g. given through the tool, is refused with "HR: unknown mode X; use nudge or auto. The watch is unchanged."
- `hr` atom has `mode?: 'nudge' | 'auto'`, optional so that a value stored before modes existed reads as nudge. Phase union adds `ready`.
- Nudge mode: a handoff seen -> phase `ready`, `handoffPath` stored, toast "HR: handoff written; run /clear when ready", no command.run. In `ready` nothing fires.
- `/hr-watch` from `ready` re-arms with `waitsForDrop` set, so it does not nudge again until the gauge drops below the threshold. Re-arming on the same folder and mode while armed, nudged or clearing changes nothing.
- Auto with CLEAR_ENABLED false: replies exactly "auto mode is not enabled in this build yet; armed in nudge mode" and arms in nudge. With the constant true: "HR armed on <path> in auto mode".
- Header: `HR nudge` / `HR auto` while armed, otherwise `HR <phase>` (nudged, ready, clearing).
- `/hr-off` resets to `{ runFolder: '', phase: 'off', mode: 'nudge', threshold }`.
- `seeHandoff` goes to `clearing` only when mode is auto AND clearEnabled; every other case goes to `ready`. The old "handoff seen; /clear disabled" re-arm path is gone.
Tools (b1998c2):
- `hr_watch` and `hr_off` are registered beside `agents` with the exact schemas given. Their hooks on `mcp__agent-sidebar__hr_watch` / `__hr_off` call the same `armWatch($, runFolder, mode)` / `disarmWatch($)` the commands call, and return the reply as `{ result: <text> }`. Validate reports `$.fs.exists (via armWatch)`.
- Test: the tool arms (header `HR nudge`), refuses a missing folder with the command's own text (compared directly), returns the auto-not-enabled text, and `hr_off` disarms.
Notes:
- plugin.json is still 0.2.0, and its description does not mention the hr_watch/hr_off tools. The brief's version bump was in 3f; I did not bump again.
- The resume prompt still says "run /hr-watch {runFolder}" with no mode word, as the brief fixed it. A successor following it literally would arm in nudge mode, and the model cannot run a slash command at all; it would need to call the hr_watch tool with mode auto. Worth changing the resume text when auto is enabled.
- The "Where the contract contradicted the brief" item 3 and the 3d description above that mention "re-arm after handoff with clear disabled" are superseded: in nudge mode the watch now stops at `ready`.

## Last run (after 350a1cc's edit, before committing it)
claude plugin test:
```
 11 pass
 0 fail
Ran 11 tests across 1 file. [1.82s]
```
claude plugin validate:
```
✔ Validation passed with warnings
```
The warnings are the same set as the baseline before any change: no author; README, LICENSE and icon missing (plugin-directory submission checks only).

## Contract findings (hook names and result shapes used)
Test hooks for `$` operations answer `{ value: ... }`; test hooks for events answer the event's bare result.
- session.usage: `on('session.usage', () => ({ value: { startedAt, context: { window, percent?, tokens? }, rateLimits: [] } }))`. Plain call `$.session.usage()` (no args). `context.percent` = tokens over window, 0-100 = share USED.
- prompt.submit: event. `$.prompt.submit({ text })`; test hook gets `e.text`, returns `{ text }`.
- command.run: event. `$.command.run({ command, args? })` (CommandRunArgs); test hook gets `e.command`, `e.args`, returns `{ text }`. Plugin's own command hooks return `{ text }`.
- fs.list: `$.fs.list(path)` -> FsEntry[] `{ name, kind: 'file'|'dir'|'other', size, mtimeMs, isLink }`; test hook `on('fs.list', (_, e) => ({ value: [...] }))`, `e.path`.
- fs.exists: `$.fs.exists(path)` -> boolean; test hook returns `{ value: boolean }`.
- tool.register: `$.tool.register({ name, description, inputSchema?, isDeferred? })` (ToolSpec) -> `{ tool: 'mcp__<plugin>__<name>' }`; test hook gets RegisteredToolSpec, returns `{ value: { tool } }`. "Rejects until the session binds, at session.start."
- tool.call: serve with `on('tool.call', { tool: 'mcp__agent-sidebar__agents' }, ...)` returning `{ result }` (ToolCallResult; `{ deny }` refuses). The tool returns `{ result: JSON.stringify(rows) }`.
- ui.toast: plugin calls `$.ui.toast(text)`; the test hook receives `e` as `{ text }` and returns `{ value: undefined }`.
- turn.complete (test call): `$.turn.complete({ answer, durationMs, isAborted, turnId, reason, agentId? })`; test hook returns `{ text }`.

## Where the contract contradicted the brief, and what I did
1. `$.command.run` "Rejects an unknown name, inside a hook the turn waits on, past a Stop" (index.d.ts ~3200). A turn.complete hook plausibly counts, so /clear is NOT run from turn.complete. turn.complete (main loop, phase nudged) only lists the handoffs folder and moves to `armed` (clear disabled) or `clearing` (clear enabled). The 1-second poll, a timer rather than a hook, runs clear then resume when phase is `clearing`, guarded against overlap by an in-closure flag.
2. The engine hands fs hooks Windows-form paths (`C:/runs/r1` reached the hook as `C:\runs\r1`). Paths are joined with whichever separator the run folder uses, so a handoff path is all backslashes on Windows.
3. Re-arming after a handoff while the gauge is still over the threshold would nudge again on the very next poll. With CLEAR_ENABLED false, that means an endless string of handoff requests. I added an optional `waitsForDrop?: boolean` to the `hr` atom. It is set whenever the watch re-arms after a handoff (clear disabled, clear done, or clear failed), and no new nudge is sent until a gauge reading has been below the threshold. A test covers the sequence: stays quiet at 56%, quiet at 30% (which clears the flag), nudges again at 60%. This is beyond the brief.
4. Test 6 (clearing path): the test `$` is the engine's own, not the plugin's, so tests cannot set the plugin's atoms. I exported two functions with injected effects, `seeHandoff(state, { list, toast }, clearEnabled)` and `finishClear(state, { clear, submit, toast })`. Live wiring: `clear = () => $.command.run({ command: 'clear' })`, `submit = text => $.prompt.submit({ text })`. The test asserts call order `['clear', <resume text>]` and the end phase `armed`. A second case checks that a failed clear toasts, re-arms, and sends no resume. Importing `../hooks/register` from the test works, and validate accepts the extra exports.
5. The nudge `prompt.submit` is fire-and-forget (not awaited). The contract says it runs "a turn of its own, once the session is idle", so awaiting it in the poll could hang the poll. The phase moves to `nudged` BEFORE the submit, which is what guards against a second nudge. If the submit rejects, the watch toasts and goes `off` (not `armed`), so it cannot loop.
6. Registration of the roster tool and the two HR commands is non-fatal (`.catch`). Without that, a rejected `tool.register` skipped the whole session.start hook, poll included. Tests showed this: "agent-sidebar's session.start hook was skipped: no implementation for tool.register".
7. The roster row has `endedAt: null` while running (JSON drops undefined keys), and gained `window` (null before the agent's first step), beyond the brief's field list. That lets the orchestrator compare Sonnet and Opus windows through the tool. `name` is the pane's label: the engine name, else description, else type, else id.
8. /hr-watch with no argument or a missing path replies with an error and leaves the state unchanged. /hr-watch on the folder already being watched (any phase but off) changes nothing, which makes it idempotent and keeps `waitsForDrop`.

## 3e findings
- The contract gives no per-agent scoping for `$.session.usage()`. `SessionUsageArgs` has only `breakdown` and `columns`, with no `agentId`. `SessionContextUsage.window` is documented as "The context window of the session's model". The one hit for "a subagent's own" (~2865) is about `$.session.cwd()` (keep the value read inside the hook). No hits for "agent-scoped".
- Implemented anyway: in an agent's turn.step, after the response, `$.session.usage().context.window` is stored on the row as `window` (AgentRow shape tag bumped to `agents-2`). The stats line shows `ctx 12k (6%)` when a window is known, `ctx 12k` otherwise. The main loop's window is in the `gauge` atom (it is not exposed in the tool). Expect every agent to show the main session's window unless the engine scopes the call. I have NOT verified it per agent. The live check is to call mcp__agent-sidebar__agents with a Sonnet and an Opus agent running and compare their `window` values.

## Not done / open
- The /clear survival path is untested live (CLEAR_ENABLED = false, by design).
- The poll's `clearing` branch is exercised by no test. Test 6 proves `finishClear`'s logic with injected fakes, but nothing drives phase `clearing` through the engine. The live wiring `clear: () => $.command.run({ command: 'clear' })` and the `isClearing` overlap guard are untested. The orchestrator's live survival test is the only check.
- History note: the change that makes the roster hook's matcher a plain string (`'mcp__agent-sidebar__agents'`, so validate can read it) landed in the 3d commit, not 3c.
- Paths: `runFolder` is stored as typed. `/hr-watch C:/runs/r1` works for fs checks (the engine normalizes), but the nudge text then reads `C:/runs/r1\handoffs\...` (mixed separators, which Windows tolerates). An argument wrapped in quotes, e.g. `/hr-watch "C:\Code-Repos\Equipment Check\runs\r1"`, fails `fs.exists` because the quotes are kept. Pass the path unquoted; spaces are fine because the whole trimmed argument is the path.
- Unknown whether `/hr-watch`, as the successor prompt asks, can be run by the model itself. Slash commands are typed by the person, and nothing here gives the model a way to run one. The orchestrator should check this before enabling clear.
- Unknown whether /clear re-fires session.start. If it does, a second 1-second poll would start in the same process, and the in-closure guard against overlapping clears would not be shared between the two polls.
- Hot reload: this folder reloaded into live sessions on each save. A running session already shows the `agent-sidebar` MCP tool server.

## Addendum, 2026-11-03 afternoon (v0.3.0)

- `CLEAR_ENABLED` is now `true`: the `/clear` survival test and the full auto loop both passed live (details in `docs/Native-Agent-Workflow.md` of the Equipment Check repo, evidence rows 9 and 13). The old refusal reply "auto mode is not enabled in this build yet" is gone; `auto` arms as `HR armed on <folder> (auto)`.
- `/clear` resets every plugin atom (HR state and roster counters) but not the engine's agent roster or session crons. The poll's write after the clear therefore has to land on a reset store (fixed in cba95a9); `finishClear` uses the values captured before the clear.
- `hr_watch` / `/hr-watch` take an optional `threshold` (1 to 100, default 50) after the mode word; out-of-range values are refused and the state is left alone. Use a low value to exercise the loop in a scratch session.
- Known coupling: `WORKFLOW_DOC` hardcodes the Equipment Check repo path, while the mod loads in every repo. Derive it from the run folder or take it as an `hr_watch` argument.
