# <Project> Workflow

This document is the executable pipeline for this project, driven by `/workflow-start`. Each phase's
prose is the human/sub-agent reference; the **Orchestrator directives** subsection is authoritative for
control flow. Replace the placeholder phases below with your real pipeline.

Artifact naming convention used here: specs at `docs/specs/YYYY-MM-DD-<slug>.md`. Use today's date for
new artifacts.

---

## Phase 1 — Plan

Turn the requested work into a short written plan before any code is written. Resolve ambiguity here:
scope, the files likely to change, and what "done" means.

**Orchestrator directives**
- Invoke: none (the orchestrator drafts the plan inline from the work description)
- Post: save the plan to `docs/specs/YYYY-MM-DD-<slug>.md` and commit it
- Output: `docs/specs/YYYY-MM-DD-<slug>.md` + commit "docs: add plan for <slug>"
- Gate: USER CONSENT REQUIRED — present the plan and get an explicit "yes, proceed" before implementing
- Route: Phase 2

## Phase 2 — Implement

Make the change described by the approved plan. Keep edits focused on the planned files.

**Orchestrator directives**
- Invoke: none (the orchestrator performs the edits directly)
- Output: none (the code change is the deliverable; verified in Phase 3)
- Gate: none
- Route: Phase 3

## Phase 3 — Verify & integrate

Run the project's checks (tests/lint/build) and confirm the change works. Then decide on integration.

**Orchestrator directives**
- Pre: run the test/lint/build commands and capture their output
- Invoke: none
- Output: none
- Gate: USER CONSENT REQUIRED — never merge to the default branch or push to a remote without an
  explicit "yes" on that specific action; positive tone is not consent
- Route: end
