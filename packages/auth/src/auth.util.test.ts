import { describe, expect, it } from "vitest";

import {
  getSessionTokenFromHeaders,
  resolveActiveOrganizationId,
  slugifyOrganizationName
} from "./auth.util";

describe("getSessionTokenFromHeaders", () => {
  it("extracts token from a well-formed Bearer header", () => {
    const headers = new Headers({ authorization: "Bearer abc123" });
    expect(getSessionTokenFromHeaders(headers)).toBe("abc123");
  });

  it("detects bearer scheme case-insensitively", () => {
    expect(getSessionTokenFromHeaders(new Headers({ authorization: "bearer tok1" }))).toBe("tok1");
    expect(getSessionTokenFromHeaders(new Headers({ authorization: "BEARER tok2" }))).toBe("tok2");
    expect(getSessionTokenFromHeaders(new Headers({ authorization: "BeArEr tok3" }))).toBe("tok3");
  });

  it("falls back to cookie when Authorization header is missing", () => {
    const headers = new Headers({ cookie: "kaine_session=cookie-token" });
    expect(getSessionTokenFromHeaders(headers)).toBe("cookie-token");
  });

  it("prefers Bearer token over cookie", () => {
    const headers = new Headers({
      authorization: "Bearer bearer-token",
      cookie: "kaine_session=cookie-token"
    });
    expect(getSessionTokenFromHeaders(headers)).toBe("bearer-token");
  });

  it("falls through to cookie when Bearer has no token value", () => {
    const headers = new Headers({
      authorization: "Bearer ",
      cookie: "kaine_session=fallback"
    });
    expect(getSessionTokenFromHeaders(headers)).toBe("fallback");
  });

  it("falls through to cookie when scheme is not Bearer", () => {
    const headers = new Headers({
      authorization: "Basic abc123",
      cookie: "kaine_session=fallback"
    });
    expect(getSessionTokenFromHeaders(headers)).toBe("fallback");
  });

  it("returns null when no Authorization header and no cookie", () => {
    expect(getSessionTokenFromHeaders(new Headers())).toBeNull();
  });
});

describe("auth.util", () => {
  it("keeps active organization when it is still available", () => {
    const activeOrganizationId = resolveActiveOrganizationId({
      availableOrganizationIds: ["org-1", "org-2"],
      requestedActiveOrganizationId: "org-2"
    });

    expect(activeOrganizationId).toBe("org-2");
  });

  it("falls back to first available organization", () => {
    const activeOrganizationId = resolveActiveOrganizationId({
      availableOrganizationIds: ["org-1", "org-2"],
      requestedActiveOrganizationId: "org-missing"
    });

    expect(activeOrganizationId).toBe("org-1");
  });

  it("returns null when user has no organizations", () => {
    const activeOrganizationId = resolveActiveOrganizationId({
      availableOrganizationIds: [],
      requestedActiveOrganizationId: "org-1"
    });

    expect(activeOrganizationId).toBeNull();
  });

  it("slugifies organization names", () => {
    expect(slugifyOrganizationName(" Acme Workspace ")).toBe("acme-workspace");
    expect(slugifyOrganizationName("Team___42!!!")).toBe("team-42");
  });

  it("falls back to default slug when name has no valid characters", () => {
    expect(slugifyOrganizationName("   ---___***   ")).toBe("organization");
  });
});
