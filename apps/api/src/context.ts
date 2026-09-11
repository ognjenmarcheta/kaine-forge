import type { AuthSession, ServerAuth } from "@repo/auth/auth.type";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { createServerAuth } from "@repo/auth/server";
import { db } from "@repo/db";
import { resolveFeatureFlags } from "@repo/feature-flags";
import { createChildLogger, type Logger } from "@repo/logger";
import { t } from "@repo/translation";
import type { IncomingHttpHeaders } from "node:http";

import { resolveApiAuthIdentity } from "./context.auth-scope";
import { createApiLoaders, type ApiLoaders } from "./context.loaders";
import { createApiWorkflows, type ApiWorkflows } from "./context.workflows";
import { pubsub } from "./pubsub";

export interface ApiContext {
  auth: ServerAuth;
  db: typeof db;
  t: typeof t;
  session: AuthSession | null;
  organizationScope: AuthenticatedOrganizationScope | null;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  loaders: ApiLoaders;
  workflows: ApiWorkflows;
  featureFlags: ReturnType<typeof resolveFeatureFlags>;
  logger: Logger;
  pubsub: typeof pubsub;
}

type RequestHeaders = Headers | IncomingHttpHeaders;

export async function createContextFromHeaders(
  headers: RequestHeaders,
  logger: Logger,
  auth: ServerAuth = createServerAuth()
): Promise<ApiContext> {
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
    loaders: createApiLoaders(identity.requireOrganizationScope),
    workflows: createApiWorkflows({
      logger: contextLogger,
      publish: (eventName, ...payload) => {
        pubsub.publish(eventName, ...payload);
      }
    }),
    featureFlags: resolveFeatureFlags(),
    logger: contextLogger,
    pubsub
  };
}

export async function createContext(
  request: Request,
  logger: Logger,
  auth?: ServerAuth
): Promise<ApiContext> {
  return createContextFromHeaders(request.headers, logger, auth);
}
