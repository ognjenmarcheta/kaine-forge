import { describe, expect, it, vi } from "vitest";

import {
  applyActiveOrganizationSession,
  createActiveOrganizationLifecycle,
  createOrgScopedQueryRegistry,
  createActiveOrganizationQueryKey,
  clearOrgScopedQueryKeys,
  invalidateOrgScopedQueries,
  queryKeys,
  registerOrgScopedQueryKey,
  resetAuthBoundQueries,
  resolvePreferredActiveOrganizationId
} from "./index";

describe("query keys", () => {
  it("builds stable auth and organization keys", () => {
    expect(queryKeys.session()).toEqual(["auth", "session"]);
    expect(queryKeys.organizations()).toEqual(["organizations"]);
    expect(queryKeys.organizationMembersScope()).toEqual(["organizations", "members"]);
    expect(queryKeys.organizationMembers("org-1")).toEqual(["organizations", "members", "org-1"]);
  });

  it("appends Active Organization identity to scoped query keys", () => {
    expect(createActiveOrganizationQueryKey(["GetTodos", { limit: 50 }], "org-1")).toEqual([
      "GetTodos",
      { limit: 50 },
      "org-1"
    ]);
    expect(createActiveOrganizationQueryKey(["GetTodos"], null)).toEqual(["GetTodos", "inactive"]);
  });
});

describe("invalidateOrgScopedQueries", () => {
  it("registers org-scoped operations by feature-owned names", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const registry = createOrgScopedQueryRegistry();

    registry.registerOperation("todos.list", ["GetTodos"]);
    registry.registerOperation("todos.list", ["GetTodos", { filter: "open" }]);
    registry.registerOperation("organizations.members", queryKeys.organizationMembersScope());

    await registry.invalidateOrgScopedQueries({
      invalidateQueries
    });

    expect(registry.getOperationKeys()).toEqual([
      ["GetTodos", { filter: "open" }],
      queryKeys.organizationMembersScope()
    ]);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["GetTodos", { filter: "open" }]
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.organizationMembersScope()
    });
  });

  it("invalidates registered operation keys and organization members scope", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    clearOrgScopedQueryKeys();
    registerOrgScopedQueryKey(["Todos"]);

    await invalidateOrgScopedQueries({
      invalidateQueries
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: queryKeys.organizationMembersScope()
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["Todos"]
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
      queryKey: queryKeys.organizationMembersScope()
    });
  });
});

describe("createActiveOrganizationLifecycle", () => {
  it("applies remembered Active Organization when visible and available", async () => {
    const setActiveOrganization = vi.fn(async (organizationId: string) => ({
      activeOrganizationId: organizationId
    }));
    const persistActiveOrganizationId = vi.fn(async () => undefined);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn(async () => undefined);
    const lifecycle = createActiveOrganizationLifecycle({
      isOrganizationUiVisible: () => true,
      persistActiveOrganizationId,
      queryClient: {
        invalidateQueries,
        setQueryData
      },
      readActiveOrganizationId: async () => "org-2",
      setActiveOrganization
    });

    await lifecycle.sync({
      organizations: [{ id: "org-1" }, { id: "org-2" }],
      session: {
        activeOrganizationId: "org-1"
      }
    });

    expect(setActiveOrganization).toHaveBeenCalledWith("org-2");
    expect(setQueryData).toHaveBeenCalledWith(queryKeys.session(), {
      activeOrganizationId: "org-2"
    });
    expect(persistActiveOrganizationId).toHaveBeenCalledWith("org-2");
  });

  it("ignores remembered Active Organization when organization UI is hidden", async () => {
    const setActiveOrganization = vi.fn(async (organizationId: string) => ({
      activeOrganizationId: organizationId
    }));
    const lifecycle = createActiveOrganizationLifecycle({
      isOrganizationUiVisible: () => false,
      persistActiveOrganizationId: async () => undefined,
      queryClient: {
        invalidateQueries: async () => undefined,
        setQueryData: () => undefined
      },
      readActiveOrganizationId: async () => "org-2",
      setActiveOrganization
    });

    await lifecycle.sync({
      organizations: [{ id: "org-1" }, { id: "org-2" }],
      session: {
        activeOrganizationId: "org-1"
      }
    });

    expect(setActiveOrganization).not.toHaveBeenCalled();
  });
});

describe("resetAuthBoundQueries", () => {
  it("removes auth, organization, and registered org-scoped query keys", () => {
    const removeQueries = vi.fn();
    clearOrgScopedQueryKeys();
    registerOrgScopedQueryKey(["Todos"]);

    resetAuthBoundQueries({
      removeQueries
    });

    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.session()
    });
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.organizations()
    });
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.organizationMembersScope()
    });
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["Todos"]
    });
  });
});
