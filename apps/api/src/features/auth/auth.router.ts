import { AUTH_DEFINITIONS } from "@repo/auth/auth.definition";
import {
  type CreateOrganizationInput,
  type LoginInput,
  type SignupInput
} from "@repo/auth/auth.type";
import { getSessionTokenFromHeaders } from "@repo/auth/auth.util";

import { AUTH_ROUTES } from "./auth.definition";
import type { AuthRouteContext } from "./auth.type";

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
    return origin;
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
  ctx.res.setHeader("vary", "Origin");
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

export async function handleAuthRoute(ctx: AuthRouteContext): Promise<boolean> {
  const forwardedProto = readHeader(ctx.req.headers["x-forwarded-proto"]);
  const forwardedHost = readHeader(ctx.req.headers["x-forwarded-host"]);
  const protocol = forwardedProto ?? (isProductionEnv() ? "https" : "http");
  const host = forwardedHost ?? readHeader(ctx.req.headers.host) ?? "localhost";
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

    if (ctx.req.method === "GET" && url.pathname === AUTH_ROUTES.ORGANIZATION_LIST) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 401, { error: "authentication required" });
        return true;
      }

      const organizations = await ctx.auth.listOrganizations(session.user.id);

      sendJson(ctx, 200, {
        organizations,
        activeOrganizationId: session.activeOrganizationId
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

      const organizationId = url.searchParams.get("organizationId") ?? session.activeOrganizationId;

      if (!organizationId) {
        throw new Error("organizationId is required");
      }

      const members = await ctx.auth.getMembers({
        userId: session.user.id,
        organizationId
      });

      sendJson(ctx, 200, {
        members
      });
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
