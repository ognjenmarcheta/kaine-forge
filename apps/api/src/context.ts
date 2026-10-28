import { recordAuditEvent } from "@repo/auth/audit";
import type { AuthSession, ServerAuth } from "@repo/auth/auth.type";
import { resolveOrganizationScope, type AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { createServerAuth } from "@repo/auth/server";
import { db } from "@repo/db";
import type { FeatureFlags } from "@repo/feature-flags";
import { createChildLogger, createLogger, type Logger } from "@repo/logger";
import { t } from "@repo/translation";
import type { IncomingHttpHeaders } from "node:http";

import { createScopedData, type ScopedData } from "./context.data";
import { createApiLoaders, type ApiLoaders } from "./context.loaders";
import { createApiKeys, type ApiKeys } from "./features/api-keys/api-keys.module";
import { createAuditEvents, type AuditEvents } from "./features/audit/audit.module";
import { createBilling, type Billing } from "./features/billing/billing.module";
import { billingPrices, billingProvider } from "./features/billing/billing.provider";
import { createDataExports, type DataExports } from "./features/data-export/data-export.module";
import {
  createFeatureFlagOverrides,
  resolveRequestFeatureFlags,
  type FeatureFlagOverrides
} from "./features/feature-flags/feature-flags.module";
import { createNotes, type Notes } from "./features/notes/notes.module";
import {
  createNotifications,
  type Notifications
} from "./features/notifications/notifications.module";
import {
  createOrganizationThemes,
  type OrganizationThemes
} from "./features/organizations/organizations.theme";
import {
  createPublicAssets,
  type PublicAssets
} from "./features/public-assets/public-assets.module";
import { createAttachments, type Attachments } from "./features/storage/attachment.module";
import { publicAssetStorage, s3ObjectStore } from "./features/storage/attachment.store";
import { countTodos, createTodos, type Todos } from "./features/todos/todos.module";
import {
  createWebhookDispatcher,
  enqueueWebhookDelivery
} from "./features/webhooks/webhooks.dispatch";
import { createWebhookEndpoints, type WebhookEndpoints } from "./features/webhooks/webhooks.module";
import { resolveHostWithDns } from "./features/webhooks/webhooks.ssrf";
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
  /** The Active Organization's Plan: Entitlements, limits, and status. */
  billing: Billing;
  apiKeys: ApiKeys;
  webhooks: WebhookEndpoints;
  dataExports: DataExports;
  notifications: Notifications;
  publicAssets: PublicAssets;
  organizationThemes: OrganizationThemes;
  loaders: ApiLoaders;
  /** Resolved once per request: default < environment < Active Organization override. */
  featureFlags: FeatureFlags;
  featureFlagOverrides: FeatureFlagOverrides;
  logger: Logger;
  pubsub: typeof pubsub;
}

type RequestHeaders = Headers | IncomingHttpHeaders;

/** An `x-api-key` request the server already verified; see server.ts. */
export interface ApiKeyRequest {
  apiKeyId: string;
  scope: AuthenticatedOrganizationScope;
}

// Every organization event also goes to the Organization's Webhook Endpoints.
const dispatchWebhookEvent = createWebhookDispatcher({
  db,
  enqueue: enqueueWebhookDelivery,
  logger: createLogger({ name: "webhooks" })
});

async function resolveRequestIdentity(
  headers: RequestHeaders,
  auth: ServerAuth,
  apiKey: ApiKeyRequest | undefined
): Promise<{
  session: AuthSession | null;
  organizationScope: AuthenticatedOrganizationScope | null;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
}> {
  // An API Key request acts only in the key's Organization: no Session, so
  // no user-level data and nothing from a cookie sent alongside it.
  if (apiKey) {
    return {
      session: null,
      organizationScope: apiKey.scope,
      requireOrganizationScope: () => apiKey.scope
    };
  }

  const session = await auth.getSessionFromHeaders(headers);
  return {
    session,
    ...(await resolveOrganizationScope({
      getMembership: auth.getOrganizationMembershipProof,
      session
    }))
  };
}

export async function createContextFromHeaders(
  headers: RequestHeaders,
  logger: Logger,
  auth: ServerAuth = createServerAuth(),
  apiKey?: ApiKeyRequest
): Promise<ApiContext> {
  const { session, organizationScope, requireOrganizationScope } = await resolveRequestIdentity(
    headers,
    auth,
    apiKey
  );

  const contextLogger = createChildLogger(logger, {
    userId: organizationScope?.userId ?? session?.user?.id ?? null,
    organizationId: organizationScope?.organizationId ?? null,
    ...(apiKey ? { apiKeyId: apiKey.apiKeyId } : {})
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
    const [event] = payload;
    dispatchWebhookEvent(eventName, event);
  };
  const attachments = createAttachments({
    data,
    logger: contextLogger,
    recordAuditEvent,
    store: s3ObjectStore
  });
  const billing = createBilling({
    data,
    db,
    provider: billingProvider,
    prices: billingPrices,
    requireOrganizationScope,
    recordAuditEvent,
    webAppUrl: process.env.WEB_APP_URL,
    usage: { todos: () => countTodos(data) }
  });
  const todos = createTodos({ attachments, data, logger: contextLogger, plan: billing, publish });

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
    billing,
    auditEvents: createAuditEvents({ data, db, requireOrganizationScope }),
    apiKeys: createApiKeys({ auth, data, db, recordAuditEvent, requireOrganizationScope }),
    webhooks: createWebhookEndpoints({ data, recordAuditEvent, resolveHost: resolveHostWithDns }),
    dataExports: createDataExports({
      db,
      // Loaded on first use: the job client opens the database pool on import.
      enqueue: async (exportId) => {
        const { jobQueue } = await import("@repo/jobs/client");
        return jobQueue.enqueue("data.export", { exportId });
      },
      recordAuditEvent,
      requireOrganizationScope,
      requireUserId,
      store: s3ObjectStore
    }),
    notifications: createNotifications({ db, requireUserId }),
    publicAssets: createPublicAssets({
      db,
      logger: contextLogger,
      publicStorage: publicAssetStorage(),
      requireOrganizationScope,
      store: s3ObjectStore
    }),
    organizationThemes: createOrganizationThemes({
      db,
      recordAuditEvent,
      requireOrganizationScope
    }),
    loaders: createApiLoaders(todos, attachments),
    featureFlags: await resolveRequestFeatureFlags(data, organizationScope),
    featureFlagOverrides: createFeatureFlagOverrides({
      data,
      recordAuditEvent,
      requireOrganizationScope
    }),
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
