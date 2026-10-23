# Documentation Index

Use this index to find the right source of truth quickly.

## Landing and core guides

- [`../README.md`](../README.md): short GitHub landing page — pitch, badges, 40-second video tour, agent-ready overview, capability compare, quickstart, template adopt one-liner, documentation map.
- [`../MONOREPO_GUIDE.md`](../MONOREPO_GUIDE.md): architecture, package boundaries, FDD naming, runtime/env rules, Docker, mobile LAN, data/auth/GraphQL flow, implementation workflow.
- [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md): design tokens, web/mobile UI split, theming, component styling, layout, and accessibility.
- [`../CONTEXT.md`](../CONTEXT.md): domain language (Organization, Authenticated Organization Scope, invitations, and related terms).
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md): local setup, template adoption, PR expectations, checks, AI install/doctor, and release workflow.
- [`../SECURITY.md`](../SECURITY.md): vulnerability reporting, supported surfaces, template hardening, production auth checklist.
- [`../REVIEW.md`](../REVIEW.md): shared human/agent review checklist (generated from `.ai/review.md`).

## Operational docs

- [`self-hosted-ci.md`](self-hosted-ci.md): optional private-repository runner routing, the ARC reference setup with automatic hosted fallback, validation, and rollback.
- [`release-checklist.md`](release-checklist.md): release validation checklist.
- [`troubleshooting.md`](troubleshooting.md): common local setup failures (ports, Docker, auth CORS, codegen, AI scaffold).
- [`.env.example`](../.env.example): commented environment variable defaults (behavior detail lives in `MONOREPO_GUIDE.md` section 9).

Design-token conformance is enforced continuously by `packages/ui/src/styles/design-system.contract.test.ts` (the historical alignment audit was removed once the contract test landed).

## Architecture decisions

- [`adr/0001-tauri-over-electron.md`](adr/0001-tauri-over-electron.md): desktop shell uses Tauri.
- [`adr/0002-mobile-runtime-alignment.md`](adr/0002-mobile-runtime-alignment.md): Expo SDK alignment policy.
- [`adr/0003-fast-pr-gate.md`](adr/0003-fast-pr-gate.md): fast PR gate plus scheduled deep checks.
- [`adr/0004-release-automation-changesets.md`](adr/0004-release-automation-changesets.md): Changesets and GitHub Releases.
- [`adr/0005-scrypt-password-hashing.md`](adr/0005-scrypt-password-hashing.md): salted scrypt with embedded cost parameters.
- [`adr/0006-in-memory-rate-limiting.md`](adr/0006-in-memory-rate-limiting.md): in-memory fixed-window API rate limiting.
- [`adr/0007-soft-email-verification.md`](adr/0007-soft-email-verification.md): soft, opt-in email verification.
- [`adr/0008-adopt-better-auth.md`](adr/0008-adopt-better-auth.md): adopt better-auth as the authentication provider.
- [`adr/0009-domain-knowledge-as-agent-infra.md`](adr/0009-domain-knowledge-as-agent-infra.md): encode domain knowledge as agent/review infrastructure.
- [`adr/0010-local-factory-dashboard.md`](adr/0010-local-factory-dashboard.md): local dashboard for the retired software factory (superseded by ADR 0011).
- [`adr/0011-local-agent-desk.md`](adr/0011-local-agent-desk.md): local agent desk engine, GitHub authorization, and factory retirement.

## AI assistant docs

Canonical AI assistant sources live in [`../.ai/`](../.ai/).

- [`../.ai/guide.md`](../.ai/guide.md): generated into `AGENTS.md` and `CLAUDE.md`.
- [`../.ai/review.md`](../.ai/review.md): generated into root `REVIEW.md` review checklist.
- [`../.ai/skills/*.md`](../.ai/skills/): canonical skill sources for local agent installs.
- [`../.ai/mcp.json`](../.ai/mcp.json): canonical MCP catalog for local agent installs.
- [`../.ai/serena-project.yml`](../.ai/serena-project.yml): generated into `.serena/project.yml`.
- [`../.ai/serena-memories/*.md`](../.ai/serena-memories/): generated into Serena memories.
- [`agents/day-one.md`](agents/day-one.md): day-one agent-assisted contribution ramp.
- [`agents/agent-desk.md`](agents/agent-desk.md): operating manual for the local agent desk.
- [`agents/agent-desk-api.md`](agents/agent-desk-api.md): the desk server's local HTTP API and event stream.
- [`agents/issue-format.md`](agents/issue-format.md): the six-heading issue body that people, skills, and the desk share.
- [`agents/issue-tracker.md`](agents/issue-tracker.md), [`agents/triage-labels.md`](agents/triage-labels.md), [`agents/domain.md`](agents/domain.md): issue tracker, triage labels, and domain-doc layout used by the skills.
- [`agents/skill-authoring.md`](agents/skill-authoring.md): how to add product-specific skills.
- [`agents/agent-engineering.md`](agents/agent-engineering.md): manual evaluations, local run reports, and sandboxed trials.
- [`agents/harness-evals.md`](agents/harness-evals.md): ledger of whether guide and review rules change agent output.
- [`agents/serena-verification.md`](agents/serena-verification.md): verify Serena integration after changes.
- [`agents/monorepo-scorecard.md`](agents/monorepo-scorecard.md): repo health scorecard, regenerated by `pnpm scorecard`.
- [`agents/automation-gap-audit.md`](agents/automation-gap-audit.md): residual automation opportunities.
- [`agents/astra-baseline.md`](agents/astra-baseline.md): dated GPT-6 Astra readiness baseline.

Run `pnpm ai:install` and `pnpm ai:doctor` after editing canonical AI sources.

## Historical reports

[`archive/`](archive/) holds dated, one-off audits and verification reports. They record what was true on their date and are not maintained.

## Future docs site

Multi-page navigation is planned as a dedicated docs site (e.g. VitePress), with the root README remaining the GitHub landing page. Until that ships, prefer this index and the root README map over inventing many one-off markdown “pages.”
