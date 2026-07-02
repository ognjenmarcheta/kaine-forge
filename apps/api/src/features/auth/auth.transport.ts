import { AUTH_DEFINITIONS } from "@repo/auth/auth.definition";
import {
  type CreateOrganizationInput,
  type LoginInput,
  type SignupInput
} from "@repo/auth/auth.type";
import { getSessionTokenFromHeaders } from "@repo/auth/auth.util";
import { requireAuthenticatedOrganizationScope } from "@repo/auth/scope";

import { AUTH_ROUTES } from "./auth.definition";
import type { AuthRouteContext } from "./auth.type";

export interface AuthRouteTransport {
  dispatch: (ctx: AuthRouteContext) => Promise<boolean>;
}

function sendJson(ctx: AuthRouteContext, status: number, body: unknown): void {
  ctx.res.statusCode = status;
  ctx.res.setHeader("content-type", "application/json");
  ctx.res.end(JSON.stringify(body));
}

function readHeader(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return header ?? null;
}

function parseAllowedCorsOrigins(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const origins = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : undefined;
}

function resolveAllowedCorsOrigin(origin: string | null): string | null {
  if (!origin) {
    return null;
  }

  const allowedOrigins = parseAllowedCorsOrigins(process.env.API_CORS_ORIGINS);

  if (!allowedOrigins) {
    return null;
  }

  return allowedOrigins.includes(origin) ? origin : null;
}

function applyCorsHeaders(ctx: AuthRouteContext): void {
  const allowedOrigin = resolveAllowedCorsOrigin(readHeader(ctx.req.headers.origin));

  if (!allowedOrigin) {
    return;
  }

  ctx.res.setHeader("access-control-allow-credentials", "true");
  ctx.res.setHeader("access-control-allow-headers", "content-type, authorization");
  ctx.res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  ctx.res.setHeader("access-control-allow-origin", allowedOrigin);
  const existingVary = ctx.res.getHeader("vary");
  const rawValues = Array.isArray(existingVary)
    ? existingVary.map(String)
    : existingVary !== undefined
      ? [String(existingVary)]
      : [];
  const existingTokens = rawValues
    .flatMap((value) => value.split(","))
    .map((token) => token.trim())
    .filter(Boolean);
  const hasOrigin = existingTokens.some((token) => token.toLowerCase() === "origin");

  if (!hasOrigin) {
    existingTokens.push("Origin");
  }

  ctx.res.setHeader("vary", existingTokens.join(", "));
}

async function parseJsonBody(ctx: AuthRouteContext): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of ctx.req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function parseLoginInput(payload: Record<string, unknown>): LoginInput {
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !password) {
    throw new Error("email and password are required");
  }

  return { email, password };
}

function parseSignupInput(payload: Record<string, unknown>): SignupInput {
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  if (!name || !email || !password) {
    throw new Error("name, email and password are required");
  }

  return { name, email, password };
}

function parseCreateOrganizationInput(payload: Record<string, unknown>): CreateOrganizationInput {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  if (!name) {
    throw new Error("name is required");
  }

  return { name };
}

function getSessionToken(ctx: AuthRouteContext): string | null {
  return getSessionTokenFromHeaders(ctx.req.headers);
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function setSessionCookie(ctx: AuthRouteContext, sessionToken: string): void {
  const maxAge = AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS;
  const secure = isProductionEnv() ? "; Secure" : "";
  ctx.res.setHeader(
    "set-cookie",
    `${AUTH_DEFINITIONS.COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}${secure}`
  );
}

function clearSessionCookie(ctx: AuthRouteContext): void {
  const secure = isProductionEnv() ? "; Secure" : "";
  ctx.res.setHeader(
    "set-cookie",
    `${AUTH_DEFINITIONS.COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

async function dispatchAuthRoute(ctx: AuthRouteContext): Promise<boolean> {
  const forwardedProto = readHeader(ctx.req.headers["x-forwarded-proto"])?.split(",")[0]?.trim();
  const forwardedHost = readHeader(ctx.req.headers["x-forwarded-host"])?.split(",")[0]?.trim();
  const protocol = forwardedProto || (isProductionEnv() ? "https" : "http");
  const host = forwardedHost || readHeader(ctx.req.headers.host) || "localhost";
  const origin = `${protocol}://${host}`;
  const url = new URL(ctx.req.url ?? "/", origin);

  if (!url.pathname.startsWith("/api/auth")) {
    return false;
  }

  applyCorsHeaders(ctx);

  if (ctx.req.method === "OPTIONS") {
    ctx.res.statusCode = 204;
    ctx.res.end();
    return true;
  }

  try {
    if (ctx.req.method === "GET" && url.pathname === AUTH_ROUTES.GET_SESSION) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);
      const sessionToken = getSessionToken(ctx);

      if (!session) {
        sendJson(ctx, 204, {});
        return true;
      }

      sendJson(ctx, 200, {
        session,
        ...(sessionToken ? { sessionToken } : {})
      });

      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.SIGN_IN_EMAIL) {
      const payload = await parseJsonBody(ctx);
      const input = parseLoginInput(payload);
      const result = await ctx.auth.loginWithPassword(input);
      setSessionCookie(ctx, result.sessionToken);

      sendJson(ctx, 200, {
        session: result.session,
        sessionToken: result.sessionToken
      });

      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.SIGN_UP_EMAIL) {
      const payload = await parseJsonBody(ctx);
      const input = parseSignupInput(payload);
      const result = await ctx.auth.signUpWithPassword(input);
      setSessionCookie(ctx, result.sessionToken);

      sendJson(ctx, 200, {
        session: result.session,
        sessionToken: result.sessionToken
      });

      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.SIGN_OUT) {
      await ctx.auth.logout(getSessionToken(ctx));
      clearSessionCookie(ctx);
      ctx.res.statusCode = 204;
      ctx.res.end();
      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.REQUEST_PASSWORD_RESET) {
      const payload = await parseJsonBody(ctx);
      const email = typeof payload.email === "string" ? payload.email.trim() : "";

      if (!email) {
        throw new Error("email is required");
      }

      await ctx.auth.requestPasswordReset({ email });

      ctx.res.statusCode = 204;
      ctx.res.end();
      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.RESET_PASSWORD) {
      const payload = await parseJsonBody(ctx);
      const token = typeof payload.token === "string" ? payload.token : "";
      const password = typeof payload.password === "string" ? payload.password : "";

      if (!token || !password) {
        throw new Error("token and password are required");
      }

      await ctx.auth.resetPassword({ token, password });

      ctx.res.statusCode = 204;
      ctx.res.end();
      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.VERIFY_EMAIL) {
      const payload = await parseJsonBody(ctx);
      const token = typeof payload.token === "string" ? payload.token : "";

      if (!token) {
        throw new Error("token is required");
      }

      await ctx.auth.verifyEmail({ token });

      ctx.res.statusCode = 204;
      ctx.res.end();
      return true;
    }

    if (ctx.req.method === "GET" && url.pathname === AUTH_ROUTES.ORGANIZATION_LIST) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 401, { error: "authentication required" });
        return true;
      }

      const scope = requireAuthenticatedOrganizationScope(session);
      const organizations = await ctx.auth.listOrganizationsByScope(scope);

      sendJson(ctx, 200, {
        organizations,
        activeOrganizationId: scope.organizationId
      });

      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.ORGANIZATION_SET_ACTIVE) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 401, { error: "authentication required" });
        return true;
      }

      const payload = await parseJsonBody(ctx);
      const organizationId =
        typeof payload.organizationId === "string" ? payload.organizationId : "";

      if (!organizationId) {
        throw new Error("organizationId is required");
      }

      const nextSession = await ctx.auth.setActiveOrganization({
        userId: session.user.id,
        organizationId,
        sessionToken: getSessionToken(ctx)
      });

      sendJson(ctx, 200, { session: nextSession });
      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.ORGANIZATION_CREATE) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 401, { error: "authentication required" });
        return true;
      }

      const payload = await parseJsonBody(ctx);
      const input = parseCreateOrganizationInput(payload);

      const nextSession = await ctx.auth.createOrganization({
        userId: session.user.id,
        name: input.name,
        sessionToken: getSessionToken(ctx)
      });

      sendJson(ctx, 200, { session: nextSession });
      return true;
    }

    if (ctx.req.method === "GET" && url.pathname === AUTH_ROUTES.ORGANIZATION_GET_MEMBERS) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 401, { error: "authentication required" });
        return true;
      }

      const scope = requireAuthenticatedOrganizationScope(session);
      const members = await ctx.auth.listOrganizationMembersByScope(scope);

      sendJson(ctx, 200, {
        members
      });
      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.ORGANIZATION_INVITATION_CREATE) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 401, { error: "authentication required" });
        return true;
      }

      const scope = requireAuthenticatedOrganizationScope(session);
      const payload = await parseJsonBody(ctx);
      const email = typeof payload.email === "string" ? payload.email.trim() : "";
      const role = typeof payload.role === "string" ? payload.role : "";

      if (!email || !role) {
        throw new Error("email and role are required");
      }

      const invitation = await ctx.auth.createInvitation({ email, role, scope });

      sendJson(ctx, 200, { invitation });
      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.ORGANIZATION_INVITATION_ACCEPT) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 401, { error: "authentication required" });
        return true;
      }

      const payload = await parseJsonBody(ctx);
      const invitationId = typeof payload.invitationId === "string" ? payload.invitationId : "";

      if (!invitationId) {
        throw new Error("invitationId is required");
      }

      await ctx.auth.acceptInvitation({ invitationId, user: session.user });

      ctx.res.statusCode = 204;
      ctx.res.end();
      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.ORGANIZATION_INVITATION_REVOKE) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 401, { error: "authentication required" });
        return true;
      }

      const scope = requireAuthenticatedOrganizationScope(session);
      const payload = await parseJsonBody(ctx);
      const invitationId = typeof payload.invitationId === "string" ? payload.invitationId : "";

      if (!invitationId) {
        throw new Error("invitationId is required");
      }

      await ctx.auth.revokeInvitation({ invitationId, scope });

      ctx.res.statusCode = 204;
      ctx.res.end();
      return true;
    }
  } catch (error) {
    sendJson(ctx, 400, {
      error: error instanceof Error ? error.message : "auth request failed"
    });
    return true;
  }

  sendJson(ctx, 404, { error: "auth route not found" });
  return true;
}

export function createAuthRouteTransport(): AuthRouteTransport {
  return {
    dispatch: dispatchAuthRoute
  };
}
