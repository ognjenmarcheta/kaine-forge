---
name: kaine-graph
description: Build and query the Graphify codebase knowledge graph for architecture, impact analysis, and cross-layer tracing.
argument-hint: question, concept, or two endpoints to trace between
---

# Codebase Knowledge Graph

Use this skill for architecture questions, impact analysis before a refactor, tracing a concept across code, SQL, docs, and config, or onboarding to an unfamiliar area.

## Which Knowledge Layer

- Serena MCP: live symbol-level navigation (definitions, references). Prefer it for "where is this symbol used".
- `CONTEXT.md` and `docs/adr/`: hand-written domain language and decision rationale. Prefer them for "why".
- Graphify: a generated, queryable concept graph cross-linking code, SQL, docs, and config. Prefer it for "what connects to what" and blast-radius questions. It is regenerable output; never curate it by hand.

## Prerequisites

1. Check the CLI: `graphify --version`.
2. If missing, install once per machine: `uv tool install "graphifyy[sql,mcp]"` (Python 3.10+; pipx works too). The `sql` extra parses the Drizzle `.sql` migrations; `mcp` enables the optional server. This is optional tooling: never add it to `pnpm initialize`, husky hooks, or CI.
3. If the CLI is unavailable, say so and answer from Serena, `MONOREPO_GUIDE.md`, and direct reading instead. Do not fabricate graph results.

## Build and Refresh

1. Full LLM-free build from the repo root: `pnpm graph` (AST extraction + clustering + `GRAPH_REPORT.md` + `graph.html`; no API keys needed).
2. After meaningful changes: `pnpm graph:update` for an incremental merge.
3. After refactors that delete many files, use `graphify update . --force` so the smaller rebuilt graph is accepted.
4. Outputs land in `graphify-out/` (`graph.json`, `graph.html`, `GRAPH_REPORT.md`, `cache/`).

## Query

- Natural language: `graphify query "where is organization scoping enforced"` (`--budget N` caps output tokens, default 2000)
- Impact analysis: `graphify affected "organizationsTable"` (reverse traversal; `--depth N`)
- Path between two concepts: `graphify path "better-auth" "todos feature"`
- Concept summary: `graphify explain "AuthenticatedOrganizationScope"`
- Architectural hubs: `graphify god-nodes --top 10`

Upstream releases frequently; confirm flags with `graphify --help` before relying on one you have not already run in this repo.

## Safety Rules

- `graphify-out/` is local assistant state, gitignored and dockerignored. Never commit it, and never paste generated reports into tracked docs or Serena memories.
- Treat graph answers as leads, not ground truth. Verify paths and symbols against the working tree before editing.
- A graph built before significant changes is stale. Rebuild or fall back to direct reading.
- Never run the per-project installers (`graphify claude|codex|opencode|cursor install` or `graphify hook install`). They write into `AGENTS.md`, `CLAUDE.md`, agent hook config, and git hooks — files that are generated or husky-managed in this repo. The only safe upstream install is the user-global engine skill: `graphify install --platform <platform>`, which writes to your home directory and unlocks deep semantic extraction in Claude Code.

## MCP (optional)

The team catalog ships an opt-in `graphify` MCP server (`default: false` in `.ai/mcp.json`) exposing query, path, and impact tools over stdio via `graphify-mcp`. Enable it per developer by re-running interactive `pnpm ai:install` and selecting it at the opt-in prompt. Build the graph first so `graphify-out/graph.json` exists.
