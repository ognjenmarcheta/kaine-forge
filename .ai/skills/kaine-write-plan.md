---
name: kaine-write-plan
description: Write or revise implementation plans in Plan mode or when the user asks for a plan, always ending with a plain-language explanation for a nontechnical reader.
argument-hint: task, requirements, or existing plan to revise
---

# Write an Implementation Plan

## Goal and activation

Use this skill when the harness explicitly indicates Plan mode, the user asks to write,
develop or revise an implementation plan, or the user invokes `kaine-write-plan`.
Keep it active through revisions; reuse unchanged instructions already loaded.

Produce a plan that an implementer can follow and a nontechnical reader can assess.
Apply `kaine-explain` for source grounding and useful format choices. Keep this
skill's planning workflow and final **In plain language** section.
An implementation request outside Plan mode does not restart planning merely because
it includes an approved plan. Ordinary status updates and unrelated questions outside
Plan mode do not trigger this workflow.

## Workflow

1. Reuse the conversation's decisions. Inspect relevant code, repository guidance and
   existing tests before choosing an approach. Follow the required reading rules;
   do not ask the user for facts you can discover.
2. Establish the intended outcome, scope, constraints and acceptance criteria. Ask
   only questions whose answers materially change the plan. Resolve consequential
   unknowns; make reasonable defaults explicit.
3. Divide the work into proportionate stages. State what each stage delivers, its
   dependencies and how to verify success. For refactors, identify the behavior to
   preserve and keep intermediate changes working where feasible.
4. Record relevant interface, migration, risk and rollout decisions. Use verified
   paths and commands where they remove ambiguity. Include code only when it conveys
   a necessary decision more precisely than prose. Avoid speculative detail.
5. Check coverage of the request, consistency between stages, open decisions and
   unnecessary detail. Match the plan's length to the work; a small task needs a
   small plan. Describe intended checks without claiming they have already passed.
6. End every completed plan with the **In plain language** section below. Keep it
   when shortening or revising a plan, and update it to match any changed decisions.

## Delivery and boundaries

Keep plans in chat by default. Save a file or publish an issue only when requested
and permitted by the active mode. Follow the harness's output and execution rules;
in Codex Plan mode, put the plain-language ending inside the final `<proposed_plan>`
block. Do not add that wrapper to other formats unless the harness requires it.

This skill does not change modes or authorize implementation, publication or
delegation. A planning-only request ends with the plan. Preserve existing execution
authorization and do not add repeated approval requests. Do not require another
planning framework, external skill or subagent.

## Headless runs (Agent Desk or factory worker)

When the prompt supplies a result schema, fill the schema. Do not ask the user a
question. Record each unknown in the schema's open-question field and state the
default you chose. Put the plain-language ending in the schema's plain-language
field. Do not print a banner or add any text outside the schema.

## In plain language

Use this exact heading as the final section of each completed plan. Explain:

- What problem we are solving and why it matters.
- What we will do when implementation starts.
- What the user can expect afterward.
- How we will check that it works.
- Any material limitation or decision the user needs to understand.

Use short sentences, familiar words and a respectful tone. Explain necessary technical
terms; preserve repository domain names and explain them when needed. The explanation
must agree with the technical plan and introduce no new promises. A short paragraph
is enough for a small plan; use a few bullets when they make a larger plan clearer.
