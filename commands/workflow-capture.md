---
description: Review the current session and interactively turn it into a docs/WORKFLOW.md (or a named docs/<slug>-WORKFLOW.md) that /workflow-start can run.
---

# Workflow Capture — Distill a Session into a Reusable Pipeline

This command turns the **current Claude session** into a project `WORKFLOW.md` that
`/workflow-start` can later execute. It is the authoring half of the loop: `workflow-capture`
writes a pipeline, `workflow-start` runs it.

It is **self-contained**. It depends on nothing outside this plugin or the target project, and
it never delegates to another skill. It only ever drives the user through a structured
interview and, at the end, writes one Markdown file.

## What "the session" means

This command reads the **current in-context conversation** — the transcript present in your
context window right now — **and** the **hand-off files** the context watch produced for this
run (Stage 0). It does **not** load prior sessions or read transcript files.

- **Compacted context:** if earlier work was summarized away, Stage 1 will under-detect
  phases. Say so, and offer the user a chance to paste or re-summarize the missing steps
  before continuing.
- **Cleared context:** if the context watch cleared the session during the run, the earlier
  part of the session is in the hand-offs, which Stage 0 reads. Without them the capture
  covers only the part since the last clear; say so.
- **Mid-session use:** you capture the session *so far*. Phases not yet run won't appear. Note
  this and remind the user they can re-run later and choose **augment** (Stage 4) to add
  phases discovered afterward.

This command **never** invents phases or fabricates artifacts to look complete.

---

## Stage 0 — Gather the hand-offs

When the context watch clears a session mid-run, the work before the clear survives only in
the **hand-off** files it had the session write. Gather them before analyzing anything.

1. **Find the run folder.** If the context holds a prompt starting
   `[HR] Successor start. Read <path>`, the hand-offs folder is the folder of that path; use
   it without asking. Otherwise, or if that folder is missing or holds no `.md` files, glob
   `<project root>/.runs/*/handoffs/*.md`. If that finds hand-offs, use `AskUserQuestion` to
   ask which run this session was, **even when only one run folder is found**: a lone folder
   may be an old, unrelated run. List each folder with its newest file's date, and always
   include a **none of these** option. If the glob finds none, or the user picks **none of
   these**, say "No hand-offs found; capturing from the context window only" and go to
   Stage 1.
2. **Read every hand-off.** Read every `.md` file in the chosen folder, oldest first by
   modification time. Ignore files that do not end in `.md`; the folder may hold a `.keep`
   placeholder.
3. **Take the phase lines.** From each, take the section headed **Phases run so far**. The
   primary record is the hand-off the resume prompt names, when one is in context and that
   file is in the chosen folder; otherwise it is the newest hand-off in the chosen folder that
   has a **Phases run so far** section. Each hand-off carries the previous lines forward, so an
   older hand-off belongs to this run only when its phase lines appear, in order, at the start
   of the primary's section, allowing its last line to differ in what it says was done, as long
   as it names the same phase (a phase in progress at that hand-off was rewritten later). Older hand-offs that belong may fill gaps or check order. Any
   other hand-off in the folder with that section is from another run, since the default
   folder is shared by every watch in the project: name it as "from another run, not used" and
   take nothing from it.
4. **Older hand-offs.** A hand-off with no **Phases run so far** section was written by an
   older release. Name it and say its phases cannot be recovered from it; do **not** infer
   phases from its other sections.
5. **Say what was read.** Tell the user which files were read and which were set aside as from
   another run, one line each, before Stage 1 begins.

---

## Stage 1 — Analyze the session

Review the current conversation, together with the phase lines gathered in Stage 0, which come
first in order, and extract a **candidate** pipeline: the distinct units of work that
happened, in order. For each candidate phase, infer the engine's directive fields (the same
vocabulary `/workflow-start` parses):

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
   `~/.claude/projects/<project-slug>/memory/MEMORY.md` — expand `~` to the user's home
   (`%USERPROFILE%` on Windows, `$HOME` elsewhere) and probe with Glob/Read using an absolute
   path, since a literal `~` will not resolve. The `<project-slug>` is the working-directory
   path with path separators, drive colons, and spaces all replaced by hyphens per character,
   so the leading `C:\` becomes `c--` (no leading hyphen) and any resulting double hyphens are
   preserved, not collapsed. Example: `C:\VS Code Projects\workflow-orchestrator` →
   `c--VS-Code-Projects-workflow-orchestrator` (match the drive letter case-insensitively).
   If that file is not found, ask the user to confirm or point to the directory rather than
   guessing further. Once located, read `MEMORY.md` and surface the `feedback` and `project`
   memories (identified by the `type:` frontmatter field in each fact file) so established
   preferences, gates, and constraints get baked into the workflow.

---

## Stage 3 — Interactive per-phase authoring (the core)

Walk the candidate phases **one at a time**. This stage is deliberately interactive: every
meaningful decision is the user's. For each phase, present the inferred draft and use
`AskUserQuestion` for the structured decisions:

- **Keep / merge / split / drop** this phase (resolves Stage 1 blurring).
- **`Invoke`** — which skill(s), or an orchestrator action (`none`). Propose what the session
  used. **Skill check:** if a proposed skill name does not appear in the available-skills list
  in your system context, flag it as possibly-uninstalled; additionally flag any skill name
  that was **not actually invoked** during the captured session.
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
   file the user just chose to augment, return to the *augment vs. rename* decision, so Stage 5
   only ever writes a path the user has explicitly accepted.

**Augment (merge) semantics.** When merging captured phases into an existing workflow file:
append the new phases after the existing ones, renumber all phases sequentially, and **rewire
`Route` targets** accordingly — both any route that referenced a phase by number (renumbering
shifts the target) and any existing terminal route (e.g. the previously-last phase's `Route`)
that should now flow into the appended phases. Present a before/after phase list and the list
of rewired routes for explicit confirmation before writing.

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
- Named file: `/workflow-orchestrator:workflow-start --file docs/<slug>-WORKFLOW.md <work description>`

Remind the user that selecting a non-default workflow is done by passing that exact `--file`
path — there is no picker.
