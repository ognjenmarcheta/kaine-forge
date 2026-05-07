import { describe, expect, it, vi } from "vitest";

import * as queryModule from "./index";
import {
  applyActiveOrganizationSession,
  createActiveOrganizationLifecycle,
  createOrgScopedQueryRegistry,
  createQueryRuntime,
  createActiveOrganizationQueryKey,
  queryKeys,
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
  it("does not expose hidden global org-scoped query helpers", () => {
    expect("registerOrgScopedQueryKey" in queryModule).toBe(false);
    expect("registerOrgScopedOperationKey" in queryModule).toBe(false);
    expect("clearOrgScopedQueryKeys" in queryModule).toBe(false);
    expect("invalidateOrgScopedQueries" in queryModule).toBe(false);
    expect("resetAuthBoundQueries" in queryModule).toBe(false);
  });

  it("uses an explicit Query Runtime registry for operation registration and auth resets", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const removeQueries = vi.fn();
    const runtime = createQueryRuntime();

    runtime.registerOrgScopedOperation("todos.list", ["GetTodos"]);
    runtime.registerOrgScopedOperation("todos.list", ["GetTodos", { filter: "open" }]);

    await runtime.invalidateOrgScopedQueries({
      invalidateQueries
    });
    runtime.resetAuthBoundQueries({
      removeQueries
    });

    expect(runtime.getOrgScopedQueryKeys()).toEqual([
      queryKeys.organizationMembersScope(),
      ["GetTodos", { filter: "open" }]
    ]);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.organizationMembersScope()
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["GetTodos", { filter: "open" }]
    });
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.session()
    });
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["GetTodos", { filter: "open" }]
    });
  });

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
    const queryRuntime = createQueryRuntime();
    queryRuntime.registerOrgScopedOperation("todos.list", ["GetTodos"]);
    const session = {
      activeOrganizationId: "org-1"
    };

    await applyActiveOrganizationSession({
      queryClient: {
        invalidateQueries,
        setQueryData
      },
      queryRuntime,
      session,
      persistActiveOrganizationId
    });

    expect(setQueryData).toHaveBeenCalledWith(queryKeys.session(), session);
    expect(persistActiveOrganizationId).toHaveBeenCalledWith("org-1");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.organizationMembersScope()
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["GetTodos"]
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
    const queryRuntime = createQueryRuntime();
    const lifecycle = createActiveOrganizationLifecycle({
      isOrganizationUiVisible: () => true,
      persistActiveOrganizationId,
      queryClient: {
        invalidateQueries,
        setQueryData
      },
      queryRuntime,
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
    const queryRuntime = createQueryRuntime();
    const lifecycle = createActiveOrganizationLifecycle({
      isOrganizationUiVisible: () => false,
      persistActiveOrganizationId: async () => undefined,
      queryClient: {
        invalidateQueries: async () => undefined,
        setQueryData: () => undefined
      },
      queryRuntime,
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

describe("QueryRuntime.resetAuthBoundQueries", () => {
  it("removes auth, organization, and registered org-scoped query keys", () => {
    const removeQueries = vi.fn();
    const queryRuntime = createQueryRuntime();
    queryRuntime.registerOrgScopedOperation("todos.list", ["Todos"]);

    queryRuntime.resetAuthBoundQueries({
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
