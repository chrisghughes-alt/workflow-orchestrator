# workflow-orchestrator

A generic, **project-agnostic pipeline orchestrator** for Claude Code, packaged as an installable
plugin. It adds two commands:

- **`/workflow-start`** reads your project's `docs/WORKFLOW.md` and drives its phases in order under a
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
semantics, and routing. See [`examples/`](examples/) for a minimal starter plus two real (sanitized)
pipelines — a compact 5-phase one and an elaborate 13-phase one.

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

## What's in the box

```text
.claude-plugin/   plugin + marketplace manifests
commands/         the /workflow-start engine + /workflow-capture authoring command
docs/             authoring guide
examples/         minimal + two real, sanitized WORKFLOW.md pipelines
```

## Related

Custom agents to compose into your pipeline (the `quality-agents:*` references in the examples come from
here): **[chrisghughes-alt/ClaudeCodeAgents](https://github.com/chrisghughes-alt/ClaudeCodeAgents)**.

## License

[MIT](LICENSE)
