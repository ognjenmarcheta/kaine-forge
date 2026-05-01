# AI assistant configuration

The committed AI setup is split into shared canonical sources and local install state. `pnpm ai:install` reads the canonical sources and writes per-agent configs into gitignored locations.

## Shared, committed

| Path                       | Purpose                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `AGENTS.md`                | Generated repository instructions for all agents from `.ai/guide.md`. |
| `CLAUDE.md`                | One-line `@AGENTS.md` import.                                         |
| `.ai/guide.md`             | Canonical guide content for AGENTS/Claude.                            |
| `.ai/skills/kaine-*.md`    | Shared skill sources. Names must start with `kaine-`.                 |
| `.ai/mcp.json`             | Shared MCP server catalog. Secrets stay in local env vars.            |
| `.ai/cursor-rules.md`      | Cursor rule source, installed locally only when requested.            |
| `.ai/serena-project.yml`   | Canonical Serena project source.                                      |
| `.ai/serena-memories/*.md` | Canonical Serena memory sources.                                      |

## Local, gitignored

| Path                                                              | Purpose                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `.claude/skills/kaine-<name>/SKILL.md`                            | Installed Claude skills.                                                     |
| `.agents/skills/kaine-<name>/SKILL.md`                            | Installed Codex skills. Codex reads `.agents/skills/`, not `.codex/skills/`. |
| `.cursor/skills/kaine-<name>/SKILL.md`                            | Installed Cursor skills.                                                     |
| `.opencode/skills/kaine-<name>/SKILL.md`                          | Installed OpenCode skills.                                                   |
| `.mcp.json`                                                       | Installed Claude MCP config.                                                 |
| `.codex/config.toml`                                              | Installed Codex MCP config.                                                  |
| `.cursor/mcp.json`, `.cursor/rules/`                              | Installed Cursor config.                                                     |
| `opencode.json`                                                   | Installed OpenCode MCP config.                                               |
| `.ai.local/mcp.env`                                               | Personal env-var values for `${VAR}` substitution.                           |
| `.ai.local/mcp.json`                                              | Personal MCP servers, merged into every per-tool config.                     |
| `.claude/settings.local.json`, `.claude/hooks/`, `.claude/plans/` | Personal Claude runtime state.                                               |

## Ownership: the `kaine-` prefix rule

Skills whose names start with `kaine-` are team-managed. The installer creates and updates them on every run.

Skills with any other name are yours. The installer never touches them.

To customize a team skill, copy it to a non-prefixed name and edit the copy. The original keeps getting updates; your fork is permanent.

```bash
cp -r .claude/skills/kaine-open-pr .claude/skills/open-pr-mine
```

The `kaine-` prefix is reserved. Do not use it for personal skills.

## Commands

```bash
pnpm ai:install --agent claude
pnpm ai:install --agent codex
pnpm ai:install --agent cursor
pnpm ai:install --agent opencode
pnpm ai:doctor
```

`pnpm ai:install` installs local skills and MCP config for the selected agent. With no flags it prompts interactively. It writes gitignored files; team skills are always overwritten so the team source is the source of truth.

`pnpm ai:doctor` reports local install status, MCP command availability, missing environment variables, skill lint errors, and drift. It exits non-zero if any skill fails lint.

## Serena

The Serena SessionStart hook is configured in `settings.json` so Claude automatically asks Serena for its system prompt override when available. Shared Serena project config and memories are generated from `.ai/serena-project.yml` and `.ai/serena-memories/`.
