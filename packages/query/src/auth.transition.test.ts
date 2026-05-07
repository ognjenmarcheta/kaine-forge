import { describe, expect, it, vi } from "vitest";

import { createClientAuthTransition, createQueryRuntime, queryKeys } from "./index";

describe("createClientAuthTransition", () => {
  it("writes login and signup Sessions then invalidates Organizations", async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => undefined),
      removeQueries: vi.fn(),
      setQueryData: vi.fn()
    };
    const loginWithPassword = vi.fn(async () => ({ activeOrganizationId: "org-1" }));
    const signupWithPassword = vi.fn(async () => ({ activeOrganizationId: "org-2" }));
    const transition = createClientAuthTransition({
      loginWithPassword,
      logout: async () => undefined,
      queryClient,
      queryRuntime: createQueryRuntime(),
      signupWithPassword
    });

    await transition.login({ email: "user@example.com", password: "secret" });
    await transition.signup({ email: "new@example.com", name: "New User", password: "secret" });

    expect(queryClient.setQueryData).toHaveBeenNthCalledWith(1, queryKeys.session(), {
      activeOrganizationId: "org-1"
    });
    expect(queryClient.setQueryData).toHaveBeenNthCalledWith(2, queryKeys.session(), {
      activeOrganizationId: "org-2"
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.organizations()
    });
  });

  it("disposes subscriptions and resets auth-bound queries through the runtime on logout", async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => undefined),
      removeQueries: vi.fn(),
      setQueryData: vi.fn()
    };
    const queryRuntime = createQueryRuntime();
    const disposeSubscriptions = vi.fn();
    queryRuntime.registerOrgScopedOperation("todos.list", ["GetTodos"]);
    const transition = createClientAuthTransition({
      loginWithPassword: async () => ({ activeOrganizationId: "org-1" }),
      logout: async () => undefined,
      queryClient,
      queryRuntime,
      signupWithPassword: async () => ({ activeOrganizationId: "org-1" }),
      disposeSubscriptions
    });

    await transition.logout();

    expect(disposeSubscriptions).toHaveBeenCalledOnce();
    expect(queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.session()
    });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.organizations()
    });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: ["GetTodos"]
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(queryKeys.session(), null);
  });
});
