---
name: sync-docs
description: Regenerate and validate generated AI assistant files from canonical .ai sources.
argument-hint: optional scope or reason
---

<!-- GENERATED FROM .ai; DO NOT EDIT DIRECTLY. Run pnpm ai:sync. -->

# Sync AI Assistant Files

Use this skill when `.ai/` sources changed or when generated assistant files may have drifted.

## Workflow

1. Read `.ai/guide.md`, `.ai/skills/`, `.ai/mcp.json`, `.ai/cursor-rules.md`, and `.ai/serena-memories/` as needed.
2. Run `pnpm ai:sync`.
3. Run `pnpm ai:sync:check`.
4. If `--check` reports drift, inspect the named files and rerun `pnpm ai:sync`.
5. Never edit generated files directly unless the generator itself is the subject under test.

## Generated Outputs

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/skills/<skill>/SKILL.md`
- `.codex/skills/<skill>/SKILL.md`
- `.cursor/rules/skill-<skill>.mdc`
- `.mcp.json`
- `.cursor/mcp.json`
- `.codex/config.toml`
- `.cursor/rules/kaine-forge-rules.mdc`
- `.serena/memories/*.md`

Generated files include a notice. Personal/local assistant files must remain untouched.
