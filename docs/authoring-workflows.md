# Authoring a project `docs/WORKFLOW.md`

`/workflow-start` is an **engine**. It knows nothing about your project. At runtime it reads
`docs/WORKFLOW.md` from the project you run it in, parses each phase, and drives the phases in order
under a fixed set of binding rules. All the project-specific content — which phases exist, what skills
they invoke, what they output, what gates they enforce — lives in *your* `docs/WORKFLOW.md`.

This guide explains how to write that file. For the engine's own rules, read
[`../commands/workflow-start.md`](../commands/workflow-start.md).

## The mental model

```
/workflow-start <work description>
   → reads <your-project>/docs/WORKFLOW.md
   → parses each phase's "Orchestrator directives"
   → loop per phase: Condition → Pre → Invoke → Suppress → Post → Output → Gate → Route
```

The engine supplies *discipline*: it forces phases to run in order, produce their declared outputs,
honor their gates, and keep control even when an invoked sub-skill tries to decide what happens next.

## File shape

A `WORKFLOW.md` is human-readable prose plus, for each phase, an **Orchestrator directives** subsection
that is authoritative for control flow:

```markdown
## Phase 1 — <name>
<prose describing what this phase is and any project conventions>

**Orchestrator directives**
- Invoke: <skill, or `none` for an orchestrator-run action>
- Suppress: <optional — what to ignore if the invoked skill tries to hand off>
- Pre: <optional — orchestrator steps before Invoke>
- Post: <optional — orchestrator steps after Invoke / on confirmation>
- Output: <artifact path + commit message, or `none`>
- Gate: <`none` | `USER CONSENT REQUIRED: …` | `USER CONSENT REQUIRED when <condition>: …`>
- Route: Phase 2
```

## Directive fields

| Field | Meaning |
|---|---|
| `Condition` | Optional predicate (e.g. `lane == UI whole-feature`); if false, skip the phase to its `Route` default. Evaluated at the top of the phase. |
| `Invoke` | Skill(s) to call, in order; or `none` (the orchestrator performs the prose-described action itself). |
| `Suppress` | Optional. The load-bearing seam override: ignore the invoked skill's own next-step / terminal instruction so control returns to the engine. |
| `Pre` | Optional. Orchestrator-run steps **before** Invoke (install a tool, probe credentials, "drop auto mode first"). Order-sensitive. |
| `Post` | Optional. Orchestrator-run steps **after** Invoke / on user confirmation (e.g. save a produced brief to an artifact path). |
| `Output` | Required artifact (path + commit), or `none` for inline-only phases. When non-`none`, it is the advance-blocker: the engine will not move on until the file exists and its commit is present. |
| `Gate` | `none`, an unconditional `USER CONSENT REQUIRED: …`, or a conditional `USER CONSENT REQUIRED when <condition>: …` evaluated after Invoke. |
| `Route` | The next phase, or a conditional table keyed on a lane/verdict captured earlier. |

## The four binding rules (always in force)

1. **The engine supersedes sub-skill terminal states.** When a phase says STOP or "control returns
   here," that wins over the invoked sub-skill's own next-step instruction.
2. **Phases run in the order the pipeline defines.** No skipping/reordering/combining unless a
   `Condition` excludes a phase.
3. **Every phase with a declared `Output` must produce it** before the engine advances (file on disk +
   commit, or the declared inline deliverable). `Output: none` advances without an artifact.
4. **`USER CONSENT REQUIRED` gates need explicit approval.** Positive conversational tone
   ("looks good", "nice") is never consent.

## Gates

- `Gate: none` — proceed automatically.
- `Gate: USER CONSENT REQUIRED: merge <branch> into main` — the engine blocks and must ask for an
  explicit yes on *that specific action* before continuing.
- `Gate: USER CONSENT REQUIRED when <condition>: …` — the engine evaluates `<condition>` after Invoke;
  it blocks only when the condition holds, but blocks just as hard when it does.

Put irreversible or outward-facing actions (merge, push, deploy, deletion) behind explicit gates.

## Routing

`Route` can be a single next phase or a conditional table. A table is keyed on something captured
earlier in the run (commonly a "lane" set in a classification phase):

```markdown
- Route:
  - lane == UI whole-feature → Phase 2b
  - lane == bugfix → Phase 5
  - default → Phase 3
```

## Multiple workflows in one project

A project can hold more than one pipeline. The default file `/workflow-start` runs is `docs/WORKFLOW.md`.
To keep additional pipelines side by side, name them `docs/<slug>-WORKFLOW.md` (kebab-case slug, constant
`-WORKFLOW.md` suffix) — e.g. `docs/payments-WORKFLOW.md`, `docs/release-WORKFLOW.md`.

Select a non-default workflow at run time by passing a **leading** `--file` argument:

```text
/workflow-start --file docs/payments-WORKFLOW.md add refund support
```

Everything after the path is the work description. With no `--file`, the engine runs `docs/WORKFLOW.md`.
There is no registry or picker — you select a workflow by passing its exact path. The
`/workflow-orchestrator:workflow-capture` command can generate these files for you from a finished session.

## Getting started

1. Copy [`../examples/minimal-WORKFLOW.md`](../examples/minimal-WORKFLOW.md) to your project's
   `docs/WORKFLOW.md`.
2. Replace the placeholder phases with your real pipeline.
3. Run `/workflow-start <what you want to build>`.

If you run `/workflow-start` in a project with no `docs/WORKFLOW.md`, the engine offers to scaffold a
starter for you.

See the [`../examples/`](../examples/) folder for a generic minimal pipeline and two real, more
elaborate ones.
