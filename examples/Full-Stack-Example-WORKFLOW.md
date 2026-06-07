# Web-App Feature Workflow (example)

> **Example.** This is a real (sanitized) project pipeline included to show an elaborate 13-phase
> workflow with lane classification, review loops, and explicit merge/push gates. Copy it as a
> starting point and adapt it to your project.

This document describes the project-specific pipeline that composes the superpowers, impeccable, and quality-agents skills into the development workflow used for this web-application codebase. It encodes project conventions, gate sequencing, and artifact paths. Skill internals (worktree mechanics, brainstorming structure, TDD discipline) are not re-documented here — invoke the named skill instead.

**Executable contract.** This file is the executable single source of truth for the pipeline. The generic `/workflow-start` engine (global command) reads this file and drives it phase-by-phase. Each phase carries an **Orchestrator directives** subsection that the engine executes: that subsection is **authoritative for control flow** (what to invoke, what to suppress, what to output, which gate to honor, where to route); the surrounding prose is authoritative for nuance. The engine itself knows zero phase names and zero skill names — all pipeline content lives here.

## Skills this workflow composes

| Phase | Skill |
|---|---|
| 1 (Brainstorm) | `superpowers:brainstorming` (writes the initial spec at step 6) |
| 2b (Shape) | `impeccable:shape` *(example custom skill — substitute your own)* (UI whole-feature only) |
| 4, 6 (/goal loops) | `superpowers:subagent-driven-development` (dispatches review + fix-up pairs); `/goal` loop *(example custom skill — substitute your own)* |
| 5 (Plan authoring) | `superpowers:writing-plans` |
| 7 (Development) | `superpowers:using-git-worktrees`, `superpowers:executing-plans`, `superpowers:subagent-driven-development`, `superpowers:test-driven-development` |
| 8 (Review chain) | `quality-agents:karen` *(example custom skill — substitute your own)* (orchestrates `jenny` + `code-quality-pragmatist`, also custom) |
| 9 (Auto-UAT) | `quality-agents:ui-comprehensive-tester` *(example custom skill — substitute your own)* |
| 11–12 (Merge / push) | `superpowers:finishing-a-development-branch`, `superpowers:verification-before-completion` |

## Pipeline summary

```
1.  Brainstorm                 steps 1–8; writes initial spec → docs/superpowers/specs/YYYY-MM-DD-{name}-design.md
        └─ SUPPRESS: brainstorming step 9 (invoke writing-plans) DISABLED
2.  Lane classification        AskUserQuestion → Non-UI/Small UI → Phase 3; UI whole-feature → Phase 2b
2b. Shape (custom skill)       (UI whole-feature only)
        └─ GATE: combined PROCEED + shape confirmation
3.  Spec augmentation          augments the Phase-1 spec with project-required sections
4.  /goal review loop (spec)   cap 6, both ends to subagents
5.  Plan authoring             → docs/plans/YYYY-MM-DD-{name}-plan.md
        └─ SUPPRESS: writing-plans execution-handoff offer DISABLED
6.  /goal review loop (plan)   cap 6, plan self-review compile-checks new code
7.  Sub-agent development      in worktree, unique container per worktree
8.  Review chain (custom)      → fix-up → 1 re-review → severity branch
        └─ critical issues → escalate to user
        └─ non-critical    → recommendations carry forward, discharge
9.  Auto-UAT (custom)          ui-comprehensive-tester, light + dark, painted-element targets
10. Manual UAT                 user, worktree container
        └─ GATE: explicit merge consent
11. Merge to main
        └─ GATE: separate fresh push consent (drop auto mode)
12. Push
13. Phase close-out            craft report + project-tracker update (major-phase/milestone work only)
```

User-in-the-loop gates: combined brainstorm/shape verdict; review-chain critical escalation; manual UAT; merge consent; push consent.

---

## Phase 1 — Brainstorm

Invoke `superpowers:brainstorming` and run **steps 1–8 only**. Step 6 writes the initial spec to `docs/superpowers/specs/YYYY-MM-DD-{name}-design.md` and commits it; step 8 is the user's review of that written spec. Lane classification (Non-UI / Small UI tweak / UI whole-feature) is **not** decided here — it is its own step (Phase 2) after brainstorming completes.

**Orchestrator directives**
- Invoke: `superpowers:brainstorming` (run steps 1–8 only)
- Suppress: brainstorming **step 9** ("invoke writing-plans") is DISABLED. When the user approves the written spec at step 8, brainstorming is DONE and control returns to the orchestrator. Do NOT invoke writing-plans; do NOT transition to implementation; ignore any brainstorming terminal-state instruction.
- Output: `docs/superpowers/specs/YYYY-MM-DD-{name}-design.md` + commit `docs(specs): {name} spec — initial draft`
- Gate: none
- Route: Phase 2 (Lane classification)

## Phase 2 — Lane classification

After brainstorming completes, classify the work by lane. The orchestrator asks the user directly (`AskUserQuestion`); this is an orchestrator action, not a skill invocation.

**Question:** "What lane does this work fall into?"

**Options:**
- **Non-UI work** — backend, infrastructure, data layer, services, or refactors with no user-visible UI changes
- **Small UI tweak** — minor adjustment to existing UI (single component, no new design surface, no significant interaction change)
- **UI whole-feature** — new UI surface, new feature, or significant redesign of an existing surface

**Orchestrator directives**
- Invoke: none (orchestrator asks the lane-classification `AskUserQuestion` above)
- Output: none (the captured lane drives later `Condition`/`Route` fields)
- Gate: none
- Route (conditional table):
  - Non-UI work → Phase 3
  - Small UI tweak → Phase 3
  - UI whole-feature → Phase 2b

## Phase 2b — Shape (UI whole-feature only)

Invoke a design-shaping skill *(example: `impeccable:shape` — example custom skill, substitute your own)*. The skill runs its own discovery interview and presents a design brief (compact or full structured form, per the skill's logic).

**On user confirmation, the orchestrator automatically saves the brief to `audits/YYYY-MM-DD-{name}-shape.md`.** This is project-specific; the skill itself does not persist files.

**Orchestrator directives**
- Condition: `lane == UI whole-feature` — otherwise skip directly to Phase 3
- Invoke: `impeccable:shape` *(example custom skill — substitute your own)*
- Post: on user confirmation of the brief, save it to `audits/YYYY-MM-DD-{name}-shape.md` (orchestrator-produced; the skill does not persist files)
- Output: `audits/YYYY-MM-DD-{name}-shape.md`
- Gate: USER CONSENT REQUIRED — combined PROCEED + shape confirmation. The user confirms once at end-of-shape; this verdict subsumes the brainstorm PROCEED for this lane.
- Route: Phase 3

## Phase 3 — Spec augmentation

The spec file already exists from brainstorming step 6 (Phase 1) at `docs/superpowers/specs/YYYY-MM-DD-{name}-design.md`. Phase 3 **augments** it with project-required sections — it does not author it from scratch.

**Standard sections (ensure each exists; add any brainstorming omitted):** Charter; Use-don't-reinvent ledger; Scope (in / out); Implementation guidance; Workflow gates.

**UI whole-feature only — new §Design brief section:** links to `audits/...-shape.md` AND restates the load-bearing decisions inline (color strategy, theme scene sentence, anchor refs, fidelity/breadth/interactivity scope). Self-containment matters: implementer subagents drop through linked-only content.

**§ Workflow gates section (required in every spec):** enumerates Phase 4 → Phase 13 with **phase-specific shape adjustments** for the work at hand. Don't just paraphrase this WORKFLOW.md — call out where THIS phase's Auto-UAT scope shrinks (Non-UI work), where the review chain checklist needs special attention (e.g., race conditions in concurrent rewrites), where the manual UAT brief should target specific user-visible surfaces, and where Phase 13 close-out has phase-specific outputs (craft report sections, project-tracker updates). The point is to give reviewers and the auto-UAT dispatcher an in-spec checklist rather than making them cross-reference this file.

**Dispatch brief to spec author** (subagent or main session): explicitly cites the shape brief file as **required input** when present.

**Orchestrator directives**
- Invoke: none (orchestrator augments the existing spec, or dispatches a spec-author subagent, per the prose above)
- Output: augmented spec at `docs/superpowers/specs/YYYY-MM-DD-{name}-design.md` + commit `docs(specs): {name} spec — project sections augmented`
- Gate: none
- Route: Phase 4

## Phase 4 — /goal review loop on spec (cap 6)

*(The `/goal` loop is an example custom skill — substitute your own iterative review mechanism.)*

Both review and fix-up dispatched to subagents.

**Reviewer's dispatch brief:** when §Design brief is present, also load `audits/...-shape.md` and verify the spec's design decisions reflect the brief.

**Per-pass commits:** `docs(specs): ... /goal pass N fix-up` (N = 1..5)

**Cap discharge at pass 6:** `docs(specs): ... /goal cap discharge at pass 6`. Commits final state regardless of remaining nits. The cap exists because review loops without bounds drift toward perfectionism.

**Orchestrator directives**
- Invoke: `/goal` review loop *(example custom skill — substitute your own)* — both the reviewer AND the fix-up agent are dispatched as subagents; do not edit the spec directly between reviews
- Output: per-pass commits `docs(specs): ... /goal pass N fix-up` (N = 1..5); cap discharge at pass 6 `docs(specs): ... /goal cap discharge at pass 6`
- Gate: none
- Route: Phase 5

## Phase 5 — Plan authoring

**Output:** `docs/plans/YYYY-MM-DD-{name}-plan.md` (invoke `superpowers:writing-plans` for structure).

The writing-plans skill ends by offering an execution choice (subagent-driven or inline implementation). That offer is **disabled** here — when the plan is written, self-reviewed, and committed, control returns to the orchestrator (Phase 6). Do not begin execution.

**Orchestrator directives**
- Invoke: `superpowers:writing-plans`
- Suppress: writing-plans' execution-handoff offer is DISABLED. When the plan is written and committed, writing-plans is DONE and control returns to the orchestrator. Do NOT begin execution; do NOT invoke executing-plans or subagent-driven-development yet.
- Output: `docs/plans/YYYY-MM-DD-{name}-plan.md` + commit `docs(plans): ... implementation plan`
- Gate: none
- Route: Phase 6

## Phase 6 — /goal review loop on plan (cap 6)

Same shape as Phase 4 but on the plan doc.

**Mandatory check in reviewer's dispatch brief:** plan-supplied new code must compile-check against the project's language and framework rules. Common blind spots for compiled languages: implicit-conversion rules; named-argument collisions; runtime config gates stricter than validation attributes; shared-state mutation in test fixtures; signature contract changes breaking downstream callers mid-plan.

**Fix-ups writing >50 LOC of new code** need orchestrator pre-verified ground truth for load-bearing types/methods/paths — otherwise subagents invent plausible-looking names that don't exist.

**Per-pass commits:** `docs(plans): ... /goal pass N fix-up`

**Cap discharge:** `docs(plans): ... /goal cap discharge at pass 6`

**Orchestrator directives**
- Invoke: `/goal` review loop *(example custom skill — substitute your own)* on the plan — both reviewer and fix-up are subagents. Reviewer brief carries the compile-check blind-spot list above; >50 LOC fix-ups require orchestrator-pre-verified ground truth.
- Output: per-pass commits `docs(plans): ... /goal pass N fix-up`; cap discharge at pass 6 `docs(plans): ... /goal cap discharge at pass 6`
- Gate: none
- Route: Phase 7

## Phase 7 — Sub-agent development

Invoke `superpowers:using-git-worktrees` to set up the worktree, then `superpowers:executing-plans` + `superpowers:subagent-driven-development` for plan execution. Apply `superpowers:test-driven-development` discipline where tests are part of the deliverable.

**Project-specific rules layered on top of those skills:**

- **Branch naming:** define a naming convention appropriate to your project (e.g., `feature/{name}` or issue-based refs)
- **Container per worktree** — see Container & Worktree Discipline section below
- **Dispatch briefs use ABSOLUTE paths** (subagent CWD inherits parent's, not the worktree's)
- **No `/simplify` in implementer prompts** — code-quality reviewer is a separate downstream pass
- **Commit refs:** adopt a consistent commit-ref convention for your issue-tracking system and branch type
- **Ground-truth verification:** orchestrator runs `git log` + `git status` + build before accepting any subagent's DONE report
- **No `Co-Authored-By`** lines — never attribute Claude as a co-author
- **No haiku** for implementation subagents — sonnet or opus only

**Orchestrator directives**
- Invoke (in order): `superpowers:using-git-worktrees` → `superpowers:subagent-driven-development` (preferred) or `superpowers:executing-plans` → apply `superpowers:test-driven-development` discipline where tests are deliverable
- Output: implemented changes landed in the worktree (verify via `git log` + `git status` + build as ground truth before accepting any subagent DONE report)
- Gate: none
- Route: Phase 8
- **Mandatory project rules (enforcement, prose-resident — the binding-rule floor does NOT cover these; they must survive as prose):** branch naming; container-per-worktree; ABSOLUTE paths in dispatch briefs; no `/simplify` in implementer prompts; commit-ref convention by lane; ground-truth verify; no haiku; no `Co-Authored-By`. See the bullet list above and the Container & Worktree Discipline section below.

## Phase 8 — Review chain

Dispatch a code-review orchestrator agent *(example: `quality-agents:karen` — example custom skill, substitute your own)* as the single review entry point. The agent orchestrates its sub-reviewers and synthesizes the verdict — the orchestrator does not dispatch them individually.

**Loop shape (with severity gate):**

1. Review agent reviews → returns recommendations
2. If recommendations exist → fix-up subagent applies them
3. Review agent re-reviews **once**
4. **Severity branch after re-review** (the agent labels severity in its synthesis):
   - No issues, or only **non-critical** recommendations remaining → discharge to Auto-UAT; recommendations carry forward as advisory (noted in the craft report)
   - **Critical** issues remaining → escalate to user; no auto-discharge

The review chain runs BEFORE Auto-UAT by design — it's the "is this ready to be tested" gate, avoiding wasted UAT cycles on fix-ups.

**Orchestrator directives**
- Invoke: review-chain agent *(example custom skill — substitute your own)* as the single review entry point. If recommendations exist, dispatch a fix-up subagent, then the review agent re-reviews **once**.
- Output: none (review artifact; recommendations carried forward as advisory in the craft report)
- Gate: USER CONSENT REQUIRED **when** the post-re-review verdict == critical → escalate to the user and await direction (the loop pauses here and resumes per the user's instruction); do NOT auto-discharge. *(`Gate: none` here would be a behavior change — wrong.)*
- Route: non-critical (no issues, or only non-critical recommendations) → Phase 9

## Phase 9 — Auto-UAT

**Pre-dispatch (orchestrator runs in the worktree):**

1. Install browser automation dependencies (e.g., `npm install --no-save playwright` + `npx playwright install chromium`) — do not leave bootstrap to the subagent's limited context.
2. Probe dev credentials before dispatch. Only ask the user if the probe fails.

**Dispatch:** `quality-agents:ui-comprehensive-tester` *(example custom skill — substitute your own)*

**Brief format requirements:**

- Explicit URLs per page (e.g., `http://localhost:<host-port>/app/...`); verify routes resolve before listing
- Per-URL verify points + light + dark pass criteria (where theme-sensitive)
- Computed-style assertions target the **inner painted element**, not the semantic host
- Theme toggle via the mechanism the app actually uses — confirm before scripting

**Orchestrator directives**
- Pre (orchestrator runs in the worktree, before dispatch): (1) install browser automation dependencies; (2) probe dev credentials — only ask the user if the probe fails
- Invoke: `quality-agents:ui-comprehensive-tester` *(example custom skill — substitute your own)* with the brief above
- Output: none (UAT result report)
- Gate: none
- Route: Phase 10

## Phase 10 — Manual UAT

After Auto-UAT discharges, the orchestrator presents the user with a structured Manual UAT brief. The brief is what the user actually exercises in the worktree-specific container — same rigor as the Auto-UAT brief, just human-driven instead of Playwright-driven.

**Brief format requirements:**

- **A list of clickable URLs** pointing at the worktree's container (e.g., `http://localhost:<host-port>/app/...`). Verify each route resolves before including it — never list a URL that doesn't load.
- **Per-URL test instructions** — explicit user actions to take (e.g., "Click the 'Save' button on the form", "Submit the form with a required field empty", "Toggle dark mode from the user menu", "Drag the second row up two positions").
- **Per-URL specific items to verify** — observable outcomes tied to the changes (e.g., "The badge renders as the correct variant", "The icon remains visible in dark mode", "The empty-state copy reads the updated string, not the legacy fallback"). Be specific enough that the user can answer pass/fail without guessing.
- **Light + dark mode coverage** where the change touches anything theme-sensitive — explicitly state both passes are required.
- **Group URLs by feature/page** when more than ~3 URLs are in scope, so the user can work through one area at a time.
- **Open the URLs in the user's actual browser** when possible (rather than requiring the user to copy-paste), and present the brief inline in the conversation so the URLs are clickable.

**Gate:** Explicit merge consent. Never inferred from "looks good".

**Orchestrator directives**
- Invoke: none (orchestrator presents the Manual UAT brief inline in the conversation)
- Output: none (inline brief, no file)
- Gate: USER CONSENT REQUIRED — explicit merge consent. "Looks good" / positive tone is NOT consent; the user must explicitly say to merge.
- Route: Phase 11 — only after explicit merge consent

## Phase 11 — Merge

Merge worktree branch → main locally. Invoke `superpowers:finishing-a-development-branch` for the merge/PR/cleanup decision tree.

**Gate:** Separate, fresh push consent. Merge consent does not imply push consent.

**Orchestrator directives**
- Invoke: `superpowers:finishing-a-development-branch` (merge/PR/cleanup decision tree)
- Output: branch merged to main locally
- Gate: USER CONSENT REQUIRED — separate, fresh push consent. Merge consent does NOT imply push consent; positive tone is NOT consent.
- Route: Phase 12 — only after explicit push consent

## Phase 12 — Push

- **Drop out of auto mode first** — auto mode tightens harness consent gating on `git push`
- **Pre-push verification:** `git log origin/main..HEAD` to surface unexpected commits
- **Minimize pipeline runs:** consolidate where possible; lead with pipeline-run cost when presenting push-strategy options
- **Spec/plan commits stay isolatable:** committed locally per repo precedent; pushable but kept discrete — don't bundle with implementation pushes that ping reviewers more aggressively

**Orchestrator directives**
- Pre (order-sensitive): **drop out of auto mode FIRST**, then `git log origin/main..HEAD` to surface unexpected commits
- Invoke: none (orchestrator performs the push per the push-strategy the user approved)
- Output: pushed commits (minimize pipeline runs; keep spec/plan commits isolatable from implementation pushes)
- Gate: none (push consent was already obtained at the Phase 11 gate)
- Route: Phase 13

## Phase 13 — Phase close-out

- **Craft report:** `audits/YYYY-MM-DD-{phase}-craft.md` — what shipped, what was deferred, learnings
- **Project tracker update** (major-phase/milestone work only): mark phase done, remove from Next-up
- **Linked-issue update** (only if this workflow was based on an existing issue — signals: `$ARGUMENTS` named an issue ID or issue-based branch/commit refs): **ask** the user whether/how to update it (progress or closing comment, state change, close, or skip). Don't auto-update or auto-draft. Apply via your project's issue-tracker tooling (GitHub, Jira, Azure DevOps, etc.). If the work wasn't issue-based, skip this output.

**Orchestrator directives**
- Invoke: none (orchestrator produces the close-out artifacts)
- Output: craft report `audits/YYYY-MM-DD-{phase}-craft.md`; (major-phase/milestone work only) project-tracker updated
- Post: linked-issue update — **ask-first** only when the workflow was issue-based (see prose); apply via the project's issue-tracker tooling; never auto-update or auto-draft
- Gate: none
- Route: pipeline complete

---

## Container & Worktree Discipline

### Principle

All verification, Auto-UAT, and Manual UAT runs against the **production Docker container** built from the project's production Dockerfile, not the dev server. The production container runs the minified/compiled bundle and published assemblies, catching dev-vs-prod divergences (build-tooling issues, asset hashing, bundle differences) before they reach the pipeline.

The dev server is only acceptable for brainstorm/design questions where no changes will ship.

### Per-worktree isolation

| Resource | Convention | Example |
|---|---|---|
| Image tag | `<project>-{branch-suffix}:{variant}` | `myapp-feature123:pagination` |
| Host port | Assign a unique unused port per worktree and record it in the spec | `-p 8123:8080` |
| Container name | `--name {branch}-{variant}` | `--name feature123-pagination` |

**Critical env-var pairing:** CORS allowed origins must match the chosen host port, or the UI fails to authenticate.

### Standard build & run command

```bash
cd .worktrees/<branch>
docker build -f container/prod/Dockerfile -t <project>-<id>:<variant> .
docker run --rm \
  -p <host-port>:<container-port> \
  --name <id>-<variant> \
  --add-host=host.docker.internal:host-gateway \
  -e ASPNETCORE_ENVIRONMENT=Development \
  -e "APP_DB_CONNECTION=<your-dev-connection-string>" \
  -e "APP_JWT_SECRET=<your-dev-secret>" \
  -e "Cors__AllowedOrigins__0=http://localhost:<host-port>" \
  <project>-<id>:<variant>
```

Adapt the env-var names and values to your project's configuration schema.

### Shared infrastructure

The dev database container is **always-on shared infra** across all worktrees. Never tear it down, remove volumes, or drop tables without explicit user authorization. Per-worktree app containers connect to it via `host.docker.internal`.

Apply any pending schema migrations to all dev databases that need them before running tests or UAT.

### Lifecycle

- Container built fresh per Auto-UAT cycle (after implementation changes land in the worktree)
- Container stays running through Auto-UAT → Manual UAT → merge decision
- On merge to main: stop and remove the worktree's container (`docker stop <name>` then `docker rm <name>`)
- Worktree cleanup itself is handled by `superpowers:finishing-a-development-branch`

### Why this matters for parallel work

The user runs multiple agents in parallel across sibling worktrees. Generic resource names will clobber another agent's running container within seconds. This discipline is what makes the parallel-agent model viable.

---

## Cross-cutting conventions

| Topic | Rule |
|---|---|
| Commit refs | Adopt a consistent convention per branch type (e.g., issue-ref in every commit for issue-based branches; none for design phases). |
| Artifact paths | Specs: `docs/superpowers/specs/`. Plans: `docs/plans/`. Audits & briefs: `audits/`. |
| Verification env | Production container at chosen worktree port. Never the dev server for ship-bound work. |
| Subagent dispatch | Absolute paths always. No `/simplify` in implementer prompts. Verify ground truth on DONE. |
| Auto-UAT brief | Pre-install browser automation dependencies. Probe dev creds before dispatch. Target painted elements, not semantic hosts. Use the app's actual theme-toggle mechanism. |
| User-gated actions | Combined brainstorm/shape PROCEED; review-chain critical escalation; manual UAT; merge consent; push consent. |
| Auto-mode | Drop out of auto mode before `git push` (auto mode tightens harness gating). |
| Co-authorship | Never attribute Claude as co-author on commits. |

