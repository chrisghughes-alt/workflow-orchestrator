# Workflow Capture — Distill a Session into a Reusable Pipeline

This command turns the **current Claude session** into a project `WORKFLOW.md` that
`/workflow-start` can later execute. It is the authoring half of the loop: `workflow-capture`
writes a pipeline, `workflow-start` runs it.

It is **self-contained**. It depends on nothing outside this plugin or the target project, and
it never delegates to another skill. It only ever drives the user through a structured
interview and, at the end, writes one Markdown file.

## What "the session" means

This command reads the **current in-context conversation only** — the transcript present in
your context window right now. It does **not** load prior sessions or read transcript files.

- **Compacted context:** if earlier work was summarized away, Stage 1 will under-detect
  phases. Say so, and offer the user a chance to paste or re-summarize the missing steps
  before continuing.
- **Mid-session use:** you capture the session *so far*. Phases not yet run won't appear. Note
  this and remind the user they can re-run later and choose **augment** (Stage 4) to add
  phases discovered afterward.

This command **never** invents phases or fabricates artifacts to look complete.

---

## Stage 1 — Analyze the session

Review the current conversation and extract a **candidate** pipeline: the distinct units of
work that happened, in order. For each candidate phase, infer the engine's directive fields
(the same vocabulary `/workflow-start` parses):

- `Invoke` — the skill or orchestrator action that drove the phase (`none` if you, the
  orchestrator, performed it directly rather than invoking a skill).
- `Output` — the artifact the phase produced (file path + commit message), or `none`.
- `Gate` — whether a human approval happened, and whether it should become a consent gate.
- `Route` — what came next, including any branch points seen in the session.

Also flag where the session was **ad hoc**: steps with no clear output, approvals that
happened informally, phases that blurred together.

Present the candidates as a **concise numbered summary** — not a finished file — and clearly
label which fields are confidently inferred vs. uncertain guesses. Write nothing in this stage.

**Degenerate-session guard.** If you find no meaningful multi-step structure (purely
exploratory, or one/zero distinct phases), say so plainly and use `AskUserQuestion` to offer:
(a) abort, or (b) hand-author from the engine's starter skeleton instead. Do **not** emit a
trivial one-phase file or fabricate phases.

**Zero-artifact sessions are legal.** A session that produced no files yields phases with
`Output: none` — the engine explicitly allows this. Do not manufacture outputs to satisfy a
"prefer a concrete output" preference; `none` is an honest, valid result.

---

## Stage 2 — Offer reference material (optional)

Before authoring, use `AskUserQuestion` to ask whether to pull in reference material to inform
the workflow. Offer two sources (multi-select; either, both, or neither). **Only read and
summarize — never modify** memories or docs. If the user declines both, proceed with
session-only context.

1. **Project `CLAUDE.md` + `docs/`.** Read from the project root. Surface conventions, rules,
   and any existing pipeline patterns so the proposed workflow aligns with documented
   standards.

2. **Claude memory directory.** This is the file-based memory (`MEMORY.md` index + per-fact
   files). Its absolute path is user- and project-specific, so probe the **conventional
   location** first:
   `~/.claude/projects/<project-slug>/memory/MEMORY.md`, where `<project-slug>` is the
   working-directory path with path separators, drive colons, and spaces all replaced by
   hyphens (e.g. `C:\VS Code Projects\workflow-orchestrator` →
   `c--VS-Code-Projects-workflow-orchestrator`; match the drive letter case-insensitively).
   If that file is not found, ask the user to confirm or point to the directory rather than
   guessing further. Once located, read `MEMORY.md` and surface the `feedback` and `project`
   memories (identified by each fact file's `metadata.type` frontmatter) so established
   preferences, gates, and constraints get baked into the workflow.

---

## Stage 3 — Interactive per-phase authoring (the core)

Walk the candidate phases **one at a time**. This stage is deliberately interactive: every
meaningful decision is the user's. For each phase, present the inferred draft and use
`AskUserQuestion` for the structured decisions:

- **Keep / merge / split / drop** this phase (resolves Stage 1 blurring).
- **`Invoke`** — which skill(s), or an orchestrator action (`none`). Propose what the session
  used. **Skill check:** compare each proposed skill name against the available-skills list in
  your system context; if a name isn't there, flag it as possibly-uninstalled. If no reliable
  list is available, downgrade to flagging any skill name that was **not actually invoked**
  during the captured session.
- **`Output`** — artifact path + commit message, or `none`. Prefer a concrete output where the
  session produced one (it is the engine's advance-blocker), but accept `none` honestly per
  Stage 1.
- **`Gate`** — `none` / unconditional `USER CONSENT REQUIRED` / conditional
  `USER CONSENT REQUIRED when <condition>`. Proactively suggest a gate for any irreversible or
  outward-facing action you saw in the session (merge, push, deploy, delete).
- **`Route`** — next phase, or a conditional table keyed on a lane/verdict. Session branch
  points become routing options.
- **`Condition` / `Pre` / `Suppress` / `Post`** — offer these only when relevant; do not ask
  about them rote.

After the per-phase pass, show the **assembled phase list** end-to-end (numbered names +
one-line directive summaries). Let the user edit it by **free-text instruction** ("swap 2 and
3", "delete 4", "insert a review phase after 2"). A reorder/delete updates the list in place;
an **insert re-enters this Stage 3 per-phase loop** for the new phase, then returns to the
assembled view. Write nothing until the user confirms the final ordering.

---

## Stage 4 — Naming & existing-file handling

Resolve the target path:

1. Check whether `docs/WORKFLOW.md` exists.
   - **It does not** → the target is `docs/WORKFLOW.md` (no question needed).
   - **It does** → use `AskUserQuestion`: *update/augment the existing one* or *create a new
     one*. If **new**, ask what to call it and normalize to `docs/<slug>-WORKFLOW.md`, where
     `<slug>` is the kebab-cased name the user gave (lowercase, hyphen-separated) and
     `-WORKFLOW.md` is constant.
2. **Re-check the chosen path.** Whatever target you resolved in step 1 (default *or*
   user-named), check whether that exact file already exists. If it does and it is not the
   file the user just chose to augment, return to the *augment vs. rename* decision — **never
   silently overwrite** an existing file in Stage 5.

**Augment (merge) semantics.** When merging captured phases into an existing workflow file:
append the new phases after the existing ones, renumber all phases sequentially, and **rewire
any `Route` targets** in existing phases that should now point at inserted phases (routes name
phases by number/name, so an insert without rewiring breaks the pipeline). Present a
before/after phase list and the list of rewired routes for explicit confirmation before
writing.

---

## Stage 5 — Write & commit

Render the confirmed phases into the **exact shape `/workflow-start` parses**:

- Each phase is a `## Phase N — <name>` heading.
- Under it, human-readable prose, then a literal `**Orchestrator directives**` bullet list
  carrying the applicable fields (`Condition` / `Invoke` / `Suppress` / `Pre` / `Post` /
  `Output` / `Gate` / `Route`).

The engine keys its parse off the `##` phase headings and the literal `**Orchestrator
directives**` label, so both are mandatory.

Begin the file with a one-paragraph preamble like the examples: state that the prose is the
human reference and the **Orchestrator directives** subsection is authoritative for control
flow.

Then handle version control by environment:

- **Project is a git repo** → write the file and commit it. Do **not** add a Claude co-author
  line. The commit is the engine's ground-truth output signal.
- **Not a git repo (or nothing stageable)** → write the file without committing, tell the user
  it was written but not committed, and offer to `git init`. Do not fail.

Writing the file **is** the deliverable. Do **not** auto-run the pipeline.

---

## Stage 6 — Tell the user how to run it

After writing, print the exact invocation, in the namespaced form that matches the installed
plugin:

- Default file: `/workflow-orchestrator:workflow-start <work description>`
- Named file: `/workflow-orchestrator:workflow-start --file docs/<name>-WORKFLOW.md <work description>`

Remind the user that selecting a non-default workflow is done by passing that exact `--file`
path — there is no picker.
