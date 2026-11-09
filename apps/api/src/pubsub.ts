import type { NotificationPayloadByType, NotificationType } from "@repo/auth/notifications";
import { createPubSub, filter, pipe } from "graphql-yoga";

import type { ScopedData } from "./context.data";
import { ReplicaEventTarget } from "./pubsub.replicas";

export interface TodoSubscriptionPayload {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TodoDeletedPayload {
  id: string;
  organizationId: string;
}

export interface AssistantMessageDeltaPayload {
  conversationId: string;
  delta: string;
  organizationId: string;
  userId: string;
}

export interface NoteSubscriptionPayload {
  id: string;
  title: string;
  body: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteDeletedPayload {
  id: string;
  organizationId: string;
}

/** A payload with the GraphQL type the `NotificationPayload` union resolves it to. */
export type NotificationPayloadView = {
  [TType in NotificationType]: NotificationPayloadByType[TType] & { graphqlType: string };
}[NotificationType];

/** A Notification as the API returns and streams it. */
export interface NotificationView {
  id: string;
  type: NotificationType;
  organizationId: string | null;
  payload: NotificationPayloadView;
  readAt: Date | null;
  createdAt: Date;
}

/** A new in-app Notification; it streams to its recipient only. */
export interface NotificationCreatedPayload {
  notification: NotificationView;
  userId: string;
}

export type PubSubEventMap = {
  "todo:created": [TodoSubscriptionPayload];
  "todo:updated": [TodoSubscriptionPayload];
  "todo:deleted": [TodoDeletedPayload];
  "todo:toggled": [TodoSubscriptionPayload];
  "assistant:delta": [AssistantMessageDeltaPayload];
  "note:created": [NoteSubscriptionPayload];
  "note:updated": [NoteSubscriptionPayload];
  "note:deleted": [NoteDeletedPayload];
  "notification:created": [NotificationCreatedPayload];
};

/** Events also reach the other API replicas once `startReplicaEvents` connects it (index.ts). */
export const replicaEvents = new ReplicaEventTarget();

export const pubsub = createPubSub<PubSubEventMap>({ eventTarget: replicaEvents });

type OrganizationEventName = Exclude<
  keyof PubSubEventMap,
  "assistant:delta" | "notification:created"
>;

/**
 * Stores what an organization event causes besides the live stream (its
 * webhook deliveries) through `tx`, so it commits or rolls back with the write
 * that caused it. Call it inside the write's transaction; `publish` the event
 * after the commit. A failure rejects, so the write fails with it.
 */
export type RecordOrganizationEvent = <TEventName extends OrganizationEventName>(
  tx: ScopedData,
  eventName: TEventName,
  ...payload: PubSubEventMap[TEventName]
) => Promise<void>;

/**
 * Each organization-scoped GraphQL subscription field and the event it
 * streams. `organizationSubscriptions` builds the resolvers from this map, so a
 * field cannot subscribe to another field's event or skip the organization
 * filter.
 */
export const ORGANIZATION_SUBSCRIPTIONS = {
  todoCreated: "todo:created",
  todoUpdated: "todo:updated",
  todoDeleted: "todo:deleted",
  todoToggled: "todo:toggled",
  noteCreated: "note:created",
  noteUpdated: "note:updated",
  noteDeleted: "note:deleted"
} as const satisfies Record<string, OrganizationEventName>;

type OrganizationSubscriptionField = keyof typeof ORGANIZATION_SUBSCRIPTIONS;

/**
 * The event catalog of Webhook Endpoints: every organization event the
 * subscriptions stream. `assistant:delta` and `notification:created` belong
 * to one user, so they are not webhook events.
 */
export const WEBHOOK_EVENT_TYPES: readonly OrganizationEventName[] = Object.values(
  ORGANIZATION_SUBSCRIPTIONS
);

const WEBHOOK_EVENT_TYPE_SET: ReadonlySet<string> = new Set(WEBHOOK_EVENT_TYPES);

export function isWebhookEventType(value: string): value is OrganizationEventName {
  return WEBHOOK_EVENT_TYPE_SET.has(value);
}

export interface SubscriptionContext {
  pubsub: typeof pubsub;
  requireOrganizationScope: () => { organizationId: string };
}

export interface OrganizationSubscriptionResolver {
  subscribe: (parent: unknown, args: unknown, ctx: SubscriptionContext) => AsyncIterable<unknown>;
  resolve: (payload: unknown) => unknown;
}

/** Subscription resolvers that stream each field's event to its own Active Organization only. */
export function organizationSubscriptions(
  fields: readonly OrganizationSubscriptionField[]
): Record<string, OrganizationSubscriptionResolver> {
  return Object.fromEntries(
    fields.map((field): [string, OrganizationSubscriptionResolver] => [
      field,
      {
        subscribe(_parent, _args, ctx) {
          const { organizationId } = ctx.requireOrganizationScope();
          return pipe(
            ctx.pubsub.subscribe(ORGANIZATION_SUBSCRIPTIONS[field]),
            filterByOrganization(organizationId)
          );
        },
        resolve: (payload) => payload
      }
    ])
  );
}

export function filterByOrganization<TPayload extends { organizationId: string }>(
  organizationId: string
) {
  return filter((payload: TPayload) => payload.organizationId === organizationId);
}
