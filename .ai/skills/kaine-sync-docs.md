---
name: kaine-sync-docs
description: Reinstall and validate AI assistant files from canonical .ai sources.
argument-hint: optional scope or reason
---

# Sync AI Assistant Files

Use this skill when `.ai/` sources changed or when local installed assistant files may have drifted.

## Workflow

1. Read `.ai/guide.md`, `.ai/skills/`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/serena-project.yml`, and `.ai/serena-memories/` as needed.
2. Run `pnpm ai:install`.
3. Run `pnpm ai:doctor`.
4. If doctor reports drift, inspect the named canonical sources and rerun `pnpm ai:install`.
5. Never edit installed assistant files directly unless the installer or doctor is the subject under test.

## Installed Outputs

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/skills/<skill>/SKILL.md`
- `.agents/skills/<skill>/SKILL.md`
- `.cursor/skills/<skill>/SKILL.md`
- `.opencode/skills/<skill>/SKILL.md`
- `.mcp.json`
- `.cursor/mcp.json`
- `.codex/config.toml`
- `.cursor/rules/kaine-rules.mdc`
- `opencode.json`
- `.serena/project.yml`
- `.serena/memories/*.md`

Installed files include a notice where applicable. Personal/local assistant files in `.ai.local/` and non-prefixed skill directories must remain untouched.
