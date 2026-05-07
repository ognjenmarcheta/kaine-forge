import { describe, expect, it, vi } from "vitest";

import {
  applyActiveOrganizationSession,
  invalidateOrgScopedQueries,
  queryKeys,
  resolvePreferredActiveOrganizationId
} from "./index";

describe("query keys", () => {
  it("builds stable auth and organization keys", () => {
    expect(queryKeys.session()).toEqual(["auth", "session"]);
    expect(queryKeys.organizations()).toEqual(["organizations"]);
    expect(queryKeys.organizationMembers("org-1")).toEqual(["organizations", "members", "org-1"]);
  });
});

describe("invalidateOrgScopedQueries", () => {
  it("invalidates generated todos and organization members scope", async () => {
    const invalidateQueries = vi.fn(async () => undefined);

    await invalidateOrgScopedQueries({
      invalidateQueries
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["GetTodos"]
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["GetMobileTodos"]
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
      queryKey: ["organizations", "members"]
    });
  });
});

describe("resolvePreferredActiveOrganizationId", () => {
  it("prefers a remembered Organization when it is available", () => {
    expect(
      resolvePreferredActiveOrganizationId({
        fallbackOrganizationId: "org-1",
        organizations: [{ id: "org-1" }, { id: "org-2" }],
        rememberedOrganizationId: "org-2"
      })
    ).toBe("org-2");
  });

  it("falls back to the first Organization, then the Session fallback", () => {
    expect(
      resolvePreferredActiveOrganizationId({
        fallbackOrganizationId: "session-org",
        organizations: [{ id: "org-1" }],
        rememberedOrganizationId: "missing"
      })
    ).toBe("org-1");

    expect(
      resolvePreferredActiveOrganizationId({
        fallbackOrganizationId: "session-org",
        organizations: [],
        rememberedOrganizationId: "missing"
      })
    ).toBe("session-org");
  });
});

describe("applyActiveOrganizationSession", () => {
  it("updates the Session cache, persists Active Organization, and invalidates scoped queries", async () => {
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn(async () => undefined);
    const persistActiveOrganizationId = vi.fn(async () => undefined);
    const session = {
      activeOrganizationId: "org-1"
    };

    await applyActiveOrganizationSession({
      queryClient: {
        invalidateQueries,
        setQueryData
      },
      session,
      persistActiveOrganizationId
    });

    expect(setQueryData).toHaveBeenCalledWith(queryKeys.session(), session);
    expect(persistActiveOrganizationId).toHaveBeenCalledWith("org-1");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["GetTodos"]
    });
  });
});
