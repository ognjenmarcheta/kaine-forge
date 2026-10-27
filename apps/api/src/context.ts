import { recordAuditEvent } from "@repo/auth/audit";
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
import { createAuditEvents, type AuditEvents } from "./features/audit/audit.module";
import { createNotes, type Notes } from "./features/notes/notes.module";
import {
  createNotifications,
  type Notifications
} from "./features/notifications/notifications.module";
import {
  createPublicAssets,
  type PublicAssets
} from "./features/public-assets/public-assets.module";
import { createAttachments, type Attachments } from "./features/storage/attachment.module";
import { publicAssetStorage, s3ObjectStore } from "./features/storage/attachment.store";
import { createTodos, type Todos } from "./features/todos/todos.module";
import { pubsub, type PubSubEventMap } from "./pubsub";

export interface ApiContext {
  auth: ServerAuth;
  db: typeof db;
  t: typeof t;
  session: AuthSession | null;
  organizationScope: AuthenticatedOrganizationScope | null;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
  /** The signed-in user's id, for user-level data; throws `authentication required`. */
  requireUserId: () => string;
  /** Organization-scoped data access for this request; see context.data.ts. */
  data: ScopedData;
  todos: Todos;
  notes: Notes;
  attachments: Attachments;
  auditEvents: AuditEvents;
  notifications: Notifications;
  publicAssets: PublicAssets;
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

  const requireUserId = (): string => {
    if (!session) {
      throw new Error("authentication required");
    }
    return session.user.id;
  };
  const data = createScopedData({ db, requireOrganizationScope });
  const publish = <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ): void => {
    pubsub.publish(eventName, ...payload);
  };
  const attachments = createAttachments({
    data,
    logger: contextLogger,
    recordAuditEvent,
    store: s3ObjectStore
  });
  const todos = createTodos({ attachments, data, logger: contextLogger, publish });

  return {
    auth,
    db,
    t,
    session,
    organizationScope,
    requireOrganizationScope,
    requireUserId,
    data,
    todos,
    notes: createNotes({ data, publish }),
    attachments,
    auditEvents: createAuditEvents({ data, db, requireOrganizationScope }),
    notifications: createNotifications({ db, requireUserId }),
    publicAssets: createPublicAssets({
      db,
      logger: contextLogger,
      publicStorage: publicAssetStorage(),
      requireOrganizationScope,
      store: s3ObjectStore
    }),
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
