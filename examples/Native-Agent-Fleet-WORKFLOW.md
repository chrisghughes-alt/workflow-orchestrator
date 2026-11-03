# <Project> Fleet Workflow (named background agents)

This document is the executable pipeline for running one or more work items across **long-lived named
background agents**, started with Claude Code's own `Agent` tool. The main session is the
**orchestrator**: it dispatches, verifies and rules, and does no heavy work itself. The
`workflow-orchestrator` plugin supplies the window onto the fleet (the Agents pane and the
`mcp__workflow-orchestrator__agents` tool) and the context watch that hands the orchestrator over to a
fresh context when its own fills up.

`/workflow-start --file docs/<this file> <work items>` drives this file phase by phase. Each phase's
prose is the human and agent reference; its **Orchestrator directives** subsection is authoritative for
control flow.

**Slots.** Everything marked `<slot: …>` is something your repository supplies. Fill each one before
the first run, or delete the sentence that holds it if it does not apply. The slots are:

- `<slot: methodology document>`: the workflow that says what happens *inside* one work item (spec
  shape, review protocol, test rules, gate wording), for example your `docs/WORKFLOW.md`. This file
  says who runs which part, how items are coordinated, and where the orchestrator sits. Where the two
  conflict on fleet mechanics, this file wins; on methodology, the methodology document wins.
- `<slot: item tracker and id format>`: where work items live and how they are named.
- `<slot: branch, worktree and environment naming>`: how one item's branch, worktree, and any
  container, port or database are named.
- `<slot: review chain>`: who reviews an item's work, and in what order.
- `<slot: verification gates>`: the build, test and lint commands an item must pass.
- `<slot: merge and push gates>`: how work reaches your default branch and your remote.
- `<slot: model tiers>`: which model runs the orchestrator, each role agent, and their helpers.

---

## Division of authority

The person keeps: the run plan (which items, what order), product rulings, merge consent, and push
consent. `<slot: anything else your team keeps with the person>`. Everything else is delegated to the
orchestrator, including spec and plan approval on the person's behalf, review dispositions that do not
change product behaviour, and answering agents' questions that the code or the documents already
settle.

One more party exists: the plugin's **context watch** (also shown as "HR" in the pane header). It is
not an agent. Its only authority is the orchestrator's own context budget: at the threshold it asks the
orchestrator for a handoff, and then either waits for the person (`nudge` mode) or clears and resumes
the session itself (`auto` mode). It decides nothing else, and it watches only the session that armed
it.

## What the plugin gives the orchestrator

| Need | Mechanism |
|---|---|
| Start a role agent | `Agent({ name: '<role>-<item id>', model: '<slot: role model>', subagent_type: 'general-purpose', prompt: '<path to the brief file>' })`. It runs in the background. |
| Message an agent | `SendMessage({ to: '<name>', message })`. A send to an idle or finished name resumes it from its transcript. When a name is reused, the latest agent with it wins. |
| Agent messages the orchestrator | `SendMessage({ to: 'main', message: '[Role] …' })`, then the agent ends its turn. The reply arrives at its next tool round. |
| See the roster | `ListAgents` (the orchestrator only), the Agents pane, and `mcp__workflow-orchestrator__agents`, which returns one JSON row per agent: name, model, status, activity, tokens in and out, context size, timestamps. |
| Stop an agent | `TaskStop('<name>')` for a running agent. A finished agent needs no stop; it stays listed as idle. |
| Arm the context watch | `mcp__workflow-orchestrator__hr_watch({ runFolder, mode, workflowDoc })`; `mcp__workflow-orchestrator__hr_off()` turns it off. The person can use `/hr-watch` and `/hr-off` instead. |
| Hand over to a fresh context | `/clear` plus a resume prompt, run by the plugin in `auto` mode or by the person in `nudge` mode. See Orchestrator succession. |

## Run folder

Every run has a folder inside the repository, ignored by git, so it survives the session and any later
session finds it by path: `<repo>/.runs/<run-name>/`. It holds:

- `orchestrator-state.md`: the run-state file (see Fleet conventions).
- `briefs/`: every agent brief and task note.
- `reports/`: every report an agent writes.
- `handoffs/`: orchestrator and agent handoff documents.
- `<slot: anything else your runs keep, such as test credentials that must never be committed>`.

The session scratchpad is for throwaway files only.

---

## Fleet conventions (binding)

- **Agents are named background agents**, started by the orchestrator with the `Agent` call above.
  Names are lowercase and carry the item id on runs with more than one item (`planner-<id>`,
  `review-<id>`). There are no tabs; the Agents pane lists every agent of the session.
- **The roster is flat.** Only the orchestrator starts named agents. A named agent that tries to start
  another named agent is refused. A named agent also has no `ListAgents` tool and no `AskUserQuestion`
  tool, so every question for the person goes through the orchestrator.
- **Every agent gets its brief as a file** in the run folder's `briefs/`, and the `Agent` call's
  prompt just points at it. A brief carries: the role and where its assignment ends ("your assignment
  ENDS at …"), rulings already made, the naming block from `<slot: branch, worktree and environment
  naming>`, required reading (sections of `<slot: methodology document>` and of the item's spec and
  plan), helper model rules from `<slot: model tiers>`, verification duties, the comms protocol below,
  and a fixed final-report format that includes a delegation ledger. Use absolute paths in briefs.
- **Comms protocol.** An agent messages the orchestrator with `SendMessage` to `main`, then ends its
  turn. The orchestrator replies by name. No polling and no re-sends. Being blocked and asking is a
  good outcome; a guessed answer is not.
- **Disk over notice.** Agents write reports and deliverables to files and reply with the path. The
  orchestrator reads the file and checks it against `git log`, `git status`, `git show --stat` and test
  output before acting. A reply's text, or the text inside the engine's idle notice when an agent
  finishes, is a notice, not evidence.
- **The orchestrator does no heavy work itself.** Reading artifacts in full at approval points, quick
  check greps and short verification commands are its job. Authoring, coding and long test runs are
  dispatched.
- **Role agents delegate mechanical work** to short-lived helpers. A role agent's helpers are
  **unnamed and run in the foreground**: the role agent waits until each helper returns, and the
  helper's answer comes back in the `Agent` tool result. Several helpers go in one message only when
  they are independent, and the role agent then waits for all of them. A role agent has no background
  option for its helpers. The role agent reads the helpers' reports, verifies them against git and
  test output, and rules. Small edits inline are fine; a whole chunk's worth is not. The final report's
  delegation ledger has one line per dispatched task: model, task, and resulting commit.
- **Worktrees.** `<slot: where your worktrees live and how they are named>`. If your tooling expects
  worktrees somewhere other than `.claude/worktrees/`, do not pass `isolation: 'worktree'` to the
  `Agent` tool; create the worktree yourself and give its absolute path in the brief.
- **Modes reach every agent.** The session's permission mode and plan mode apply to every agent in the
  tree. The orchestrator never enters plan mode mid-run, because every live agent would enter it too.
  Leaving auto mode before a push changes every live agent's mode as well, so a push happens with no
  agents running: each one has finished or been stopped first.
- **Heartbeat (every 30 minutes).** At Startup the orchestrator creates a recurring session cron with
  `CronCreate`. A session cron fires only while the session is idle, so the orchestrator ends its
  turns rather than waiting inside one, and it expires after seven days. On each tick the orchestrator
  calls `ListAgents` and `mcp__workflow-orchestrator__agents`, compares them with the run-state file's
  list of agents it expects to be working, and acts only when an agent is blocked, or silent with no
  report on disk (then it sends a liveness ping by name). The pane marks a running agent `⚠ silent`
  once it has been quiet for ten minutes, which is the first place to look. On the same tick the
  orchestrator records each active agent's context figure in the run-state file and recycles any agent
  past its threshold (see Agent recycling). A healthy tick writes one line.
- **Run-state file.** The orchestrator appends every ruling, dispatch, verification and hold to
  `<repo>/.runs/<run-name>/orchestrator-state.md` as it happens. It is the resume point, the
  heartbeat's source of truth, and the seed for the orchestrator's handoff. Keep it current enough to
  hand off from at any moment. It also records the watch mode, the workflow document path, and the
  recycle threshold for each role model.
- **Context watch.** Nothing happens until it is armed; the orchestrator arms it at Startup. At the
  threshold (default 50% of context used) the plugin submits one nudge asking the orchestrator to
  write a handoff file to `<run folder>/handoffs/orchestrator-handoff-YYYYMMDD-HHMM.md`, update
  `<run folder>/orchestrator-state.md`, do whatever this workflow requires at a handoff, and end its
  turn. A nudge is expected process, not an anomaly, and it is not a gate for the person. What happens
  next depends on the mode (see Orchestrator succession). The watch does not watch role agents; their
  budgets are the heartbeat's job.
- **Model tiers.** `<slot: model tiers>`: name the orchestrator's model, each role's model, the helper
  models for mechanical work and for work where the trap is in the test design, and when a helper is
  escalated to a stronger model.
- **Stop what you no longer use.** The orchestrator stops a running agent with `TaskStop('<name>')`
  once the run will not prompt it again: its chunk is closed and accepted (reports read from disk,
  commits verified from git), or it was recycled and its handoff file is verified. An agent held for a
  possible re-task stays addressable by name at no cost. Before every stop, confirm the agent's name
  and status with `ListAgents`; never stop by a remembered name alone. If a stop is denied, give the
  person the agent's name and the exact call, and move on. Never touch an agent the person started.

### Orchestrator succession (the watch reaches its threshold)

A long conversation degrades the way a whiteboard fills up: curated files on disk beat accumulated
history. So the run swaps to a fresh orchestrator context before automatic compaction can blur it. The
swap happens inside the same session, and role agents notice nothing beyond a pause in replies.

`/clear` keeps the background agents, the session crons and the roster. It resets the plugin's own
stored state. In `auto` mode the plugin writes the watch back right after its own clear; after a
person's `/clear` in `nudge` mode the watch stays off until the successor's `hr_watch` call arms it. Because the agents' names are
unchanged, every brief's `to: 'main'` still reaches the orchestrator after the swap.

1. **Nudge.** The plugin submits its nudge as the orchestrator's next prompt once the session is idle.
2. **Handoff, run-state update, end turn.** The orchestrator writes
   `<run folder>/handoffs/orchestrator-handoff-YYYYMMDD-HHMM.md` (read the clock for the stamp)
   holding: the run plan and the current phase of each item; every ruling so far; every active agent
   (name, brief path, which report is expected next); dispatches in flight and the evidence that will
   close each; open questions for the person; paths to the run-state file and every brief; and, last,
   a section headed **Next three actions**. Anything half-verified is recorded as unverified, not
   finished in a hurry. It appends the handoff path to the run-state file, does
   `<slot: whatever else your methodology requires at a handoff, such as committing a tracker
   section>`, and ends its turn.
3. **Clear and resume.** Once the turn has ended and the new handoff file exists:
   - in `auto` mode the plugin runs `/clear` and submits the resume prompt itself;
   - in `nudge` mode the pane header shows `HR ready`, and the person runs `/clear` and submits the
     resume prompt by hand when they are ready.

   The resume prompt names the handoff file, the run-state file and this document; tells the successor
   to re-create the heartbeat cron only if it is gone; tells it to call `hr_watch` with the same
   arguments; and tells it to continue from the handoff's **Next three actions**.
4. **Successor start.** The successor reads the handoff, the run-state file and this document in
   full. It checks `CronList` and re-creates the heartbeat only if it is missing, calls
   `mcp__workflow-orchestrator__hr_watch` with the same run folder, mode and workflow document, and
   confirms `HR auto` or `HR nudge` in the pane header.
5. **Recover messages.** The successor does not wait for completion messages that may have landed
   during the swap: it runs `ListAgents`, reads each active agent's latest report from disk, and reads
   any messages queued for it.
6. **Record.** The run-state file gets a succession entry with the handoff path and the time.

### Agent recycling (a role agent past its threshold)

State the recycle threshold in **tokens**. The roster tool's per-agent context window may report the
main session's window rather than the agent's own, so treat the pane's per-row percent as a hint. At
Startup the orchestrator derives the threshold once per role model, for example 60% of the window that
`/context` reports in a session on that model, and writes it in the run-state file. The engine compacts
an agent on its own when the agent's window fills, so the threshold must sit below that line: recycle
an agent before the engine summarizes it.

When the heartbeat finds a role agent past its threshold, the orchestrator has it **finish its current
unit of work, not its whole chunk**, and then replaces it. A recycle is not a gate for the person and
not a plan deviation.

1. **Finish the unit.** The unit is the smallest step that leaves a clean tree and a report on disk:
   the commit in progress, the current review round with its fix-up commits, the current check with
   its report written. No new unit starts.
2. **Handoff file.** The agent writes `<run folder>/handoffs/<role>-<id>-handoff-YYYYMMDD-HHMM.md`:
   what is done (with commit hashes), what comes next, rulings received, anything the brief did not
   foresee, and paths to every artifact. It replies with the path and ends its turn.
3. **Verify.** The orchestrator checks the handoff against `git log`, `git status` and the reports on
   disk.
4. **Replace.** The orchestrator confirms the agent with `ListAgents`, stops it with `TaskStop`, and
   starts a fresh agent of the same role, the same model and **the same name**, so the routing in every
   brief keeps working. Its prompt points at the original brief and the handoff file and says exactly
   where to resume.
5. **Record.** A run-state entry: the old agent, its context figure, the handoff path, and the time.

---

## Startup

Before any item work, the orchestrator:

1. creates `<repo>/.runs/<run-name>/` with `orchestrator-state.md`, `briefs/`, `reports/` and
   `handoffs/` if they are absent, and records that this file was chosen for the run;
2. leaves the Agents pane to open by itself when the first background agent appears (a model cannot
   run a slash command; the person can open it earlier with `/agent-sidebar`);
3. arms the context watch by calling
   `mcp__workflow-orchestrator__hr_watch({ runFolder: '<absolute run folder>', mode: '<nudge|auto>', workflowDoc: '<absolute path to this file>' })`
   (`auto` for an autonomous run, `nudge` when the person is at the keyboard and wants to read the
   handoff first; `nudge` when the person has not said), confirms `HR auto` or `HR nudge` in the pane
   header, and records the mode in the run-state file;
4. creates the 30-minute heartbeat cron;
5. derives the recycle threshold in tokens for each role model and records it.

The person can change the watch at any time with `/hr-watch <run folder> [nudge|auto]` or `/hr-off`.
Startup is not a phase of its own; Phase 1's `Pre` step performs it.

---

## Phase 1 — Assignment and run plan

The person names the work items from `<slot: item tracker and id format>`. The orchestrator checks each
item for readiness (open product decisions, overlap in files with other items, anything that forces an
order) and proposes a **run plan**: the order, what runs at the same time, what is blocked, the naming
block for each item, and the watch mode.

When items run at the same time, sequence them by correctness only: files they both touch, shared
resources, and the default branch. Only one agent at a time commits to a shared branch. The first item
ready merges first; every later item then takes the updated default branch in and re-runs its gates
before its own merge.

**Orchestrator directives**
- Pre: perform Startup (run folder, run-state file, `hr_watch` with `runFolder`, `mode` and
  `workflowDoc`, heartbeat cron, recycle thresholds); record all of it in the run-state file
- Invoke: none (the orchestrator reads the items, reasons about overlap, and drafts the run plan)
- Output: none (the run plan is presented inline and recorded in the run-state file)
- Gate: USER CONSENT REQUIRED — the person approves the run plan (items, order, concurrency, watch
  mode) before any item starts. Naming the items is not yet consent to the plan.
- Route: Phase 2

## Phase 2 — Item setup (per item)

The orchestrator appends the item to the run-state file, writes the planner brief in `briefs/`
(assignment ends when the plan is committed; rulings already made; the naming block; required reading;
helper rules; report format), and starts the planner agent with its prompt pointing at the brief.

**Orchestrator directives**
- Condition: no other item's planner is committing to the same shared branch
- Invoke: none (`Agent({ name: 'planner-<id>', model: '<slot: role model>', subagent_type: 'general-purpose', prompt: '<path to the brief file>' })`)
- Output: the brief file in the run folder (ignored by git, not committed)
- Gate: none
- Route: Phase 3

## Phase 3 — Planning chunk

The planner runs the planning phases of `<slot: methodology document>` through the
`workflow-orchestrator:workflow-start` skill with `--file <slot: methodology document>`, stopping where
its brief says its assignment ends. Questions route to the orchestrator, who answers from the code and
documents or relays genuine product questions to the person. The orchestrator approves the spec and
the plan on the person's behalf only after reading each **in full** and checking the claims they rest
on against the code.

**Orchestrator directives**
- Invoke: none (the planner agent invokes the methodology; the orchestrator supervises)
- Suppress: the planner's run is bounded; it must not enter implementation. Control returns to this
  pipeline when the plan commit is verified
- Output: spec and plan commits (verify hashes, a clean tree and file contents from git, never from the
  report)
- Gate: orchestrator approval of spec and plan (delegated; not a gate for the person)
- Post: stop the planner with `TaskStop` if the run will not prompt it again, after confirming it with
  `ListAgents`
- Route: Phase 4

## Phase 4 — Implementation chunk

An implementer agent works through the plan task by task, **strictly in order**, handing each task to a
short-lived helper and checking each result itself: the commit exists and touches only the task's
files, the tree is clean, and the failing-test evidence shows the value before the fix. It stops and
asks rather than improvising when the plan cannot be carried out as written. The orchestrator then
verifies the branch independently against `<slot: verification gates>`.

**Orchestrator directives**
- Invoke: none (the orchestrator briefs and starts `implementer-<id>`, then verifies)
- Output: the implemented branch, one commit per task, named per `<slot: branch, worktree and
  environment naming>`
- Gate: none (plan deviations are ruled by the orchestrator; scope growth, such as a new dependency or a
  schema change the plan lacks, goes to the person)
- Post: stop the implementer with `TaskStop` if the run will not prompt it again, after confirming it
  with `ListAgents`
- Route: Phase 5

## Phase 5 — Review chunk

A review agent runs `<slot: review chain>` on the branch, applies fixes through helpers, re-checks each
fixed finding, and re-runs `<slot: verification gates>` itself. Its brief lists every deviation the
orchestrator already ruled during Phase 4, so the review does not raise them again. Findings that need
a ruling go to the orchestrator; findings that change product behaviour go to the person. A reviewer
inside the review agent runs as an unnamed foreground helper, so the review agent waits for every
report before it gives a verdict.

**Orchestrator directives**
- Invoke: none (the orchestrator briefs and starts `review-<id>`, rules on findings, verifies from
  disk)
- Output: none required (fix commits on the branch when findings were resolved that way)
- Gate: USER CONSENT REQUIRED when a critical finding remains after its fix, or when a proposed fix
  would change product behaviour the person ruled
- Post: stop the review agent with `TaskStop` if the run will not prompt it again, after confirming it
  with `ListAgents`
- Route: Phase 6

## Phase 6 — Verification chunk

`<slot: how your project verifies a change end to end, for example an automated browser run against a
built copy of the app, plus a short brief for the person's own manual check>`. The verification agent
checks its own helpers' claims against the evidence they produced before it reports.

**Orchestrator directives**
- Condition: `<slot: when end-to-end verification runs, for example only when a screen changes>`
- Invoke: none (the orchestrator briefs and starts `verify-<id>`)
- Output: the verification report in the run folder's `reports/`
- Gate: none here (problems found route to a fix round: the orchestrator verifies each one against the
  code, then asks the person whether to fix now or log it for later)
- Post: stop the verification agent with `TaskStop` if the run will not prompt it again, after
  confirming it with `ListAgents`
- Route: Phase 7

## Phase 7 — Merge

The orchestrator relays any manual check to the person, who may waive it explicitly. The merge follows
`<slot: merge and push gates>`. If the default branch moved since the item's branch was cut, take it in
first and re-run the gates.

**Orchestrator directives**
- Invoke: none
- Output: the merge commit (verify from git: merge base, clean tree, commit count)
- Gate: USER CONSENT REQUIRED — explicit merge consent for each item; a manual check unless the person
  waived it; positive tone is not consent
- Route: Phase 8

## Phase 8 — Close-out

The orchestrator updates `<slot: item tracker and id format>`, closes the item out in the run-state
file, and stops any of the item's agents still running, after confirming each with `ListAgents`. A push
is **not** part of an item: it is a separate step across items, with fresh consent, out of auto mode,
and with no agents running.

**Orchestrator directives**
- Invoke: none
- Output: the run-state file closed out for the item; `<slot: any close-out artifact your methodology
  requires>`
- Gate: USER CONSENT REQUIRED (separate and fresh, out of auto mode, with no agents running) for any
  push
- Route: more items pending → Phase 2; all items done → stop any agent of the run still running, call
  `mcp__workflow-orchestrator__hr_off`, delete the heartbeat cron with `CronDelete`, then the pipeline
  is complete
