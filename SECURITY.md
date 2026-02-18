# Security Policy

## Reporting a vulnerability

If you discover a security issue, do not open a public issue with exploit details.

Please report privately with:

- affected component/workspace
- impact summary
- reproduction steps
- suggested remediation (if known)

Until a dedicated security contact is published, open a private channel with maintainers and include `SECURITY` in the title.

## Response expectations

- Initial triage target: within 3 business days
- Confirmation and severity assignment after reproduction
- Fix timeline based on severity and blast radius

## Supported surfaces

- API auth/session handling
- GraphQL input validation and resolver authorization
- client/server environment variable handling
- dependency supply chain checks

## Security automation in this repo

- Dependency audit workflow: `.github/workflows/security.yml`
- Secret scanning workflow: `.github/workflows/security.yml`

## Hardening checklist

- Keep `.env*` files gitignored.
- Rotate secrets if exposure is suspected.
- Validate inputs at boundaries.
- Prefer least-privilege defaults for integrations.
