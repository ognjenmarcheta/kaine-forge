# Documentation Index

Use this index to find the right source of truth quickly.

## Core Guides

- `../README.md`: template overview, quickstart, runtime notes, Docker, AI scaffold, adoption checklist.
- `../MONOREPO_GUIDE.md`: architecture, package boundaries, FDD naming, runtime rules, data/auth/GraphQL flow, and implementation workflow.
- `../DESIGN_SYSTEM.md`: design tokens, web/mobile UI split, theming, component styling, layout, and accessibility.
- `../CONTRIBUTING.md`: local setup, PR expectations, checks, AI install/doctor flow, and release workflow.
- `../SECURITY.md`: vulnerability reporting, supported security surfaces, and hardening rules.

## Operational Docs

- `release-checklist.md`: release validation checklist.
- `turborepo-2-8-audit.md`: Turborepo 2.8 adoption notes.

Design-token conformance is enforced continuously by `packages/ui/src/styles/design-system.contract.test.ts` (the historical alignment audit was removed once the contract test landed).

## Architecture Decisions

- `adr/0001-tauri-over-electron.md`: desktop shell uses Tauri.
- `adr/0002-mobile-runtime-alignment.md`: Expo SDK alignment policy.
- `adr/0003-fast-pr-gate.md`: fast PR gate plus scheduled deep checks.
- `adr/0004-release-automation-changesets.md`: Changesets and GitHub Releases.
- `adr/0005-scrypt-password-hashing.md`: salted scrypt with embedded cost parameters.
- `adr/0006-in-memory-rate-limiting.md`: in-memory fixed-window API rate limiting.
- `adr/0007-soft-email-verification.md`: soft, opt-in email verification.
- `adr/0008-adopt-better-auth.md`: adopt better-auth as the authentication provider.
- `adr/0009-domain-knowledge-as-agent-infra.md`: encode domain knowledge as agent/review infrastructure.

## AI Assistant Docs

Canonical AI assistant sources live in `../.ai/`.

- `../.ai/guide.md`: generated into `AGENTS.md` and `CLAUDE.md`.
- `../.ai/review.md`: generated into root `REVIEW.md` review checklist.
- `../.ai/skills/*.md`: canonical skill sources for local agent installs.
- `../.ai/mcp.json`: canonical MCP catalog for local agent installs.
- `../.ai/serena-project.yml`: generated into `.serena/project.yml`.
- `../.ai/serena-memories/*.md`: generated into Serena memories.
- `agents/`: repo-local configuration for Matt Pocock engineering skills, including issue tracker, triage labels, and domain-doc layout.
- `agents/day-one.md`: day-one agent-assisted contribution ramp.
- `agents/skill-authoring.md`: how to add product-specific skills.
- `agents/automation-gap-audit.md`: residual automation opportunities.

Run `pnpm ai:install` and `pnpm ai:doctor` after editing canonical AI sources.
