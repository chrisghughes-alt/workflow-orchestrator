# Workflow Start — Generic Pipeline Orchestrator

This command is a **project-agnostic orchestration engine**. It knows nothing about any specific phase, skill,
or artifact path. It loads the **current project's** pipeline definition from `docs/WORKFLOW.md` and executes
it under a fixed set of binding rules.

The pipeline content — which phases exist, what skills they invoke, what they output, what gates they enforce —
lives entirely in that project's `docs/WORKFLOW.md`. This engine supplies only the *discipline* that forces the
pipeline to run in order, produce its outputs, honor its gates, and keep control even when an invoked sub-skill
tries to decide what happens next.

To make a new project pipeline-ready: author a `docs/WORKFLOW.md` whose phases each carry an **Orchestrator
directives** subsection (format below), and run `/workflow-start`.

---

## Binding rules — these are not suggestions

These four rules hold for **every** project, regardless of how many phases its pipeline has or which skills it
composes:

1. **This engine supersedes sub-skill terminal states.** When a phase's directives or this loop says STOP or
   "control returns here," obey it — do NOT follow the invoked sub-skill's own next-step instruction. Every
   invoked skill is a tool this engine drives; it does not decide what happens next. This loop does. (This is
   the *floor* for any phase that does not declare an explicit `Suppress`; phases with a `Suppress` directive
   reinforce it at the exact handoff seam.)
2. **Execute phases in the order the pipeline defines.** Do not skip, reorder, or combine phases unless a
   phase's `Condition` excludes it.
3. **Every phase with a declared `Output` has a mandatory output.** Do not advance to the next phase until the
   current phase's `Output` exists (file on disk + commit present, or the declared inline deliverable produced).
   A phase whose `Output` is `none` advances without an artifact.
4. **Gates marked `USER CONSENT REQUIRED` need explicit user approval.** Never infer consent from a positive
   conversational tone ("looks good," "nice," etc.). A conditional gate blocks only when its condition holds,
   but when it holds it blocks just as hard.

---

## Arguments

`$ARGUMENTS` may begin with an optional **leading** `--file <path>` token that selects which workflow file to
run; the rest is the work description.

**Parse `$ARGUMENTS` before Step 0:**

- If `$ARGUMENTS` begins with `--file` followed by a path token — a single whitespace-delimited token, or a
  quoted string if the path contains spaces (strip the quotes) — bind that path as `WORKFLOW_FILE` and bind the
  remaining text as `WORK` (the work description).
- Otherwise, `WORKFLOW_FILE = docs/WORKFLOW.md` and `WORK = $ARGUMENTS` in full.

The `--file` flag is recognized **only** in leading position, so a work description that merely contains the
substring `--file` is treated as plain text (e.g. ``--file "my docs/pipeline.md"`` shows the quoting for a
path that contains spaces).

`WORK` is the work description (feature, bug, or change to start the pipeline on). If `WORK` is empty, ask the
user to describe the work before Step 0, then treat their answer as `WORK`. Throughout the rest of this command, **`WORK` is the value passed to
invoked skills** — never the raw `$ARGUMENTS` (which may still carry the `--file <path>` prefix).

---

## Step 0 — Load the project pipeline

**Action:** Use the Read tool to read `WORKFLOW_FILE` (the path resolved from Arguments; default
`docs/WORKFLOW.md`, relative to the current project root) **in full**, NOW, before anything else.

- **If it exists:** hold it in context. It defines every phase, gate, artifact path, and convention for THIS
  project's pipeline. The phase prose is the human/sub-agent reference; each phase's **Orchestrator directives**
  subsection is authoritative for control flow. You need the whole file in context to execute correctly.
- **If it is missing:** STOP. Tell the user plainly that this project has no pipeline definition
  (`WORKFLOW_FILE` not found — report the resolved path). Use `AskUserQuestion` to offer: **(a)** scaffold a
  starter workflow file at `WORKFLOW_FILE` from the embedded skeleton below for them to customize, or **(b)** abort. **NEVER**
  fall back to another project's phases or invent a pipeline — a missing definition means there is no pipeline
  to run.

---

## Execution loop

Parse every phase's **Orchestrator directives** subsection into an ordered phase list. Then drive the loop
below. It references only the directive **fields** (`Condition / Invoke / Suppress / Pre / Post / Output / Gate /
Route`) — never a phase number or a skill name — so it works identically for a 5-phase or a 20-phase pipeline.

```
current = first phase in the pipeline
WHILE current is not null:
  a. CONDITION — if current.Condition is present and evaluates false, skip the phase: set current to its
     Route default and continue.
  b. PRE — run current.Pre steps yourself (the orchestrator runs these, not a sub-skill): e.g. install a tool,
     probe credentials, "drop out of auto mode first." Order-sensitive: these happen BEFORE Invoke.
  c. INVOKE — call current.Invoke skill(s), in the order listed, with WORK (the stripped work description) /
     accumulated context. If Invoke is `none`, perform the orchestrator action the phase's prose describes
     (e.g. present an inline brief, ask an AskUserQuestion).
  d. SUPPRESS — immediately on the skill's return, apply current.Suppress: ignore the skill's own
     next-step / terminal-state instruction and do exactly what Suppress says. (Binding rule #1 is the floor
     when no Suppress is declared.)
  e. POST — run current.Post steps yourself (orchestrator actions AFTER Invoke, or on user confirmation):
     e.g. save a produced brief to an artifact path. Some outputs are produced by the orchestrator here, not
     by the invoked skill.
  f. OUTPUT — verify current.Output exists before advancing. For a file artifact, confirm the file AND its
     declared commit via `git log` / `git status` as ground truth — never trust a sub-agent's self-report. Do
     NOT advance if absent. If Output is `none`, skip this check.
  g. GATE — honor current.Gate:
       - `none` → proceed.
       - `USER CONSENT REQUIRED` → block until the user explicitly approves the stated action. Positive tone is
         not consent.
       - conditional (`USER CONSENT REQUIRED when <condition>`) → evaluate the condition post-Invoke. If it
         holds, escalate and AWAIT user direction: the loop pauses at this phase and resumes per the user's
         instruction; do NOT auto-advance. If it does not hold, proceed.
  h. ROUTE — pick the next phase from current.Route. Use the conditional table when present, keyed on the
     lane/verdict captured earlier. Set current to the chosen phase.
```

---

## Deviation tracking (maintained during the loop)

While the loop above runs, keep an in-context **deviation log** — a running list, no persistence
(the whole run is in one conversation). Append a one-line entry whenever the user **forces a
departure from what a phase's directives specified**. This log is read once at the end by the
*Workflow-fit suggestion* step below; it changes nothing about how the loop itself runs.

Each entry records: the phase, the deviation **kind**, a short near-verbatim note of what the
user said/did, a **severity** (minor/major), and whether **frustration** was voiced.

**Deviation kinds (these get logged):**

1. **Skipped/abandoned** — the user forced a defined phase to be skipped or not run (NOT via a
   `Condition`).
2. **Reordered/inserted** — phases run out of the defined order (*pure reorder*), or ad-hoc work
   inserted, whether substituting for a defined phase (*insert-replacing-a-phase*) or adding a
   step with no corresponding phase.
3. **Overrode a gate/directive** — pushed past a consent gate differently than defined, or
   changed a phase's `Invoke`/`Output` mid-run (e.g. "skip the review skill this time").

Beyond these three kinds, two **escalation signals** are derived from the logged deviations
(they drive the suggestion's tier below, not what gets logged): **Repeated** and **voiced
frustration**, defined under the classification rules.

**NEVER log these — they are the engine executing its own defined control flow, not user-forced
departures:**

- a `Condition` evaluating false and skipping its phase (loop step a),
- a `Pre` step failing or short-circuiting a phase, e.g. a credential probe that aborts or
  forces a fallback (loop step b),
- the engine applying a `Suppress` directive on a sub-skill's return (loop step d),
- normal consent given or withheld at a gate, and a conditional gate that correctly blocked
  (loop step g),
- the engine blocking advance because a declared `Output` was not produced (loop step f),
- routing through a `Route` table (loop step h).

Log only **user-forced** departures from the written pipeline, never the engine's own behavior.
(Steps c Invoke and e Post are where user-forced deviations typically arise — those are what you
log; the list above is what you never log.)

**Classification rules (apply consistently):**

- **Major vs minor severity.** *Major* = a phase entirely skipped/abandoned (kind 1), a consent
  gate overridden or bypassed (kind 3, gate), or ad-hoc work substituted for a defined phase
  (kind 2, insert-replacing-a-phase). *Minor* = the phase still ran and produced its declared
  output but a directive value was changed mid-phase (kind 3, `Invoke`/`Output` tweak), or phases
  were reordered without dropping any (kind 2, pure reorder).
- **Voiced frustration.** Set this flag only when the user expressed a **blanket negative
  judgment about a phase's existence or utility** — e.g. "this phase is always unnecessary," "we
  never do this," "why is this even here." A merely **situational** override ("skip it this
  time," "not now") is a normal directive override (kind 3) and does NOT set the flag.
- **Repeated.** A deviation counts as repeated when the **same kind** is logged two or more times
  in the run, OR the **same phase** is deviated from more than once (regardless of kind).

---

## Exit clauses

- If at any point the user signals they only wanted exploratory work (not a full pipeline run), exit cleanly:
  finish the current skill normally and skip all subsequent phases. The user can re-enter with `/workflow-start`
  later.
- If the user wants to stop at any phase boundary, acknowledge and preserve state. Work products created so far
  remain committed and available for resumption.
- However the run ends (full completion or a stop), run the **Workflow-fit suggestion** step
  below; it stays silent on exploratory, error, or freshly-scaffolded exits, gives a one-liner on
  an early stop, and otherwise applies its completion tiers.

---

## Workflow-fit suggestion (after the run ends)

Run this **once**, after the loop ends, against the deviation log. It is post-pipeline and
**never blocks completion** — the run's outputs/commits are already done; declining changes
nothing about the completed run.

**Decide the exit path first, in this order:**

1. **Exploratory exit → silent.** The user disclaimed the pipeline framing itself — they signaled
   (up front or at any point during the run, per the Exit clauses above) that they only wanted to
   explore/investigate and did not actually want a governed pipeline run. This is about expressed
   **intent**, not how many phases were touched. Stay silent. When it is ambiguous whether they
   disclaimed the pipeline or were genuinely running it and stopped, do NOT treat it as
   exploratory — fall through to early stop (4).
2. **Error/stuck exit → silent.** The run ended abnormally — a declared `Output` never
   materialized, a skill hard-failed, or the loop could not advance. The failure is the story —
   suppress the suggestion.
3. **Freshly-scaffolded file → silent.** If `WORKFLOW_FILE` was created by Step 0's missing-file
   scaffold path **in this same run**, suppress the suggestion — a skeleton the user has not
   authored yet is not a candidate for adjustment.
4. **Early stop → gentle.** The user was genuinely running the pipeline (did not disclaim it per
   1) and chose to stop partway at a phase boundary, including abandoning during a
   conditional-gate pause. Early stop is evaluated before tiering and **always yields the plain
   one-liner**, never the escalated prompt, regardless of what the log contains. Use the plain
   one-liner format and engagement protocol below, naming any logged deviations the same way the
   full-completion one-liner does.
5. **Full completion → tiered.** The pipeline reached its natural end (`current` became null).
   Apply the tiers below.

**Tiers (full completion only; read from the deviation log):**

- **Empty log → silent.** No deviations, no message. (The common case; keeps disciplined runs
  noise-free.)
- **Deviations present, none escalating → plain one-liner, non-blocking.** A single line naming
  what diverged and offering to fold it in — e.g. *"Heads up: this run skipped Phase 3 (Review)
  and added an ad-hoc hotfix step. Want to adjust `WORKFLOW_FILE` to match how you actually work?
  (reply to do it, or ignore this)."* The run just ends; ignoring it does nothing.
- **Escalation trigger present → dismissible `AskUserQuestion`.** Triggered when the log contains
  a **Repeated** deviation (same kind or same phase), a **major-severity** deviation, or a
  **voiced-frustration** flag. Present a soft prompt with explicit choices: **Update inline** /
  **Use `/workflow-capture`** / **No thanks**. "No thanks" is always present (one-step dismiss).

**If the user engages**, offer the two paths below. In the one-liner tier, a reply that clearly
expresses intent to update ("yes," "sure," "do it," "let's adjust," "ok let's do it") opens the
offer; anything else — an explicit decline ("no," "ignore," "skip"), a bare or ambiguous
acknowledgment ("ok," "got it"), or no reply — ends silently. In the prompt tier, the user picks
**Update inline** or **Use `/workflow-capture`**. Both paths target the file loaded at Step 0
(`WORKFLOW_FILE`).

Recommend **Update inline** when every proposed change is a confirmable diff over the existing
file — a single-field edit within a phase (one `Invoke`/`Output`/`Gate` value), or a clean
add/remove/reorder of whole phases. Recommend **`/workflow-capture`** when the change needs
authoring judgment beyond that — splitting a phase's responsibilities, introducing a conditional
`Route` table, redesigning a gate's condition, or broad restructuring. Both options stay
available; this only sets the default recommendation.

- **Update inline.** Summarize the logged deviations as concrete proposed edits to
  `WORKFLOW_FILE`, show them, and write them **only on explicit confirmation** — never silently.
  When the edits add, remove, or reorder phases, **renumber phases sequentially and rewire
  affected `Route` targets** (both routes that referenced a phase by number, which a renumber
  shifts, and any terminal route that should now chain into a new phase), and include the rewired
  routes in the diff shown for confirmation. On confirmation, commit to the **target project's**
  repo — stage only `WORKFLOW_FILE` (never `git add -A`, so unrelated working-tree changes are not
  swept in); if the tree carries unrelated uncommitted changes that prevent a clean single-file
  commit, write the file without committing and tell the user. No Claude co-author; a non-git
  project → write without committing and say so. This commit is unrelated to this plugin's own
  versioning.
- **Use `/workflow-capture`.** Point the user to run `/workflow-capture`; since `WORKFLOW_FILE`
  already exists, capture's Stage 4 will offer to update/augment it interactively (there is no
  `--augment` flag — it is a choice inside the command). Capture works from the **in-context
  conversation**: it re-analyzes this conversation (which already contains this run and its
  deviations) and interactively folds them in. The engine does not hand capture a deviation log
  or a pre-built diff; it simply hands off, and the user runs capture.

---

## Embedded starter skeleton (missing-doc scaffold ONLY)

Use this **only** when Step 0 found no `WORKFLOW_FILE` (the resolved path) and the user chose to scaffold. It is a minimal,
two-phase illustration of the directive format — the user fills in their real pipeline. (Projects that already
have a `docs/WORKFLOW.md` never touch this.)

````markdown
# <Project> Workflow

This document is the executable pipeline for this project. Each phase's prose is the human reference; the
**Orchestrator directives** subsection is authoritative for control flow.

## Phase 1 — <name>
<prose describing what this phase is and any project conventions>

**Orchestrator directives**
- Invoke: <skill, or `none` for an orchestrator-run action>
- Suppress: <optional — if the invoked skill tries to hand off to a next step, what to ignore>
- Pre: <optional — orchestrator steps before Invoke>
- Post: <optional — orchestrator steps after Invoke / on confirmation>
- Output: <artifact path + commit message, or `none`>
- Gate: <`none` | `USER CONSENT REQUIRED: …` | `USER CONSENT REQUIRED when <condition>: …`>
- Route: Phase 2

## Phase 2 — <name>
<prose>

**Orchestrator directives**
- Condition: <optional predicate; if false, skip to Route default>
- Invoke: none (orchestrator presents an inline brief / asks the user)
- Output: none
- Gate: USER CONSENT REQUIRED — <what the user must explicitly approve; positive tone ≠ consent>
- Route: <next phase, or a conditional table keyed on the user's answer>
````

---

## Directive field reference

Each phase in a project's `docs/WORKFLOW.md` declares an **Orchestrator directives** subsection. Fill every
*applicable* field (`Condition`, `Suppress`, `Pre`, `Post` are optional):

| Field | Meaning |
|---|---|
| `Condition` | Optional predicate (e.g. `lane == UI whole-feature`); if false, skip the phase to its Route default. Evaluated at the top of the phase. |
| `Invoke` | Skill(s) to call, in order; or `none` (orchestrator performs the prose-described action itself). |
| `Suppress` | Optional. The load-bearing seam override: ignore the invoked skill's own next-step / terminal instruction. |
| `Pre` | Optional. Orchestrator-run steps **before** Invoke (tool install, cred probe, "drop auto mode first"). |
| `Post` | Optional. Orchestrator-run steps **after** Invoke / on user confirmation (e.g. save a produced brief). |
| `Output` | Required artifact (path + commit), or `none` for inline-only phases. When non-`none`, it is the advance-blocker. |
| `Gate` | `none` \| `USER CONSENT REQUIRED: …` \| conditional `USER CONSENT REQUIRED when <condition>: …` (evaluated post-Invoke). |
| `Route` | Next phase, or a conditional table keyed on lane/verdict. |
