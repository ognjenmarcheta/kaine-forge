import type { LoginInput } from "@repo/auth";
import { createHash } from "node:crypto";

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

function sessionFingerprint(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

export async function handleAuthRoute(ctx: AuthRouteContext): Promise<boolean> {
  const origin = `http://${ctx.req.headers.host ?? "localhost"}`;
  const url = new URL(ctx.req.url ?? "/", origin);

  if (!url.pathname.startsWith("/api/auth")) {
    return false;
  }

  if (ctx.req.method === "GET" && url.pathname === AUTH_ROUTES.SESSION) {
    const session = await ctx.auth.getSessionFromHeaders(ctx.req.headers);

    if (!session) {
      sendJson(ctx, 204, {});
      return true;
    }

    sendJson(ctx, 200, {
      session,
      sessionToken: sessionFingerprint(session.user.id)
    });

    return true;
  }

  if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.LOGIN) {
    const payload = await parseJsonBody(ctx);
    const input = parseLoginInput(payload);
    const session = await ctx.auth.loginWithPassword(input);

    sendJson(ctx, 200, {
      session,
      sessionToken: sessionFingerprint(session.user.id)
    });

    return true;
  }

  if (ctx.req.method === "POST" && url.pathname === AUTH_ROUTES.LOGOUT) {
    await ctx.auth.logout();
    ctx.res.statusCode = 204;
    ctx.res.end();
    return true;
  }

  sendJson(ctx, 404, { error: "auth route not found" });
  return true;
}
