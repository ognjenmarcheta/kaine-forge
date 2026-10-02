# ADR 0010: Local factory dashboard

## Status

Accepted for the optional software factory.

## Context

Factory runs keep their records in their originating checkout. One dashboard
discovers the primary checkout and linked worktrees with Git. The controller holds GitHub access and
supervises Docker workers. The product GraphQL API uses authenticated Organization
scope. Exposing factory controls through that API would mix developer credentials
and product sessions.

## Decision

Keep the React/Vite interface in the private `@repo/factory-ui` tooling workspace.
Its public `./contracts` export contains the browser/server Zod contract. Keep the
trusted Node HTTP adapter and execution helpers under canonical `.ai/` sources.
The adapter serves built assets and its API on `127.0.0.1` from one origin.

This API is local developer tooling, outside the Organization-scoped product API.
It has no database, product session, tenant identifier, deployment Dockerfile, or
remote listener. It reads filtered projections of existing local records. Actions
start fixed CLI commands in supervised child processes. The controller remains
the authority for readiness, locking, validation, and GitHub publication.

The trusted controller installation is separate from the selected checkout.
Actions use worktree IDs and fixed commands from that installation. A directory
under Git's common directory coordinates two execution slots, one run per checkout,
issue ownership, persistent action keys, and completed readiness decisions.
Validation and calls using the same subscription credentials are serialized.
Retries stay in the original checkout. Interrupted leases require explicit recovery.

Run-specific Docker volumes hold candidate checkouts and dependency trees.
Git bundles and bounded, registered artifacts form the transfer boundary.
Dependency fetch retains the npm-only proxy; installation and checks are offline.
Cleanup verifies ownership and preserves the original failure when cleanup fails.

A one-use fragment token establishes a per-launch HttpOnly, SameSite=Strict cookie.
Host and Origin checks protect writes. No provider credentials enter the browser.
Artifacts use registered IDs, containment checks, and symlink rejection. Active
HTML is downloaded. Model source proposals and private reasoning are not streamed.

## Consequences

The dashboard runs only while its foreground command runs. Browser tabs can close
without stopping work. Dashboard shutdown stops only child processes it owns and
verifies their container cleanup. An interrupted process requires explicit action;
the dashboard never resumes it automatically. GitHub readiness and owner merging
remain separate from execution success. Polling still requires live provider
pilots and an owner-approved issue that produced a verified draft PR.
