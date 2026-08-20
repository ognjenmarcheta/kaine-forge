---
name: kaine-secret-scan
description: Run a full-history gitleaks secret scan and triage its findings before history becomes more visible.
argument-hint: optional scope or suspected commit range
---

# Secret Scan

Use this skill before repository history becomes more visible or leaves the machine: repository visibility changes, mirroring or transferring the repo, publishing a fork, or after a commit that may have included credentials.

## Workflow

1. Confirm gitleaks is installed: `gitleaks version`. If missing: `brew install gitleaks` (see README Prerequisites).
2. Run `pnpm scan:secrets` from the repo root. It scans the **full git history**, not only the worktree.
3. For a suspected range only, narrow with `gitleaks git . --log-opts="<range>"`.
4. Triage every finding:
   - False positive (test fixture, example value, documented placeholder): add a targeted `.gitleaksignore` entry or inline `gitleaks:allow` comment, and state why in the PR.
   - Real secret: stop and report to a human. The secret must be rotated at its provider first. History rewriting is a separate human decision — never rewrite or force-push autonomously.
5. Re-run `pnpm scan:secrets` until it exits clean.

## Rules

- A clean scan is evidence, not a guarantee; never claim "no secrets" without the scan output.
- Never commit `.env`, `credentials.json`, `*.pem`, or other secret-shaped files, even to "fix" a finding.
- CI runs the same scan via `gitleaks/gitleaks-action` in `.github/workflows/security.yml` (schedule + pushes to `main`). Local runs are the fallback when CI cannot run and the gate before visibility changes.
