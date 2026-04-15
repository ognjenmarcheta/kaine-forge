# Claude Code configuration

This directory is (almost) entirely **generated** from the canonical sources in [`.ai/`](../.ai/). Do not edit files here by hand unless they are marked as personal.

**To change anything agent-facing**, edit the source in `.ai/` and run `pnpm ai:sync`. See [`.ai/skills/sync-docs.md`](../.ai/skills/sync-docs.md) for details.

## What's in this directory

### Generated from `.ai/` (do not edit)

| Path                     | Generated from         |
| ------------------------ | ---------------------- |
| `skills/<name>/SKILL.md` | `.ai/skills/<name>.md` |

### Hand-edited (Claude Code runtime only)

| Path                  | Purpose                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `settings.json`       | Team-level Claude Code settings (permissions, hooks, enabled plugins). Committed. |
| `settings.local.json` | Your personal overrides. Gitignored.                                              |

### Personal (gitignored)

| Path                | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `hooks/`            | Hook scripts                              |
| `plans/`            | Ephemeral planning files                  |
| `skills/_personal/` | Support files referenced by shared skills |

Personal skills live at the top level because Claude Code does not scan nested subdirectories under `skills/`.

## Adding a team skill

Create `.ai/skills/<name>.md` with frontmatter:

```yaml
---
name: <name>
description: One sentence on when to use this skill.
argument-hint: <optional>
---
```

Run `pnpm ai:sync`. The generated `.claude/skills/<name>/SKILL.md` and `.cursor/rules/skill-<name>.mdc` appear automatically.

## Adding a personal skill

Create it under `.claude/skills/_<name>/SKILL.md` (note the underscore prefix). The sync script skips directories starting with `_` during stale cleanup.

Add the directory to `.gitignore`:

```text
.claude/skills/_<name>/
```

## MCP servers

Team MCP servers are configured once in [`.ai/mcp.json`](../.ai/mcp.json). The sync generates:

- `.mcp.json` (Claude Code)
- `.cursor/mcp.json` (Cursor)
- `.codex/config.toml` (Codex)

## Serena

The Serena MCP server is wired up via `.ai/mcp.json`. The project-level Serena setup (`.serena/project.yml` and the pre-built memories under `.serena/memories/`) is generated from `.ai/serena-project.yml` and `.ai/serena-memories/`.

## Enforcement

- `pnpm ai:sync` — regenerate everything
- `pnpm ai:sync:check` — exit 1 if any generated file is out-of-date
- Pre-push hook runs `--check` so drift cannot leave your machine
