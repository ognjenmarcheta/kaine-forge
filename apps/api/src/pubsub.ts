import { createPubSub } from "graphql-yoga";

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

export type PubSubEventMap = {
  "todo:created": [TodoSubscriptionPayload];
  "todo:updated": [TodoSubscriptionPayload];
  "todo:deleted": [TodoDeletedPayload];
  "todo:toggled": [TodoSubscriptionPayload];
};

export const pubsub = createPubSub<PubSubEventMap>();
