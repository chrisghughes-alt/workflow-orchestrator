# Example `WORKFLOW.md` pipelines

Each file here is a complete `docs/WORKFLOW.md` you can copy into a project and adapt. They are ordered
from simplest to most elaborate. For the directive format, see
[`../docs/authoring-workflows.md`](../docs/authoring-workflows.md).

| Example | Phases | Use it when… |
|---|---|---|
| [`minimal-WORKFLOW.md`](minimal-WORKFLOW.md) | 3 | You want the smallest real pipeline: plan → implement → verify, with a consent gate before implementing and before integrating. Start here. |
| [`Simple-CLI-WORKFLOW.md`](Simple-CLI-WORKFLOW.md) | 5 | You want a compact pipeline with domain-specific discipline baked into phase gates (a real, sanitized data pipeline). |
| [`Full-Stack-Example-WORKFLOW.md`](Full-Stack-Example-WORKFLOW.md) | 13 | You want an elaborate flow: lane classification, spec/plan review loops, sub-agent development, automated + manual UAT, and explicit merge/push gates (a real, sanitized web-app feature pipeline). |

> The two "real" examples are actual project pipelines that have been **sanitized** — organization names
> and internal references removed, and custom/private skill names annotated as examples. Treat the
> custom skill references as placeholders to swap for your own.

## How to use one

1. Pick the closest match above.
2. Copy it to your project as `docs/WORKFLOW.md`.
3. Edit the phases, skills, outputs, and gates to fit your project.
4. Run `/workflow-start <what you want to build>`.

To keep several pipelines in one project, name extras `docs/<slug>-WORKFLOW.md` and run a specific one with a
leading `--file` argument: `/workflow-start --file docs/<slug>-WORKFLOW.md <what you want to build>`. With no
`--file`, `docs/WORKFLOW.md` runs. See [`../docs/authoring-workflows.md`](../docs/authoring-workflows.md).
