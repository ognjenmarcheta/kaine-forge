---
name: kaine-security-audit
description: Threat-model audit of existing code in one scope (workspace, feature folder, or repo) — inventory trust boundaries, check STRIDE and the OWASP Top 10 against this repo's controls, and report only findings the code proves. Not for a diff review (kaine-review) or a secret scan (kaine-secret-scan).
argument-hint: workspace, feature folder, or repo
---

# Security Audit Workflow

Use this skill to audit existing code for security defects in one scope. For a diff or PR, use `kaine-review`. For leaked secrets in history, use `kaine-secret-scan`.

## Goal and non-goals

- Goal: a threat model of the code in scope that reports only findings it can prove from the code.
- Do not fix code. Report the findings; the owner decides what to fix.
- Do not create issues unless the owner asks. Then write each one with `kaine-write-issue`.
- Never print a secret value. Name the file, line, and variable, and redact the value.
- Never probe a deployed system. Read code and run only local tests.
- Do not repeat automated checks: `kaine-secret-scan` (gitleaks), `.github/workflows/security.yml` (`pnpm audit`, gitleaks, Trivy), and CodeQL. Cite their result only when it decides a finding.

## Steps

1. **Inventory the trust boundaries.** List each place where lower-trust input enters the scope. Read the code; do not trust a doc. Verify each path before you name it. Start here for `apps/api` and the apps that call it:
   - HTTP routes in `routeRequest` in `apps/api/src/server.ts`: health, the billing webhook (`apps/api/src/features/billing/billing.webhook.router.ts`), the better-auth handler on `/api/auth/*` (`packages/auth`), and `/graphql`, including the API Key header path.
   - GraphQL: `apps/api/schema.graphql` and each feature's resolver map (`apps/api/src/features/*/*.router.ts`), for example `storage`, `public-assets`, `api-keys`, and `webhooks`.
   - Outbound requests that take a stored URL: webhook delivery (`apps/api/src/features/webhooks/webhooks.ssrf.ts`, `webhooks.transport.ts`).
   - Jobs and the worker: `apps/api/src/worker.ts` and `@repo/jobs` (`packages/jobs/src`). Job payloads are input.
   - Tauri commands: `#[tauri::command]` functions in `apps/desktop/src-tauri/src/` and the permissions in `apps/desktop/src-tauri/capabilities/`.
   - CORS and response headers: `apps/api/src/server.ts` and `apps/api/src/server.hardening.test.ts`, which covers introspection, CSRF prevention, depth, and complexity.
2. **STRIDE.** Write one table row for each boundary. Columns: boundary, entry point (`path:line`), Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege. In each cell, name the control that applies, or write the threat to check.
3. **OWASP Top 10.** Map each category to the controls of this repo, then check each control on the paths in scope:
   - Broken access control: **Authenticated Organization Scope** from the session or API Key, never a client-supplied organization id (`CONTEXT.md`); Permission checks; API Key limits.
   - Authentication failures: better-auth plugins and the scrypt password hooks (`packages/auth`, ADR 0005, ADR 0015).
   - Injection: Drizzle query builders; every `sql` template and `sql.raw`; SQL that a Tauri command receives.
   - Integrity failures: webhook signature checks (billing providers inbound, Webhook Endpoint signing outbound).
   - Insecure design and data exposure: presigned URL scope (organization, key, method, expiry) in `packages/storage` and `apps/api/src/features/storage`.
   - SSRF: every server-side fetch of a URL that a user can set.
   - Misconfiguration: CORS allowlist, CSRF header, introspection, security headers.
   - The remaining categories (cryptographic failures, vulnerable components, logging and monitoring): check only what the automated checks above do not cover.
4. **Apply the finding bar.** Report a finding only when you can show four facts in the code:
   - an entry point that an attacker controls,
   - the trust boundary that the input crosses,
   - the impact, shown in code,
   - the controls on the path, each checked and found missing or bypassable.

   Use the severity rules in `kaine-review` "Security Findings" (`Critical:`, unprefixed, `Consider:`, and "needs validation"). Do not restate them. Keep severity, confidence, and evidence in three separate columns.

5. **Refute.** For each `Critical:` or unprefixed finding, give a fresh agent the location and the finding bar from step 4. Do not give it your conclusion. Ask it to find a control on the path or to show the four facts. Drop or downgrade a finding that it refutes and you cannot re-establish.

## Report

1. The boundary table from step 2.
2. Findings: severity, confidence, and evidence columns, then `path:line` and the quoted line for each fact.
3. Needs validation: each item with the exact missing fact and the check that resolves it.
4. Controls checked with no finding, so the next audit does not repeat them.

State the scope, the files you read, and the local tests you ran with their results.

## Headless runs (Agent Desk)

When the prompt supplies a result schema, fill the schema. Do not ask the user a question. Do not run `gh`; the Agent Desk denies it. When the run supplies a diff file, take the scope from that diff. Record each unknown as a finding, and state the default you chose. Put the plain-language ending in the schema's plain-language field. Do not print a banner or add any text outside the schema.
