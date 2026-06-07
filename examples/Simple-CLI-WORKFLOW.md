# Payroll-Pipeline Workflow (example)

> **Example.** This is a real (sanitized) project pipeline included to show a compact, domain-gated
> 5-phase workflow. Copy it as a starting point and adapt it to your project.

This document is the executable pipeline for this project, driven by `/workflow-start`. Each phase's
prose is the human/sub-agent reference; the **Orchestrator directives** subsection is authoritative
for control flow.

The pipeline codifies the flow this repo already follows (visible in `docs/superpowers/specs/` and
`docs/superpowers/plans/`): **brainstorm → spec → plan → implement → review**, using the superpowers
skills. It adds the project-specific discipline this codebase requires:

- **Rules-engine changes demand full-pipeline analysis.** The rules in `config/rules.yaml` execute
  sequentially and interact (filters before transforms before premiums before comp generation). A
  change to one rule can silently break another (see a documented interaction bug between two sequential rules).
  Any change touching `src/rules/` or `config/rules.yaml` must analyze upstream/downstream impact and
  flag unintended consequences.
- **Rules-docs stay in sync.** When rules are added, removed, or changed, `docs/Rules/rules-overview.md`
  must be updated in the same change.
- **Specs get iterative self-review.** Take multiple passes — real issues surface on passes 2+.
- **Pay codes only.** This system tracks hours and pay codes; it never calculates pay amounts.
  Reject any design drift toward dollar calculation.

Artifact naming follows the existing convention: specs at
`docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`, plans at
`docs/superpowers/plans/YYYY-MM-DD-<slug>.md`. Use today's date for new artifacts.

---

## Binding rule — Integration human gate (overrides everything)

**No merge to the local default branch and no push to any remote happens without an explicit human
"yes" on that specific action.** This applies everywhere in the pipeline, regardless of phase, and
overrides any sub-skill's own merge/push/cleanup suggestion:

- **Worktree → local merge.** If implementation happened in a git worktree (or any feature/isolation
  branch), merging it back into the local default branch (`master`) requires an explicit human approval
  of the merge itself. Showing the diff and a positive reaction is NOT approval — ask "merge `<branch>`
  into `master`?" and wait for an explicit yes.
- **Local → remote push.** Any `git push` (branch or `master`, force or not) requires a separate
  explicit human "yes". Approval to merge locally is NOT approval to push.
- **No bundling.** Do not infer either action from approval of the other, from review sign-off, or from
  conversational enthusiasm. Each of {merge, push} is its own gate with its own explicit consent.
- **Agents/sub-skills may not self-authorize.** `finishing-a-development-branch`,
  `subagent-driven-development`, or any spawned agent that reaches a "ready to merge/push" state must
  STOP and hand the decision to the human via this engine. They propose; the human disposes.

This rule is the floor under Phase 4's worktree handling and Phase 5's integration gate below.

---

## Phase 1 — Brainstorm

Explore the user's intent, requirements, and design space before any code or spec is written. This is
where ambiguity is resolved: which data records or pay codes are in scope, where in the pipeline the
change sits, what the output shape looks like, and how the feature is surfaced in the project's
interfaces.

**Orchestrator directives**
- Invoke: superpowers:brainstorming
- Suppress: brainstorming may end by offering to write code or a plan — IGNORE that handoff. Control
  returns to this engine, which advances to Phase 2 (Spec), not to implementation.
- Output: none (inline shared understanding; captured into the spec in Phase 2)
- Gate: none
- Route: Phase 2

## Phase 2 — Spec

Write a design document capturing the agreed approach: the feature's behavior, the data sources
involved, the output shape and format, CLI flags or interface UX, and explicitly what is out of scope.
Follow the existing spec format (Context / Design / out-of-scope sections). If the change touches the
rules engine or `config/rules.yaml`, the spec must include a **pipeline-impact analysis**
(upstream/downstream effects, interaction risks, suggested A/B or before/after verification).

Perform iterative self-review on the draft: re-read it at least twice looking for gaps, ambiguities,
and unstated assumptions before presenting it. Real issues surface on passes 2+.

**`/goal` refinement loop** *(example custom skill — substitute your own)*. After the iterative self-review, run a `/goal` loop that dispatches review
subagents against the spec. The goal is **clear when a review pass surfaces no Medium-or-higher
severity issues** (only Low/trivial findings, or clean). Each iteration: subagents review → if any
Medium+ issue is found, revise the spec to resolve it → re-review. **Iteration cap: 6.** Stop when a
pass returns no Medium+ issues, or after 6 iterations — whichever comes first. If the cap is reached
with Medium+ issues still open, do NOT silently proceed: surface the remaining issues at the consent
gate and let the user decide.

> **Guardrail (learned the hard way):** when a review subagent clears or downgrades a Medium+ finding,
> do not accept the verdict on trust. Skim the reviewer's own cited evidence and confirm it actually
> *supports* the conclusion. A downgrade resting on a general assertion ("X always happens…") rather
> than a concrete file:line / spec-section citation must be verified against ground truth before it is
> accepted. The most load-bearing finding is the one the reviewer talks itself *out of*.

**Orchestrator directives**
- Invoke: none (orchestrator writes the spec from Phase 1's shared understanding, applying iterative
  self-review)
- Post: (1) save to `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`; (2) run the `/goal` refinement
  loop above (cap 6, exit on no Medium+ issues), applying the guardrail to every cleared/downgraded
  finding; (3) commit the refined spec.
- Output: `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md` + commit (message: `docs: <slug> design spec`),
  with the `/goal` loop run to its exit condition (no Medium+ issues, or 6 iterations)
- Gate: USER CONSENT REQUIRED — the user must explicitly approve the design before planning begins.
  Positive tone ("looks good") is not consent; ask directly and wait for an explicit yes. If the
  `/goal` loop hit its cap with Medium+ issues open, present those issues as part of this gate.
- Route: Phase 3

## Phase 3 — Plan

Turn the approved spec into a task-by-task implementation plan. Follow the existing plan format: a
`> **For agentic workers:**` REQUIRED SUB-SKILL header, Goal/Architecture/Tech-Stack/Spec-link
preamble, a File Structure section (new/modified files), then numbered Tasks with checkbox steps and
explicit verification steps. The plan must reference the Phase 2 spec.

writing-plans performs its own self-review pass on the draft plan. After that completes, run the same
**`/goal` refinement loop** described in Phase 2 against the plan: review subagents grade findings by
severity; the plan is **clear when a pass surfaces no Medium-or-higher issues**; revise-and-re-review
each iteration; **cap at 6**; surface any still-open Medium+ issues at the consent gate if the cap is
hit. Apply the same downgrade/clear guardrail — cross-check a review subagent's cited evidence against
its verdict before accepting any cleared or downgraded Medium+ finding.

**Orchestrator directives**
- Invoke: superpowers:writing-plans
- Suppress: writing-plans may offer to begin executing the plan — IGNORE that handoff. Control returns
  here; advancement to Phase 4 is gated on explicit user approval below.
- Post: (1) ensure the plan is saved to `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`; (2) run the
  `/goal` refinement loop (cap 6, exit on no Medium+ issues) with the cited-evidence guardrail applied
  to every cleared/downgraded finding; (3) commit the refined plan.
- Output: `docs/superpowers/plans/YYYY-MM-DD-<slug>.md` + commit (message: `docs: <slug> implementation plan`),
  with the `/goal` loop run to its exit condition (no Medium+ issues, or 6 iterations)
- Gate: USER CONSENT REQUIRED — the user must explicitly approve the plan before implementation begins.
  If the `/goal` loop hit its cap with Medium+ issues open, present those issues as part of this gate.
- Route: Phase 4

## Phase 4 — Implement

Execute the approved plan task-by-task using TDD (write the failing test, then the implementation).
Follow the project's coding patterns and immutability conventions. If any task touches `src/rules/` or
`config/rules.yaml`, perform the pipeline-impact analysis the spec called for before committing, and
update `docs/Rules/rules-overview.md` in the same change.

**Orchestrator directives**
- Invoke: superpowers:subagent-driven-development
- Pre: confirm the working tree is clean (or changes are intended); confirm the project's runtime
  environment is ready for test runs.
- Suppress: the implementation sub-skill drives its own task loop and may declare itself "done" — that
  is fine for the code, but it does NOT decide what happens next. On its return, control comes back
  here and advances to Phase 5 (Review), regardless of any terminal message it emits. If work happened
  in a worktree/branch, it stays UNMERGED at this point — merge-back is gated by the Integration human
  gate (top of this doc) and handled in Phase 5, never auto-performed here.
- Post: if rules were changed and `docs/Rules/rules-overview.md` was not updated, update it now and
  commit before advancing.
- Output: implementation + passing tests committed (verify via `git log` / `git status` and a green
  test run — never trust a self-report)
- Gate: USER CONSENT REQUIRED when the change altered rules behavior (`src/rules/` or
  `config/rules.yaml`): present the pipeline-impact findings and await explicit user confirmation that
  the behavioral change is intended before proceeding to review.
- Route: Phase 5

## Phase 5 — Reality-Check Loop

After development is reported complete (Phase 4) and **before** the Phase 6 testing/verification pass,
a reality-check agent *(example custom skill — substitute your own; this example uses a `karen` agent)*
runs a reality-check review loop. Its job is to cut through "done" claims and
establish what *actually* works versus what was merely marked complete — incomplete implementations,
stubbed/mocked paths presented as real, tasks checked off without functioning behavior, and
requirements from the spec that aren't truly met.

The reality-check agent has authority to **dispatch its own team** of sub-agents to fix the gaps it
finds — this is a cleanup loop, not just a report. Each iteration: the agent assesses actual vs claimed
completion → dispatches its team to clean up the concrete issues found → re-assesses. The loop exits
when the assessment surfaces no remaining substantive completion gaps (the implementation genuinely
matches the approved spec/plan), or after the iteration cap. **Iteration cap: 3** (reality-check +
team-cleanup passes are heavy; if the cap is hit with gaps still open, surface them to the user rather
than silently continuing to Phase 6).

The agent operates on the same branch/worktree as Phase 4. Cleanup commits stay on that branch and
remain UNMERGED — the Integration human gate (top of this doc) still governs; the agent cannot merge or
push. Fixes that alter rules behavior re-trigger the project rules-discipline (pipeline-impact analysis
+ `docs/Rules/rules-overview.md` sync).

**Orchestrator directives**
- Invoke: reality-check agent (via the Agent tool). The agent may dispatch its own sub-agent team to
  perform cleanup.
- Suppress: the agent (and any agent it dispatches) may end with a verdict like "production-ready" or a
  recommendation to merge/test/ship — IGNORE that as a control decision. The agent reports and cleans
  up; this engine decides what happens next. On its return, control comes back here and advances to
  Phase 6.
- Pre: ensure Phase 4's work (and any rules-change consent gate) is settled; confirm the branch state
  the agent will operate on.
- Post: run the loop to its exit condition (no substantive gaps, or 3 iterations). Apply the same
  cited-evidence guardrail used in the `/goal` loops: when the agent declares an item "actually works"
  or downgrades a gap, cross-check the claim against ground truth (run it / read the code) before
  accepting it — a green verdict is not self-certifying. Commit any cleanup on the branch.
- Output: reality-check assessment + any cleanup commits on the branch (verify via `git log` /
  `git status`; do NOT trust a self-report of "all fixed")
- Gate: USER CONSENT REQUIRED when the loop hit its cap with substantive gaps still open: present the
  remaining gaps and await user direction before proceeding. Otherwise proceed to Phase 6.
- Route: Phase 6

## Phase 6 — Review

Run a code review against the completed work and verify the feature actually works end-to-end (run the
project's CLI or interface and confirm the expected output is produced). Confirm rules-docs are in sync
if rules changed. Then present integration options (merge / PR / cleanup).

**Orchestrator directives**
- Invoke: superpowers:requesting-code-review, then superpowers:verification-before-completion
- Post: address any blocking review findings (loop back into Phase 4 if substantive); on a clean
  verification, invoke superpowers:finishing-a-development-branch to present merge/PR/cleanup options.
- Output: code-review performed + verification evidence (actual command output, produced output
  artifact) shown to the user
- Gate: USER CONSENT REQUIRED — the **Integration human gate** (top of this doc) applies in full. The
  user must explicitly choose how to integrate, and each of {merge worktree/branch → `master`, push →
  remote} requires its own separate explicit "yes". Review sign-off and positive tone are NOT consent
  to merge or push. Do not perform either action without its own approval; leaving the branch unmerged
  is always an acceptable outcome.
- Route: end of pipeline
