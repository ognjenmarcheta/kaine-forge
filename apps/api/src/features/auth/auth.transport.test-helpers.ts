import type { ServerAuth } from "@repo/auth/auth.type";
import { Readable } from "node:stream";
import { vi } from "vitest";

import { createAuthRouteTransport } from "./auth.transport";
import type { AuthRouteContext } from "./auth.type";

export function createRequest(params: {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const chunks = params.body === undefined ? [] : [Buffer.from(JSON.stringify(params.body))];
  const req = Readable.from(chunks) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = params.method;
  req.url = params.url;
  req.headers = { host: "localhost", ...params.headers };
  return req;
}

export function createResponse() {
  const headers = new Map<string, unknown>();
  return {
    statusCode: 0,
    body: "",
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end(chunk?: string) {
      this.body = chunk ?? "";
    }
  };
}

export const session = {
  user: { id: "user-1", email: "admin@example.com", name: "Admin" },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  activeOrganizationId: "org-1"
};

export function createAuthMock(overrides: Partial<ServerAuth> = {}): ServerAuth {
  return {
    getSessionFromHeaders: vi.fn().mockResolvedValue(session),
    loginWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    logout: vi.fn(),
    listOrganizationsByScope: vi.fn(),
    getCurrentOrganizationByScope: vi.fn(),
    getOrganizationMembershipProof: vi.fn(),
    setActiveOrganization: vi.fn(),
    createOrganization: vi.fn(),
    listOrganizationMembersByScope: vi.fn(),
    createInvitation: vi.fn(),
    listInvitationsByScope: vi.fn(),
    acceptInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    ...overrides
  } as ServerAuth;
}

export async function dispatch(auth: ServerAuth, req: unknown, res: unknown): Promise<boolean> {
  const transport = createAuthRouteTransport();
  return transport.dispatch({ req, res, auth } as unknown as AuthRouteContext);
}
