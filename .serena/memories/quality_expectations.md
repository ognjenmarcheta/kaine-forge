<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->

# Coverage And Quality Expectations

- The repo expects strict TypeScript, lint, formatting, tests, and coverage checks in CI.
- CI runs changeset enforcement for source changes unless `release:skip-changeset` is applied.
- Coverage threshold is configured through the Vitest coverage setup.
- Security-sensitive changes should include tests for auth, CORS, tenancy, token handling, or data access.
- Template changes should avoid downstream product assumptions.
- Generated files should be produced by their generators and checked for drift.
