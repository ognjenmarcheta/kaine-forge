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

## When It Is Required

The `Knowledge graph:` line in the startup context (or `pnpm graph:status` for agents without a SessionStart hook) states the graph state:

- `fresh`: before a cross-package refactor, a plan, or a review that changes shared code, run `graphify affected` or `graphify query` first.
- `stale (N commits, M changed files since build)`: run `pnpm graph:update` (about 6 s), then query.
- `not built in this checkout`: run `pnpm graph` (about 7 s on this repo). Worktrees never reuse another checkout's graph, because it describes another branch.
- `Graphify CLI not installed`: say so, and answer from Serena, `MONOREPO_GUIDE.md`, and direct reading. Do not fabricate graph results.

For other work the graph is optional.

## Prerequisites

1. Check the CLI: `graphify --version`. The repo pins one tested release in `.ai/hooks/graph-status.mjs` (`GRAPHIFY_VERSION`), and the status line flags a mismatch.
2. If the CLI is missing, install it once per machine with the pinned command that `pnpm graph:status` prints (`uv tool install "graphifyy[sql,mcp]==<GRAPHIFY_VERSION>"`; Python 3.10+). The `sql` extra parses the Drizzle `.sql` migrations; `mcp` enables the optional server. This is optional tooling: never add it to `pnpm initialize`, husky hooks, or CI.

## Build and Refresh

1. Full build from the repo root: `pnpm graph` (`graphify update . --force`, then a build record). It needs no LLM and no API key: the `update` path extracts code with tree-sitter, parses Markdown structure, clusters, and names communities after their hub nodes.
2. Incremental refresh: `pnpm graph:update`. Use it whenever the status line says stale.
3. Do not use `graphify extract` or `graphify cluster-only` here. `extract` writes no report, and `cluster-only` without `--no-label` sends community names to an LLM, including the `claude -p` CLI when no API key is set.
4. Outputs land in `graphify-out/` (`graph.json`, `graph.html`, `GRAPH_REPORT.md`, `cache/`, and `kaine-build.json`, the build commit and time that the status check reads).
5. `.graphifyignore` (gitignore syntax, on top of `.gitignore`) excludes generated files that become false hubs: `pnpm-lock.yaml` and the Drizzle meta snapshots.

## Query

Use exact symbol or file names. Nodes are code symbols, files, and Markdown headings.

- Impact analysis, the main tool: `graphify affected "organizationsTable"` (reverse traversal; `--depth N`, default 2).
- Path between two files or symbols: `graphify path "auth.instance.ts" "todos.module.ts" --undirected` (the default directed search often finds no path).
- Symbol summary: `graphify explain "organizationsTable"`.
- Neighbourhood of a known symbol: `graphify query "organization scope" --seed organizationsTable --budget 2000`. Without `--seed`, `query` starts from keyword matches and often lands on unrelated docs.
- Architectural hubs: `graphify god-nodes --top 10`.
- Exit codes: 0 answer, 3 ambiguous name (candidates listed), 4 no match.

Upstream releases frequently; confirm flags with `graphify --help` before relying on one you have not already run in this repo.

## Safety Rules

- `graphify-out/` is local assistant state, gitignored and dockerignored. Never commit it, and never paste generated reports into tracked docs or Serena memories.
- Treat graph answers as leads, not ground truth. Verify paths and symbols against the working tree before editing. `affected` misses names bound by destructuring a dynamic `import()` and keys of a `vi.mock` factory object (on 2026-10-26 it found 18 of 22 files that use `organizationsTable`), so confirm a blast radius with grep or Serena before you call it complete.
- Never trust a stale graph. The status line counts commits and changed files since the recorded build; refresh first or fall back to direct reading.
- Never run any Graphify installer: `graphify install` (with or without `--platform`), `graphify <platform> install`, or `graphify hook install`. The platform installers write into the repo for several agents (`.cursor/rules/`, `.opencode/plugins/`, `GEMINI.md`, `.gemini/settings.json`) and into `AGENTS.md`/`CLAUDE.md`, which are generated here. The Claude variant also adds an "always query the graph first" rule to `~/.claude/CLAUDE.md`, which conflicts with this skill. `hook install` writes git hooks into the husky directory and a merge driver into git config. This skill is the only Graphify skill.
- The repo does not use git hooks or a PreToolUse nudge to refresh the graph. `but commit` skips husky hooks by default, so the status line plus refresh-on-use is the freshness mechanism.

## MCP (optional)

The team catalog ships an opt-in `graphify` MCP server (`default: false` in `.ai/mcp.json`) exposing query, path, and impact tools over stdio via `graphify-mcp`. Enable it per developer by re-running interactive `pnpm ai:install` and selecting it at the opt-in prompt. Build the graph first so `graphify-out/graph.json` exists. The server reloads `graph.json` when it changes. The CLI stays the primary query path, so the rules above do not depend on the server.
