import { createServerAuth } from "@repo/auth/server";
import { db } from "@repo/db";
import { resolveFeatureFlags } from "@repo/feature-flags";
import { t } from "@repo/translation";
import type { IncomingHttpHeaders } from "node:http";

export interface ApiContextUser {
  id: string;
  email: string;
  name: string;
}

export interface ApiContext {
  db: typeof db;
  t: typeof t;
  user: ApiContextUser | null;
  activeOrganizationId: string | null;
  featureFlags: ReturnType<typeof resolveFeatureFlags>;
}

type RequestHeaders = Headers | IncomingHttpHeaders;

export async function createContextFromHeaders(headers: RequestHeaders): Promise<ApiContext> {
  const auth = createServerAuth();
  const session = await auth.getSessionFromHeaders(headers);

  return {
    db,
    t,
    user: session?.user ?? null,
    activeOrganizationId: session?.activeOrganizationId ?? null,
    featureFlags: resolveFeatureFlags(process.env)
  };
}

export async function createContext(request: Request): Promise<ApiContext> {
  return createContextFromHeaders(request.headers);
}
