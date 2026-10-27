import { createPubSub, filter, pipe } from "graphql-yoga";

import type { NotificationView } from "./features/notifications/notifications.module";

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

export const pubsub = createPubSub<PubSubEventMap>();

type OrganizationEventName = Exclude<
  keyof PubSubEventMap,
  "assistant:delta" | "notification:created"
>;

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
