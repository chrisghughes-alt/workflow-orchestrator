# workflow-orchestrator

A generic, **project-agnostic pipeline orchestrator** for Claude Code, packaged as an installable
plugin. It adds one command — `/workflow-start` — that reads your project's `docs/WORKFLOW.md` and
drives its phases in order under a fixed set of binding rules: phases run in sequence, every declared
output is produced before advancing, consent gates block on explicit approval, and the engine keeps
control even when an invoked sub-skill tries to decide what happens next.

The engine knows nothing about any specific project. Your `docs/WORKFLOW.md` defines the phases, the
skills they invoke, the artifacts they output, and the gates they enforce. The plugin supplies only the
*discipline* that runs that pipeline faithfully.

**No workflow yet? It bootstraps one.** The first time you run `/workflow-start` in a project that has
no `docs/WORKFLOW.md`, the engine stops, tells you no pipeline is defined, and offers to scaffold a
starter `docs/WORKFLOW.md` for you to customize — so you don't have to write one from a blank page. (It
never invents a pipeline silently or borrows another project's phases.)

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

1. Add a pipeline definition to your project at `docs/WORKFLOW.md`. Two easy starts:
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

## Great ways to create a workflow

You rarely have to write `docs/WORKFLOW.md` from scratch — the best pipelines are usually distilled
from work your project already does:

- **Mine your existing project context.** Before (or while) scaffolding, ask Claude to review your
  project memories (`CLAUDE.md`, memory files) and your `docs/` folder — existing specs, plans, and
  design docs — and turn the process you already follow into a `docs/WORKFLOW.md`. You get a pipeline
  grounded in your real conventions instead of a generic template.
- **Capture a workflow that just went well.** Finished a run you'd want to repeat — even an ad-hoc one
  you drove by hand, without `/workflow-start`? Ask Claude to write it up as a `docs/WORKFLOW.md` in
  this orchestrator's format (phases, each with an **Orchestrator directives** subsection). Next time,
  `/workflow-start` can replay it with the binding rules and consent gates enforced.

## What's in the box

```text
.claude-plugin/   plugin + marketplace manifests
commands/         the /workflow-start engine
docs/             authoring guide
examples/         minimal + two real, sanitized WORKFLOW.md pipelines
```

## License

[MIT](LICENSE)
