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

`$ARGUMENTS` — the work description (feature, bug, or change to start the pipeline on). If empty, ask the user
to describe the work before Step 0.

---

## Step 0 — Load the project pipeline

**Action:** Use the Read tool to read `docs/WORKFLOW.md` (relative to the current project root) **in full**, NOW,
before anything else.

- **If it exists:** hold it in context. It defines every phase, gate, artifact path, and convention for THIS
  project's pipeline. The phase prose is the human/sub-agent reference; each phase's **Orchestrator directives**
  subsection is authoritative for control flow. You need the whole file in context to execute correctly.
- **If it is missing:** STOP. Tell the user plainly that this project has no pipeline definition
  (`docs/WORKFLOW.md` not found). Use `AskUserQuestion` to offer: **(a)** scaffold a starter `docs/WORKFLOW.md`
  from the embedded skeleton below for them to customize, or **(b)** abort. **NEVER** fall back to another
  project's phases or invent a pipeline — a missing definition means there is no pipeline to run.

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
  c. INVOKE — call current.Invoke skill(s), in the order listed, with $ARGUMENTS / accumulated context. If
     Invoke is `none`, perform the orchestrator action the phase's prose describes (e.g. present an inline
     brief, ask an AskUserQuestion).
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

## Exit clauses

- If at any point the user signals they only wanted exploratory work (not a full pipeline run), exit cleanly:
  finish the current skill normally and skip all subsequent phases. The user can re-enter with `/workflow-start`
  later.
- If the user wants to stop at any phase boundary, acknowledge and preserve state. Work products created so far
  remain committed and available for resumption.

---

## Embedded starter skeleton (missing-doc scaffold ONLY)

Use this **only** when Step 0 found no `docs/WORKFLOW.md` and the user chose to scaffold. It is a minimal,
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
