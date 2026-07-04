import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  db: {},
  sessionsTable: {},
  usersTable: {}
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn()
}));

const { toAuthSession } = await import("./auth.server.session");

describe("toAuthSession", () => {
  // getSessionFromHeaders re-resolves the user row on every request, so a
  // completed verification is visible on the very next session read as long as
  // toAuthSession exposes the flag from that fresh row.
  it("exposes emailVerified from the freshly resolved user row", () => {
    const expiresAt = new Date("2026-01-01T00:00:00.000Z");

    const session = toAuthSession({
      activeOrganizationId: "org-1",
      expiresAt,
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: true,
        name: "User"
      }
    });

    expect(session.user).toEqual({
      id: "user-1",
      email: "user@example.com",
      emailVerified: true,
      name: "User"
    });
    expect(session.expiresAt).toBe(expiresAt.toISOString());
  });
});
