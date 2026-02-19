import { describe, expect, it } from "vitest";

import {
  insertInvitationSchema,
  insertMemberSchema,
  insertOrganizationSchema,
  selectOrganizationSchema
} from "./organizations.validator";

describe("organizations.validator", () => {
  it("accepts valid organization payloads", () => {
    const parsed = insertOrganizationSchema.parse({
      name: "Personal",
      slug: "personal",
      userId: "550e8400-e29b-41d4-a716-446655440000"
    });

    expect(parsed.name).toBe("Personal");
    expect(parsed.slug).toBe("personal");
  });

  it("accepts valid member payloads", () => {
    const parsed = insertMemberSchema.parse({
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
      role: "owner",
      userId: "550e8400-e29b-41d4-a716-446655440000"
    });

    expect(parsed.role).toBe("owner");
  });

  it("accepts valid invitation payloads", () => {
    const parsed = insertInvitationSchema.parse({
      email: "new@member.test",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      inviterId: "550e8400-e29b-41d4-a716-446655440000",
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
      role: "member",
      status: "pending"
    });

    expect(parsed.status).toBe("pending");
  });

  it("accepts selected organization rows", () => {
    const parsed = selectOrganizationSchema.parse({
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      id: "550e8400-e29b-41d4-a716-446655440010",
      logo: null,
      metadata: null,
      name: "Personal",
      slug: "personal",
      userId: "550e8400-e29b-41d4-a716-446655440000"
    });

    expect(parsed.name).toBe("Personal");
  });
});
