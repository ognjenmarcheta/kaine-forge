import type { AuthSession, ServerAuth } from "@repo/auth/auth.type";
import { resolveOrganizationScope, type AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { createServerAuth } from "@repo/auth/server";
import { db } from "@repo/db";
import { resolveFeatureFlags } from "@repo/feature-flags";
import { createChildLogger, type Logger } from "@repo/logger";
import { t } from "@repo/translation";
import type { IncomingHttpHeaders } from "node:http";

import { createScopedData, type ScopedData } from "./context.data";
import { createApiLoaders, type ApiLoaders } from "./context.loaders";
import { createNotes, type Notes } from "./features/notes/notes.module";
import { createAttachments, type Attachments } from "./features/storage/attachment.module";
import { s3ObjectStore } from "./features/storage/attachment.store";
import { createTodos, type Todos } from "./features/todos/todos.module";
import { pubsub, type PubSubEventMap } from "./pubsub";

export interface ApiContext {
  auth: ServerAuth;
  db: typeof db;
  t: typeof t;
  session: AuthSession | null;
  organizationScope: AuthenticatedOrganizationScope | null;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  /** Organization-scoped data access for this request; see context.data.ts. */
  data: ScopedData;
  todos: Todos;
  notes: Notes;
  attachments: Attachments;
  loaders: ApiLoaders;
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
  const { organizationScope, requireOrganizationScope } = await resolveOrganizationScope({
    getMembership: auth.getOrganizationMembershipProof,
    session
  });

  const contextLogger = createChildLogger(logger, {
    userId: session?.user?.id ?? null,
    organizationId: organizationScope?.organizationId ?? null
  });

  const data = createScopedData({ db, requireOrganizationScope });
  const publish = <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ): void => {
    pubsub.publish(eventName, ...payload);
  };
  const attachments = createAttachments({ data, logger: contextLogger, store: s3ObjectStore });
  const todos = createTodos({ attachments, data, logger: contextLogger, publish });

  return {
    auth,
    db,
    t,
    session,
    organizationScope,
    requireOrganizationScope,
    data,
    todos,
    notes: createNotes({ data, publish }),
    attachments,
    loaders: createApiLoaders(todos, attachments),
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
