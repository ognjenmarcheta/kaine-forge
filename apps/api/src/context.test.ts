import type { ServerAuth } from "@repo/auth/auth.type";
import { createLogger } from "@repo/logger";
import { describe, expect, it, vi } from "vitest";

import { createContextFromHeaders } from "./context";

vi.mock("@repo/auth/server", () => ({
  createServerAuth: vi.fn()
}));

vi.mock("@repo/db", () => ({
  db: {}
}));

describe("createContextFromHeaders", () => {
  it("reuses the injected ServerAuth adapter for Session and membership resolution", async () => {
    const auth = {
      getCurrentOrganizationByScope: vi.fn(async () => null),
      getOrganizationMembershipProof: vi.fn(async () => ({
        id: "membership-1",
        organizationId: "org-1",
        role: "owner",
        userId: "user-1"
      })),
      getSessionFromHeaders: vi.fn(async () => ({
        activeOrganizationId: "org-1",
        expiresAt: "2026-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          emailVerified: true,
          id: "user-1",
          name: "User"
        }
      })),
      listInvitationsByScope: vi.fn(async () => []),
      listOrganizationMembersByScope: vi.fn(async () => []),
      listOrganizationsByScope: vi.fn(async () => [])
    } satisfies ServerAuth;

    const context = await createContextFromHeaders(
      {
        authorization: "Bearer session-token"
      },
      createLogger({ name: "test" }),
      auth
    );

    expect(context.auth).toBe(auth);
    expect(auth.getSessionFromHeaders).toHaveBeenCalledWith({
      authorization: "Bearer session-token"
    });
    expect(auth.getOrganizationMembershipProof).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1"
    });
  });
});
