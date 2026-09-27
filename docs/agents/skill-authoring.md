# Skill Authoring

How to add reusable agent workflows for this repo.

## Canonical location

Team and template skills live at:

```text
.ai/skills/<name>.md
```

`.ai/` is the source of truth. Run `pnpm ai:install` after edits so generated assistant outputs stay aligned. Do not edit installed agent skill copies as the long-term home.

## The `kaine-` prefix is required under `.ai/skills/`

**Files under `.ai/skills/` must use the `kaine-` prefix** (for example `kaine-open-pr.md`). This is enforced by `discoverSkills` / `parseSkillFile` (`KAINE_PREFIX`). Non-prefixed skill files in that directory fail AI setup lint.

- Template-wide and product workflows that ship with the monorepo still use `kaine-*` under `.ai/skills/`.
- Product-local or personal skills that cannot be `kaine-` prefixed go in the agent’s local skill directory (for example Claude/Codex personal skills), **not** in `.ai/skills/`.
- To customize a team skill without fighting the installer: copy it to a non-prefixed name in your local agent skill dir and edit the copy. The installer only manages `kaine-*` skills and leaves personal copies alone.

## Frontmatter pattern

Mirror an existing skill (for example `.ai/skills/kaine-test.md`):

```markdown
---
name: kaine-example
description: One-line when-to-use description for skill discovery.
argument-hint: short hint for arguments
---

# Example Workflow

Use this skill when …

## Steps

1. …
```

- `name` must match the file stem and use the `kaine-` prefix.
- `description` should say when the skill applies (discovery surface). Keep it concise and specific to the workflow so native discovery can select it without loading the body. Avoid broad keyword lists.
- `argument-hint` is optional but preferred for skills that take a path, ticket, or failure mode.
- Keep the body procedural and short: goals, commands, done criteria.

## Craft

Write skills as thin, re-runnable procedures — not essays.

- Open with a clear **Goal** and **Non-goals** (hard stops: do not push, do not expand scope, authority limits for merge/close).
- Prefer **Gotchas** from real failures over abstract advice when the workflow has known landmines.
- End multi-step skills with a **Canonical commands** block when agents need copy-paste `gh` / `pnpm` / git recipes.
- Keep the skill short; put long procedure in `docs/agents/`, ADRs, or domain guides and point to them.
- Expand an existing skill before creating a near-duplicate.

## After you add a skill

1. Set accurate canonical frontmatter. The installer generates the single skill index at the marker in `.ai/guide.md`; do not maintain a second list by hand.
2. `pnpm ai:install`
3. `pnpm ai:doctor` — must be clean for the new skill (frontmatter, prefix, guide list).

## Prefer the encoding ladder before a new skill

Not every repeated instruction needs a skill. Prefer **`kaine-encode-knowledge`** to decide:

1. Machine check (lint / type / existing test / CI)
2. New focused test
3. `REVIEW.md` checklist item (edit `.ai/review.md`, then reinstall)
4. Skill or guide rule
5. `CONTEXT.md` / ADR

Add a skill when the work is a **multi-step workflow** people re-run (test plan, PR open, rebase, encode loop). Prefer REVIEW or tests for single rules that should gate every change.

### When not to add a skill

- Single rule that should gate every change → REVIEW checklist item or focused test, not a skill.
- Transient session state or one-off notes → issue/PR comment, not durable docs or a skill.
- Information that will not stay true in six months without constant edits → do not encode as infrastructure yet.
- Topic already covered adequately → expand the existing skill or guide section first.

## Propose improvements when work repeats

Use `kaine-encode-knowledge` for the procedure and proposal format. Successful workflows qualify alongside mistakes and corrections. Use two concrete occurrences from the conversation or relevant existing issues, PRs, or docs, or an explicit user report of recurring work. Retries in one debugging attempt do not count.

Check existing skills first. Extend the owner of the workflow when needed; propose a new `kaine-*` skill only for a distinct reusable procedure. Give the evidence, name, trigger, steps, and benefit. Continue the task and wait for authorization before implementing the proposed skill change. Do not repeat declined suggestions without new evidence. Use available context; add no shared ledger, conversation harvesting, automatic issues, or custom selection service.

## Acceptance scenarios

These are manual agent-behavior scenarios. `pnpm ai:install` and strict `pnpm ai:doctor -- --strict` check generation, metadata, and drift; formatting and `pnpm check` check the repository. They do not execute these scenarios or prove universal model compliance. Record actual observed behavior separately if live trials are run.

| Scenario                                                                                                                | Expected behavior                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit request: “Use kaine-review on this diff.”                                                                      | Load and follow `kaine-review`; announce it for substantive work. Reuse unchanged instructions if already loaded.                               |
| Implicit match: “Investigate this failing CI job.”                                                                      | Assess descriptions, select `kaine-fix-ci`, and read it before investigating.                                                                   |
| No match: a simple factual reply outside the skill workflows                                                            | Reply directly without forcing a skill or a skill announcement.                                                                                 |
| Index missing or incomplete                                                                                             | Inspect canonical frontmatter to find candidates; read only selected skill bodies.                                                              |
| Task transition: implementation changes to review, then PR preparation                                                  | Reassess and load `kaine-review`, then `kaine-open-pr`, within the user's authorized scope.                                                     |
| Repeated workflow already covered: two PR handoffs follow the existing procedure                                        | Use `kaine-open-pr`; do not propose a duplicate. If a recurring gap exists, propose extending it.                                               |
| New workflow candidate: two concrete occurrences of the same uncovered multi-step procedure, or an explicit user report | Propose a distinct `kaine-*` skill with evidence, trigger, steps, and benefit. Continue the task and wait for authorization before creating it. |
| Several retries in one debugging attempt                                                                                | Do not treat the retries as evidence of a recurring workflow.                                                                                   |
| Declined suggestion appears relevant again                                                                              | Do not repeat it unless new evidence is available in context.                                                                                   |

This follows [OpenAI's skill guidance](https://learn.chatgpt.com/docs/build-skills): discover through concise metadata and load instructions selectively. Selection remains model-driven across the supported agent targets.

## Planning skill acceptance

`kaine-write-plan` owns implementation planning. The canonical guide explicitly
routes Plan mode and user plan requests to it, in addition to native skill
discovery. The skill ends every completed plan with **In plain language** so a
nontechnical reader can assess the intended work. This is an instruction-level
requirement, not a runtime guarantee of model compliance.

The following scenarios are manual acceptance criteria, not executed model trials:

| Scenario                                                                        | Expected behavior                                                                                                                |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Harness explicitly enters Plan mode; the user does not name a skill             | Read and apply `kaine-write-plan`; reuse it if already loaded. Follow active mode restrictions.                                  |
| Outside Plan mode: “Write a plan for this feature.”                             | Use the skill and present the plan in chat with an **In plain language** ending.                                                 |
| Explicit request: “Use kaine-write-plan.”                                       | Load the skill and apply it to the supplied task or plan.                                                                        |
| Plan a feature or refactor                                                      | Inspect existing behavior and tests, define scope and decisions, and name verification. Refactors identify behavior to preserve. |
| “Revise the plan” or “Make it shorter”                                          | Retain a proportionate plain-language ending that reflects the revised technical plan and adds no new promises.                  |
| Missing repository facts                                                        | Investigate them before asking the user; ask only about consequential decisions that cannot be discovered.                       |
| Outside Plan mode: unrelated factual question or “Implement this approved plan” | Do not start an unnecessary planning cycle. Apply the relevant workflow and existing authorization.                              |
| Planning-only request                                                           | Do not implement code, save a plan file or publish an issue without the corresponding request and mode permission.               |

Installation and doctor checks verify metadata and generated copies. They do not
execute these scenarios or prove that every agent will select or follow the skill.

### Planning sources

The short repository workflow adapts ideas from these reviewed sources; it does
not depend on installing or invoking them:

- [Superpowers writing-plans](https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/writing-plans/SKILL.md): verifiable stages, clear interfaces and proportionate self-review.
- [Matt Pocock's historical request-refactor-plan](https://github.com/mattpocock/skills/blob/e7f0b58a4b8ad0764d9478b069fe6e48b99c320f/request-refactor-plan/SKILL.md): scope, decisions, behavioral testing and safe incremental changes. This skill is absent from the current source tree reviewed for this change.
- [Matt Pocock's grilling](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/productivity/grilling/SKILL.md) and [to-spec](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/engineering/to-spec/SKILL.md): discover facts before asking for decisions, and reuse established context.

## Implementation-summary skill acceptance

`kaine-summarize-work` owns implementation handoffs, including partial or blocked
work and PR delivery. The canonical guide routes these handoffs to the skill.
Technical results, links, verification, and limitations precede the final **In plain
language** section. That ending explains the practical outcome and any necessary
next step without expanding the task.

The following are manual acceptance scenarios, not executed model trials:

| Scenario                                                                | Expected behavior                                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Completed implementation; no user action needed                         | Preserve technical evidence. Explain the practical benefit and state that no user action is needed only when supported.              |
| PR created; checks or review remain pending                             | Distinguish implementation from merge and deployment. Name the pending check or review and who owns the next step.                   |
| Partial or blocked implementation                                       | Identify what is complete, what remains, and the blocker. Explain the necessary next step and its owner without claiming completion. |
| Tests pass but live behavior was not tested                             | Retain the coverage limitation in plain language; do not turn test success into a live-enforcement claim.                            |
| “Shorten this implementation summary”                                   | Keep a proportionate plain-language ending and material limitations. Introduce no new promises.                                      |
| Explicit invocation                                                     | Load the skill and summarize the supplied implementation evidence without inventing missing results.                                 |
| Standalone investigation, review, ordinary question, or progress update | Do not automatically apply this skill or force an implementation handoff.                                                            |
| Implementation plan                                                     | Use `kaine-write-plan`; keep its own plain-language ending.                                                                          |
| Authorized implementation still has feasible work remaining             | Continue the work. Do not use the summary workflow as a reason to stop early or request repeated approval.                           |

Review example summaries against these criteria for accuracy, understandable
outcomes, and clear ownership of next steps. Record any observed agent behavior
separately. Installation, doctor, formatting, and repository checks validate
metadata and generated files; they do not prove universal instruction-following.
Do not add tests that merely search for the ending's heading.

The writing guidance follows the [National Archives plain-language principles](https://www.archives.gov/open/plain-writing/10-principles.html): lead with the main point, use familiar words, and keep sentences focused. The skill has no external runtime dependency.

## Related

- Day-one ramp: `docs/agents/day-one.md`
- Domain docs consumption: `docs/agents/domain.md`
- Shared review contract: `REVIEW.md` (canonical `.ai/review.md`)
