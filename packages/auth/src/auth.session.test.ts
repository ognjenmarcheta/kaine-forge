import { describe, expect, it, vi } from "vitest";

import { createClientSessionLifecycle } from "./auth.session";
import type { AuthSession, ClientAuth } from "./auth.type";

function session(activeOrganizationId = "org-1"): AuthSession {
  return {
    activeOrganizationId,
    expiresAt: "2026-01-01T00:00:00.000Z",
    user: {
      id: "user-1",
      email: "user@example.com",
      emailVerified: false,
      name: "User"
    }
  };
}

function clientAuth(overrides: Partial<ClientAuth> = {}): ClientAuth {
  return {
    async createOrganization() {
      return session();
    },
    async getSession() {
      return session();
    },
    async listOrganizations() {
      return {
        activeOrganizationId: "org-1",
        organizations: []
      };
    },
    async loginWithPassword() {
      return session();
    },
    async logout() {
      return undefined;
    },
    async setActiveOrganization() {
      return session();
    },
    async signupWithPassword() {
      return session();
    },
    ...overrides
  };
}

describe("createClientSessionLifecycle", () => {
  it("refreshes, persists, and returns the server Session", async () => {
    const nextSession = session("org-2");
    const setStoredSession = vi.fn(async () => undefined);
    const lifecycle = createClientSessionLifecycle({
      auth: clientAuth({
        async getSession() {
          return nextSession;
        }
      }),
      persistence: {
        async getStoredSession() {
          return session("stored-org");
        },
        setStoredSession
      }
    });

    await expect(lifecycle.refreshSession()).resolves.toEqual(nextSession);

    expect(setStoredSession).toHaveBeenCalledWith(nextSession);
  });

  it("can fall back to a stored Session when refresh fails", async () => {
    const storedSession = session("stored-org");
    const onRefreshError = vi.fn();
    const lifecycle = createClientSessionLifecycle({
      auth: clientAuth({
        async getSession() {
          throw new Error("network unavailable");
        }
      }),
      fallbackToStoredSession: true,
      onRefreshError,
      persistence: {
        async getStoredSession() {
          return storedSession;
        },
        async setStoredSession() {
          return undefined;
        }
      }
    });

    await expect(lifecycle.refreshSession()).resolves.toEqual(storedSession);
    expect(onRefreshError).toHaveBeenCalledWith(new Error("network unavailable"));
  });

  it("persists login/signup results and clears Session storage on logout", async () => {
    const setStoredSession = vi.fn(async () => undefined);
    const clearSessionToken = vi.fn(async () => undefined);
    const auth = clientAuth();
    const lifecycle = createClientSessionLifecycle({
      auth,
      persistence: {
        async getStoredSession() {
          return null;
        },
        setStoredSession,
        clearSessionToken
      }
    });

    await lifecycle.loginWithPassword({
      email: "user@example.com",
      password: "secret"
    });
    await lifecycle.signupWithPassword({
      email: "new@example.com",
      name: "New User",
      password: "secret"
    });
    await lifecycle.logout();

    expect(setStoredSession).toHaveBeenNthCalledWith(1, session());
    expect(setStoredSession).toHaveBeenNthCalledWith(2, session());
    expect(setStoredSession).toHaveBeenLastCalledWith(null);
    expect(clearSessionToken).toHaveBeenCalledOnce();
  });
});
