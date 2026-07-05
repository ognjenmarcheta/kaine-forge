import { createPubSub, filter } from "graphql-yoga";

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

export type PubSubEventMap = {
  "todo:created": [TodoSubscriptionPayload];
  "todo:updated": [TodoSubscriptionPayload];
  "todo:deleted": [TodoDeletedPayload];
  "todo:toggled": [TodoSubscriptionPayload];
  "assistant:delta": [AssistantMessageDeltaPayload];
};

export const pubsub = createPubSub<PubSubEventMap>();

export function filterByOrganization<TPayload extends { organizationId: string }>(
  organizationId: string
) {
  return filter((payload: TPayload) => payload.organizationId === organizationId);
}
