# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- `/hr-watch` or `hr_watch` with no folder, while a watch is on, keeps that watch's folder and
  workflow document and changes only the mode, threshold or document given. It no longer re-points
  the watch at `<repo>/.runs/hr`. The watch also keeps its place in a hand-off, so switching modes
  after the nudge does not nudge again. A folder given still re-points the watch, and with no watch
  on a bare call still uses the defaults.

## [2.1.0] — 2026-11-03

### Added
- `/hr-watch` and `hr_watch` work with no arguments: the run folder defaults to `<repo>/.runs/hr`
  (its `handoffs` folder is created when missing), the mode to `nudge` and the threshold to 50%.
  `/hr-watch auto` arms the default folder in auto mode; `/hr-watch <folder> …` works as before.
- In nudge mode the plugin now sends the resume prompt after you run /clear, the same one auto mode
  sends, and re-arms the watch. `/hr-off` before the clear means no resume prompt.

### Changed
- The nudge names the hand-off's closing section: it ends with a section headed "Next three actions".
- The tool and command descriptions are rewritten to say what is watched (the main session's
  context gauge, read once a second) and what the run folder is for (where the hand-off lands).

## [2.0.1] — 2026-11-03

### Fixed
- A failed write of the sidebar's own records no longer fails the `tool.call`, `agent.spawn`,
  `turn.step` or `turn.complete` hook; each calls `next(e)` once and returns its result.
- `hr_watch` and `/hr-watch` refuse a `runFolder` or `workflowDoc` that is relative, over 1024
  characters or carries control characters, and a `workflowDoc` that is not on disk, before either
  path can reach a prompt.

### Changed
- README rebuilt around the two things the plugin does — agent management views and pipeline
  enforcement, usable alone or together — with an "HR for AI" section on context cycling and
  screenshots under `docs/images/`.
- The repository's `CLAUDE.md` describes the 2.0 layout (skill, command, hooks module, tests).

## [2.0.0] — 2026-11-03

### Added
- Fleet mechanics for running a workflow across named background agents, merged in from the separate
  agent-sidebar plugin so one install carries the engine and the mechanics.
- Agents side pane: one row per background agent with its model (glyph, text tag and colour), activity,
  elapsed time, tokens in and out, and context size, plus a `⚠ silent` marker once a running agent has
  been quiet for ten minutes. It opens by itself when the first background agent appears, never at
  session start; `/agent-sidebar` opens it on demand.
- Context gauge: the pane header shows `ctx used N%` for the main session.
- Tools the model can call: `mcp__workflow-orchestrator__agents` (the roster as JSON),
  `mcp__workflow-orchestrator__hr_watch({ runFolder, mode?, threshold?, workflowDoc? })` and
  `mcp__workflow-orchestrator__hr_off()`.
- Commands for the person: `/hr-watch <folder> [nudge|auto] [key=value …]` (keys `mode`, `threshold`,
  `doc`) and `/hr-off`.
- Context watch, off until armed: at the threshold (default 50% of context used) it asks the model for a
  handoff file and a run-state update. In `nudge` mode (the default) it then waits for the person to run
  `/clear` and the resume prompt; in `auto` mode it runs `/clear` itself and submits a resume prompt
  that names the handoff, the run-state file and the workflow document.
- `workflow-start` skill: the engine's instructions as a skill, so a background agent can run the
  engine through its Skill tool.
- `examples/Native-Agent-Fleet-WORKFLOW.md`: a generic fleet workflow with `<slot: …>` placeholders for
  what each repository supplies.
- README sections on the fleet mechanics, loading the plugin, and what a repository must provide.

### Changed
- **Breaking:** the plugin now registers hooks and tools. Its tool names start
  `mcp__workflow-orchestrator__`.
- The `/workflow-start` command file is gone. The engine is the `workflow-start` skill, invoked the
  same way, so it is listed once; the engine's behaviour is unchanged.
- The reply after arming the context watch always states the mode and threshold, for example
  `HR armed on <folder> (nudge, 50%)`, and appends `, doc <path>` when a workflow document was given.
- The `/workflow-capture` command and the `workflow-start` skill carry YAML frontmatter (`description`,
  and `argument-hint` on the skill, which takes arguments).

## [1.2.0] — 2026-06-08

### Added
- Workflow-fit suggestion on `/workflow-start`: when a run ends and the user forced deviations from the
  written pipeline, the engine surfaces an unintrusive, easily-dismissed suggestion to adjust the started
  workflow file — a plain one-liner for minor deviations, or a dismissible prompt (Update inline / use
  `/workflow-capture` / No thanks) when friction was repeated, a deviation was major, or frustration was
  voiced. Clean runs stay silent.

## [1.1.0] — 2026-06-08

### Added
- `/workflow-capture` command: reviews the current session and interactively authors a project
  `docs/WORKFLOW.md` (or a named `docs/<slug>-WORKFLOW.md`) for `/workflow-start` to execute.
- `--file <path>` selector on `/workflow-start`: run any named workflow file in a project; defaults to
  `docs/WORKFLOW.md` when omitted.

## [1.0.0] — 2026-06-07

### Added
- Initial release of the `workflow-orchestrator` plugin and its single-plugin marketplace.
- `/workflow-start` command: a project-agnostic pipeline orchestrator that drives a project's
  `docs/WORKFLOW.md` in order with binding gates and per-phase output checks.
- Authoring guide (`docs/authoring-workflows.md`).
- Examples: a generic minimal pipeline plus two real, sanitized pipelines (5-phase and 13-phase).
