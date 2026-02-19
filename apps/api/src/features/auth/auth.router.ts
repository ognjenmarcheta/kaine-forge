import { AUTH_DEFINITIONS } from "@repo/auth/auth.definition";
import {
  type CreateOrganizationInput,
  type LoginInput,
  type SignupInput
} from "@repo/auth/auth.type";

import { AUTH_ROUTES } from "./auth.definition";
import type { AuthRouteContext } from "./auth.type";

function sendJson(ctx: AuthRouteContext, status: number, body: unknown): void {
  ctx.res.statusCode = status;
  ctx.res.setHeader("content-type", "application/json");
  ctx.res.end(JSON.stringify(body));
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

function parseCookieValue(cookieHeader: string | undefined, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const entries = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const [cookieKey, ...valueParts] = entry.split("=");

    if (cookieKey === key) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

function getSessionToken(ctx: AuthRouteContext): string | null {
  const cookieHeader = ctx.req.headers.cookie;

  if (Array.isArray(cookieHeader)) {
    return parseCookieValue(cookieHeader[0], AUTH_DEFINITIONS.COOKIE_NAME);
  }

  return parseCookieValue(cookieHeader, AUTH_DEFINITIONS.COOKIE_NAME);
}

function setSessionCookie(ctx: AuthRouteContext, sessionToken: string): void {
  const maxAge = AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS;
  ctx.res.setHeader(
    "set-cookie",
    `${AUTH_DEFINITIONS.COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}`
  );
}

function clearSessionCookie(ctx: AuthRouteContext): void {
  ctx.res.setHeader(
    "set-cookie",
    `${AUTH_DEFINITIONS.COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export async function handleAuthRoute(ctx: AuthRouteContext): Promise<boolean> {
  const origin = `http://${ctx.req.headers.host ?? "localhost"}`;
  const url = new URL(ctx.req.url ?? "/", origin);

  if (!url.pathname.startsWith("/api/auth")) {
    return false;
  }

  try {
    if (ctx.req.method === "GET" && url.pathname === AUTH_ROUTES.GET_SESSION) {
      const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

      if (!session) {
        sendJson(ctx, 204, {});
        return true;
      }

      sendJson(ctx, 200, {
        session
      });

      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.SIGN_IN_EMAIL) {
      const payload = await parseJsonBody(ctx);
      const input = parseLoginInput(payload);
      const result = await ctx.auth.loginWithPassword(input);
      setSessionCookie(ctx, result.sessionToken);

      sendJson(ctx, 200, {
        session: result.session
      });

      return true;
    }

    if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.SIGN_UP_EMAIL) {
      const payload = await parseJsonBody(ctx);
      const input = parseSignupInput(payload);
      const result = await ctx.auth.signUpWithPassword(input);
      setSessionCookie(ctx, result.sessionToken);

      sendJson(ctx, 200, {
        session: result.session
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
