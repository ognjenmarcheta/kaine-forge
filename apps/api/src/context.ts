import type { AuthSession, ServerAuth } from "@repo/auth/auth.type";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { createServerAuth } from "@repo/auth/server";
import { db } from "@repo/db";
import { resolveFeatureFlags } from "@repo/feature-flags";
import { createChildLogger, type Logger } from "@repo/logger";
import { t } from "@repo/translation";
import type { IncomingHttpHeaders } from "node:http";

import { resolveApiAuthIdentity } from "./context.auth-scope";
import { pubsub } from "./pubsub";

export interface ApiContext {
  auth: ServerAuth;
  db: typeof db;
  t: typeof t;
  session: AuthSession | null;
  organizationScope: AuthenticatedOrganizationScope | null;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  featureFlags: ReturnType<typeof resolveFeatureFlags>;
  logger: Logger;
  pubsub: typeof pubsub;
}

type RequestHeaders = Headers | IncomingHttpHeaders;

export async function createContextFromHeaders(
  headers: RequestHeaders,
  logger: Logger
): Promise<ApiContext> {
  const auth = createServerAuth();
  const session = await auth.getSessionFromHeaders(headers);
  const identity = await resolveApiAuthIdentity(session, auth);

  const contextLogger = createChildLogger(logger, {
    userId: session?.user?.id ?? null,
    organizationId: identity.organizationScope?.organizationId ?? null
  });

  return {
    auth,
    db,
    t,
    session: identity.session,
    organizationScope: identity.organizationScope,
    requireOrganizationScope: identity.requireOrganizationScope,
    featureFlags: resolveFeatureFlags(),
    logger: contextLogger,
    pubsub
  };
}

export async function createContext(request: Request, logger: Logger): Promise<ApiContext> {
  return createContextFromHeaders(request.headers, logger);
}
