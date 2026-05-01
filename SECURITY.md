# Security Policy

## Reporting a Vulnerability

Do not open a public issue with exploit details.

Report privately to the maintainers with:

- affected workspace or component
- impact summary
- reproduction steps
- suggested remediation, if known

Until a dedicated security contact is published, open a private maintainer channel and include `SECURITY` in the title.

## Response Expectations

- Initial triage target: within 3 business days.
- Confirmation and severity assignment after reproduction.
- Fix timeline based on severity, exploitability, and blast radius.

## Supported Surfaces

- API auth/session handling.
- GraphQL input validation, depth limiting, and resolver authorization.
- Organization-scoped data access.
- CORS/preflight configuration.
- Client/server environment variable handling.
- S3-compatible storage integration.
- Docker runtime configuration.
- Dependency supply chain checks.

## Template Hardening Rules

- Never commit `.env` files, secrets, tokens, or local assistant state.
- Keep `.ai/mcp.json` generic and placeholder-only.
- Keep org-specific MCP servers, Jira, CodeRabbit, and private automation out of the template by default.
- Prefer least-privilege defaults for external integrations.
- Rotate secrets immediately if exposure is suspected.
- Validate inputs at API boundaries.
- Use Drizzle parameterized queries instead of handwritten SQL interpolation.
- Keep cookies primary for browser auth and bearer-token fallback limited to session-token transport.

## Automation

- Dependency audit and secret scanning: `.github/workflows/security.yml`.
- PR quality/security gate: `.github/workflows/ci-pr.yml`.
- AI tooling health/drift check: `pnpm ai:doctor`.
