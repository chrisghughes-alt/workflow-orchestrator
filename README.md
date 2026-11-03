# workflow-orchestrator

A generic, **project-agnostic pipeline orchestrator** for Claude Code, packaged as an installable
plugin. It adds the `workflow-start` skill and the `/workflow-capture` command, and, since 2.0, the
[fleet mechanics](#fleet-mechanics-20) for running a workflow across named background agents:

- **`/workflow-start`** (the `workflow-start` skill, which is the only entry for the engine) reads your project's `docs/WORKFLOW.md` and drives its phases in order under a
  fixed set of binding rules: phases run in sequence, every declared output is produced before
  advancing, consent gates block on explicit approval, and the engine keeps control even when an invoked
  sub-skill tries to decide what happens next.
  When a run ends, if you forced deviations from the pipeline, it offers — unintrusively — to fold them back into your `docs/WORKFLOW.md`.
- **`/workflow-capture`** builds that `docs/WORKFLOW.md` *for* you — it reviews the Claude session you
  just finished and walks you through authoring a runnable pipeline from it, phase by phase.

The engine knows nothing about any specific project. Your `docs/WORKFLOW.md` defines the phases, the
skills they invoke, the artifacts they output, and the gates they enforce. The plugin supplies only the
*discipline* that runs that pipeline faithfully.

**No workflow yet?** Two ways to get one without writing from a blank page: run `/workflow-capture` to
distill one from a session you just did, or run `/workflow-start` in a project with no `docs/WORKFLOW.md`
and let the engine scaffold a starter for you to customize. (Neither ever invents a pipeline silently or
borrows another project's phases.)

## Why "orchestrator"

The point is composition. A phase can invoke any command, skill, or agent you already use — and you
chain them into one master workflow. The orchestrator's job is to hold that chain together: it runs the
phases in your order, makes each one produce its output and clear its gate, and keeps control at every
handoff so an invoked command, skill, or agent does *its* job and hands back — rather than deciding what
happens next and running off with your pipeline. That hand-back discipline is the orchestration. The
example workflows show it best: independent skills and agents composed into a single, governed pipeline.

## Install

```text
/plugin marketplace add chrisghughes-alt/workflow-orchestrator
/plugin install workflow-orchestrator
```

On Claude Code 2.1.275 or later, one line does both:

```text
/plugin install workflow-orchestrator --marketplace chrisghughes-alt/workflow-orchestrator
```

## Quickstart

1. Add a pipeline definition to your project at `docs/WORKFLOW.md`. Three easy starts:
   - **Capture a session:** just finished work you'd want to repeat? Run `/workflow-capture` and it
     interactively turns the session into a `docs/WORKFLOW.md`.
   - **Let the engine bootstrap it:** just run `/workflow-start`. With no `docs/WORKFLOW.md` present, it
     offers to scaffold a starter you then customize.
   - **Copy an example:** start from [`examples/minimal-WORKFLOW.md`](examples/minimal-WORKFLOW.md) and
     edit it.
2. Run the pipeline:
   ```text
   /workflow-start add a CSV export to the reports page
   ```
3. The engine loads `docs/WORKFLOW.md`, parses each phase's **Orchestrator directives**, and drives the
   loop: `Condition → Pre → Invoke → Suppress → Post → Output → Gate → Route`.

## Writing your pipeline

See [`docs/authoring-workflows.md`](docs/authoring-workflows.md) for the directive-field reference, gate
semantics, and routing. See [`examples/`](examples/) for a minimal starter, two real (sanitized)
pipelines — a compact 5-phase one and an elaborate 13-phase one — and a fleet template for named
background agents.

## Creating a workflow with `/workflow-capture`

You rarely have to write `docs/WORKFLOW.md` from scratch — the best pipelines are distilled from work
your project already does, and `/workflow-capture` does exactly that. Run it at the end of a session and
it:

- **Reviews the session you just ran** and proposes a candidate pipeline — the distinct phases, what
  each invoked, what it output, and where approvals happened.
- **Pulls in your project context (optional)** — your `CLAUDE.md`, `docs/`, and Claude memories — so the
  pipeline reflects your real conventions and gates, not a generic template.
- **Walks you through each phase interactively**, letting you confirm or edit its directives
  (`Invoke` / `Output` / `Gate` / `Route`) one at a time before anything is written.
- **Writes a runnable `docs/WORKFLOW.md`** in this orchestrator's exact format, ready for
  `/workflow-start` to replay with binding rules and consent gates enforced.

It captures even ad-hoc runs you drove by hand without `/workflow-start` — so a good run becomes a
repeatable one.

### Multiple workflows per project

A project can hold more than one pipeline. The default file is `docs/WORKFLOW.md`; name extras
`docs/<slug>-WORKFLOW.md` (e.g. `docs/release-WORKFLOW.md`) and run a specific one with a leading
`--file` argument:

```text
/workflow-start --file docs/release-WORKFLOW.md cut the 2.0 release
```

## Evolving a workflow as you use it

A workflow drifts — the way you actually work moves ahead of what `docs/WORKFLOW.md` says.
`/workflow-start` watches for that. If you force deviations during a run — skip a phase, reorder, override a
gate — it ends with an **unintrusive, easily-dismissed** suggestion to fold those changes back in: a
one-line nudge for small drift, or a quick prompt (update inline, hand off to `/workflow-capture`, or just
dismiss) when the friction was bigger. Clean runs say nothing. So the pipeline you run tomorrow reflects how
you worked today.

## Fleet mechanics (2.0)

Version 2.0 adds what you need to run a workflow across named background agents, with the main session
acting as the orchestrator. Everything below is quiet until it is used: no pane at session start, no
watch until it is armed.

### The Agents pane

The pane lists every background agent of the session. It opens by itself the first time a background
agent appears, never at session start, and `/agent-sidebar` opens it on demand. Each row shows:

- the agent's model, as a glyph, a text tag and a colour, so the model never depends on colour alone;
- what the agent is doing now, and how long it has run;
- tokens in and out, and its context size;
- `⚠ silent` followed by the quiet time, once a running agent has gone ten minutes with no model
  request or tool call.

Click a row to view that agent. The header shows `ctx used N%`, the share of the main session's context
window in use, and the state of the context watch when it is armed.

### Tools the model can call

| Tool | What it does |
|---|---|
| `mcp__workflow-orchestrator__agents` | Returns the roster as JSON: one row per agent with name, model, status, activity, tokens in and out, context size and timestamps. |
| `mcp__workflow-orchestrator__hr_watch({ runFolder, mode?, threshold?, workflowDoc? })` | Arms the context watch for this session. `runFolder` is the absolute run folder; `mode` is `nudge` (default) or `auto`; `threshold` is the percent of context used, 1 to 100, default 50; `workflowDoc` is the absolute path of the workflow document a successor should read; without it, the resume prompt points the successor at the "how to resume" section of the run-state file. |
| `mcp__workflow-orchestrator__hr_off()` | Turns the context watch off. |

### Commands for the person

- `/agent-sidebar` opens the Agents pane.
- `/hr-watch <folder> [nudge|auto] [key=value …]` arms the watch. The keys are `mode`, `threshold` and
  `doc`. Give the folder unquoted; spaces in it are fine. Example:

  ```text
  /hr-watch /path/to/repo/.runs/my-run mode=auto doc=/path/to/repo/docs/my-fleet-WORKFLOW.md
  ```

- `/hr-off` turns the watch off.

### The context watch

The watch (shown as "HR" in the pane header) exists so a long-running orchestrator hands over to a
fresh context before automatic compaction blurs what it knows. It watches only the session that armed
it, and it does nothing until armed.

When the main session reaches the threshold, the watch submits one nudge. The nudge asks the model to
write a handoff file to `<folder>/handoffs/orchestrator-handoff-YYYYMMDD-HHMM.md`, update
`<folder>/orchestrator-state.md`, do whatever the workflow document requires at a handoff, and end the
turn. When a new handoff file appears after that turn ends, the mode decides what happens:

- **`nudge` (the default).** The header shows `HR ready`. The person runs `/clear` and then the resume
  prompt by hand, when they are ready. Use this when you are at the keyboard and want to read the
  handoff first.
- **`auto`.** The plugin runs `/clear` itself and submits a resume prompt. The prompt names the handoff
  file, the run-state file and the workflow document. It tells the successor to re-create the heartbeat
  cron only if it is gone, to call `hr_watch` with the same arguments, and to continue from the
  handoff's "Next three actions". Use this for a long run with nobody at the keyboard.

### What `/clear` keeps and what it resets

`/clear` keeps the session's background agents, its session crons, and the roster: agents keep their
names and still answer `SendMessage`. It resets the plugin's own stored state, such as the watch's
settings and the roster's counters. In `auto` mode the plugin writes the watch back right after its own
clear. After a person's `/clear` in `nudge` mode the watch stays off. Either way, the successor's
`hr_watch` call arms the watch again with the same arguments.

### Limits of background agents worth knowing

- A named background agent cannot start another named agent; the roster is flat, so only the main
  session starts named agents.
- A named background agent has no `ListAgents` tool and no `AskUserQuestion` tool. Questions for the
  person go through the main session.
- A named agent's own helpers are unnamed and run in the foreground; the agent waits for each one.
- The session's permission mode and plan mode apply to every agent in the tree.
- A background agent can call skills but not plugin commands. That is why the engine is the
  `workflow-orchestrator:workflow-start` skill rather than a command.

## What a repo must provide

The plugin ships the engine and the mechanics. Each repository brings its own workflow. To use the
fleet mechanics, a repository provides:

1. **A run folder for each run**, inside the repository and ignored by git, so any later session finds
   it by path:

   ```text
   <repo>/.runs/<run-name>/
     orchestrator-state.md   the run-state file: every ruling, dispatch and verification, as it happens
     briefs/                 one brief file per agent
     reports/                every report an agent writes
     handoffs/               orchestrator and agent handoff files
   ```

2. **A handoff document shape** that ends with a section headed **Next three actions**. The successor
   continues from it.
3. **A workflow document** the successor reads in full after a handoff, passed as `workflowDoc` when
   the watch is armed.
4. **Arming at kickoff.** The orchestrator calls `mcp__workflow-orchestrator__hr_watch` with the run
   folder, the mode and the workflow document at the start of a run, and calls `hr_off` at the end.

[`examples/Native-Agent-Fleet-WORKFLOW.md`](examples/Native-Agent-Fleet-WORKFLOW.md) is a complete
fleet workflow that does all of this. It marks each part your repository supplies, such as its
methodology document, item tracker, naming, review chain and gates, with a `<slot: …>` placeholder.

## Loading the plugin

- **Subscribers** install from this marketplace, as in [Install](#install), and update through
  `/plugin`.
- **Developers** working on a local clone point the `CLAUDE_CODE_PLUGIN_DIRS` environment variable at
  the clone, which reloads the plugin as files change. While doing that, disable the installed
  marketplace copy, through `/plugin` or its entry in your settings' `enabledPlugins`.

Never load both at once. Both copies would register the same commands, tools and pane, and you would
see each one twice.

## Contributing

- **Version in two places.** A release bumps the version in both `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`, and adds a `CHANGELOG.md` entry.
- **Examples stay sanitized.** The examples must never contain organization names, confidential
  details, or absolute internal paths. Private or custom skill names are marked as examples.
- **The engine is self-contained.** `skills/workflow-start/SKILL.md` must not depend on anything
  outside the target project. It reads the target project's workflow file at runtime and never
  hard-codes another project's phases.

## What's in the box

```text
.claude-plugin/   plugin + marketplace manifests
commands/         the /workflow-capture authoring command
skills/           the workflow-start engine, a skill you invoke as /workflow-start and agents can call
hooks/            the Agents pane, the context gauge, the context watch, and the three tools
types/            type definitions for the plugin's hooks module
tests/            tests for the hooks module
docs/             authoring guide
examples/         minimal, two real sanitized pipelines, and the fleet template
```

## Related

Custom agents to compose into your pipeline (the `quality-agents:*` references in the examples come from
here): **[chrisghughes-alt/ClaudeCodeAgents](https://github.com/chrisghughes-alt/ClaudeCodeAgents)**.

## License

[MIT](LICENSE)
