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
- `design-system-alignment-audit.md`: historical audit of design-system implementation gaps.
- `turborepo-2-8-audit.md`: Turborepo 2.8 adoption notes.

## Architecture Decisions

- `adr/0001-tauri-over-electron.md`: desktop shell uses Tauri.
- `adr/0002-mobile-runtime-alignment.md`: Expo SDK alignment policy.
- `adr/0003-fast-pr-gate.md`: fast PR gate plus scheduled deep checks.
- `adr/0004-release-automation-changesets.md`: Changesets and GitHub Releases.

## AI Assistant Docs

Canonical AI assistant sources live in `../.ai/`.

- `../.ai/guide.md`: generated into `AGENTS.md` and `CLAUDE.md`.
- `../.ai/skills/*.md`: canonical skill sources for local agent installs.
- `../.ai/mcp.json`: canonical MCP catalog for local agent installs.
- `../.ai/serena-project.yml`: generated into `.serena/project.yml`.
- `../.ai/serena-memories/*.md`: generated into Serena memories.

Run `pnpm ai:install` and `pnpm ai:doctor` after editing canonical AI sources.
