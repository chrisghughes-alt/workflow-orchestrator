---
description: Run this project's docs/WORKFLOW.md pipeline (or the file named by a leading --file) phase by phase, with binding rules for order, outputs and consent gates.
argument-hint: "[--file <path>] <work description>"
---

# Workflow Start

The instructions for this command are in the `workflow-orchestrator:workflow-start` skill, so that a
background agent, which can call skills but not plugin commands, runs the same engine. Invoke that skill
now with the Skill tool, passing these arguments through unchanged, including any leading `--file <path>`:

$ARGUMENTS
