# CLAUDE.md

Guidance for working in this repository.

## What this is

A Claude Code **single-plugin marketplace**. It packages the `/workflow-start` command (a
project-agnostic pipeline orchestrator) for installation via `/plugin`. There is no executable code —
this repo is Markdown + two JSON manifests.

## Layout

- `.claude-plugin/plugin.json` — plugin manifest (bump `version` on release).
- `.claude-plugin/marketplace.json` — marketplace manifest (keep the plugin `version` in sync with
  `plugin.json`).
- `commands/workflow-start.md` — the engine.
- `docs/authoring-workflows.md` — how users write a project `docs/WORKFLOW.md`.
- `examples/` — example pipelines.

## Rules when editing

- **The command is the product.** When changing `commands/workflow-start.md`, keep it self-contained:
  it must not depend on anything outside the target project, and it reads the *target* project's
  `docs/WORKFLOW.md` at runtime — never hard-code another project's phases.
- **Examples stay sanitized.** The two real examples must never contain organization identifiers,
  employee/domain-confidential specifics, or absolute internal paths. Private/custom skill names are
  annotated as examples. Re-run the grep checks from the implementation plan after editing them.
- **Version in two places.** A release bumps the version in both `plugin.json` and `marketplace.json`,
  and adds a `CHANGELOG.md` entry.

## Publishing

This repo is scaffolded locally. To publish:

```bash
gh repo create chrisghughes-alt/workflow-orchestrator --public --source . --remote origin --push
```

Then users install with:

```text
/plugin marketplace add chrisghughes-alt/workflow-orchestrator
/plugin install workflow-orchestrator
```
