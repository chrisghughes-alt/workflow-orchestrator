# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-06-07

### Added
- Initial release of the `workflow-orchestrator` plugin and its single-plugin marketplace.
- `/workflow-start` command: a project-agnostic pipeline orchestrator that drives a project's
  `docs/WORKFLOW.md` in order with binding gates and per-phase output checks.
- Authoring guide (`docs/authoring-workflows.md`).
- Examples: a generic minimal pipeline plus two real, sanitized pipelines (5-phase and 13-phase).
