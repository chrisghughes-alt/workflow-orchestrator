# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

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
- `/workflow-start` is now a thin pointer to the `workflow-start` skill; the engine's behaviour is
  unchanged.
- Both commands carry YAML frontmatter (`description`, and `argument-hint` where the command takes
  arguments).

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
