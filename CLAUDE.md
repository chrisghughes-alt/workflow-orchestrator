# CLAUDE.md

Guidance for working in this repository.

## What this is

A Claude Code **single-plugin marketplace** for `workflow-orchestrator`: the `workflow-start` pipeline
engine (a skill), the `/workflow-capture` authoring command, and, since 2.0, a hooks module that draws
the Agents pane, the context gauge and the context watch and registers three tools. Other people
subscribe to this marketplace, so every push is a release to them.

## Layout

- `.claude-plugin/plugin.json` — plugin manifest (bump `version` on release).
- `.claude-plugin/marketplace.json` — marketplace manifest (keep the plugin `version` in sync with
  `plugin.json`).
- `skills/workflow-start/SKILL.md` — the engine. It is a skill, not a command, so a background agent
  can invoke it; there is no `commands/workflow-start.md` any more (the two would list twice).
- `commands/workflow-capture.md` — the authoring command.
- `hooks/hooks.json` and `hooks/register.tsx` — the hooks module; `types/index.d.ts` is its state
  contract; `tests/sidebar.test.tsx` its tests; `NOTES.md` the engine-contract shapes and traps.
- `docs/authoring-workflows.md` — how users write a project `docs/WORKFLOW.md`; `docs/images/` — the
  README screenshots.
- `examples/` — example pipelines, including the generic fleet template.
- `docs/superpowers/` — local planning docs and agent reports; git-ignored because they carry local
  paths.

## Rules when editing

- **Nothing private gets published.** No absolute local paths, user names, or organisation and product
  names from other repositories, in any tracked file or screenshot. Grep before a release.
- **The engine is self-contained.** `skills/workflow-start/SKILL.md` must not depend on anything
  outside the target project, and it reads the *target* project's `docs/WORKFLOW.md` at runtime —
  never hard-code another project's phases.
- **Examples stay sanitized.** Private or custom skill names are annotated as examples.
- **The hooks module is tested.** `claude plugin validate <repo>` and `claude plugin test <repo>` must
  pass before every commit that touches `hooks/`, `types/` or `tests/`, and so must the type-check,
  `tsc -p <repo>`. That reads the type files Claude Code lays in `.claude-plugin/types/` when it loads
  the clone; files laid by an older build can report errors the current API does not have, so load
  the clone once (developer mode) before trusting a failure. The folder hot-reloads into
  every live session that loads it through `CLAUDE_CODE_PLUGIN_DIRS`, so every save must compile.
- **Version in two places.** A release bumps the version in both manifests and adds a `CHANGELOG.md`
  entry.

## Loading while developing

Point `CLAUDE_CODE_PLUGIN_DIRS` at this clone and disable the installed marketplace copy; never load
both at once. Switch back to the marketplace copy after the release.

## Publishing

Push `master`; subscribers update through `/plugin`. Users install with:

```text
/plugin marketplace add chrisghughes-alt/workflow-orchestrator
/plugin install workflow-orchestrator
```
