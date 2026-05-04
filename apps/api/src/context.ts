import type { AuthSession, ServerAuth } from "@repo/auth/auth.type";
import { createServerAuth } from "@repo/auth/server";
import { db } from "@repo/db";
import { resolveFeatureFlags } from "@repo/feature-flags";
import { createChildLogger, type Logger } from "@repo/logger";
import { t } from "@repo/translation";
import type { IncomingHttpHeaders } from "node:http";

import { pubsub } from "./pubsub";

export interface ApiContext {
  auth: ServerAuth;
  db: typeof db;
  t: typeof t;
  session: AuthSession | null;
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

  const contextLogger = createChildLogger(logger, {
    userId: session?.user?.id ?? null,
    organizationId: session?.activeOrganizationId ?? null
  });

  return {
    auth,
    db,
    t,
    session,
    featureFlags: resolveFeatureFlags(),
    logger: contextLogger,
    pubsub
  };
}

export async function createContext(request: Request, logger: Logger): Promise<ApiContext> {
  return createContextFromHeaders(request.headers, logger);
}
