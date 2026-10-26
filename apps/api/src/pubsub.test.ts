import { buildSchema, isObjectType } from "graphql";
import { createPubSub } from "graphql-yoga";
import { describe, expect, it } from "vitest";

import {
  ORGANIZATION_SUBSCRIPTIONS,
  type NoteSubscriptionPayload,
  type OrganizationSubscriptionResolver,
  type PubSubEventMap,
  type TodoSubscriptionPayload
} from "./pubsub";
import { apiResolvers, apiTypeDefs } from "./schema/features";

// One payload that fits every organization event, so each one can be published.
function payloadFor(organizationId: string): TodoSubscriptionPayload & NoteSubscriptionPayload {
  return {
    body: null,
    completed: false,
    createdAt: new Date("2026-01-01"),
    description: null,
    id: `row-of-${organizationId}`,
    organizationId,
    title: "Row",
    updatedAt: new Date("2026-01-01")
  };
}

const subscriptionType = buildSchema(apiTypeDefs.join("\n")).getType("Subscription");
const subscriptionFields = isObjectType(subscriptionType) ? subscriptionType.getFields() : {};
const registered = new Map<string, unknown>(Object.entries(apiResolvers.Subscription ?? {}));

function isSubscriptionResolver(value: unknown): value is OrganizationSubscriptionResolver {
  return typeof value === "object" && value !== null && "subscribe" in value;
}

describe("organization subscriptions", () => {
  it.each(Object.entries(ORGANIZATION_SUBSCRIPTIONS))(
    "%s is a schema field that streams %s for its own Active Organization only",
    async (field, eventName) => {
      const resolver = registered.get(field);
      expect(subscriptionFields[field]).toBeDefined();
      if (!isSubscriptionResolver(resolver)) throw new Error(`no resolver for ${field}`);

      const testPubsub = createPubSub<PubSubEventMap>();
      const stream = resolver.subscribe(
        undefined,
        {},
        {
          pubsub: testPubsub,
          requireOrganizationScope: () => ({ organizationId: "org-1" })
        }
      );
      const iterator = stream[Symbol.asyncIterator]();
      const next = iterator.next();

      testPubsub.publish(eventName, payloadFor("org-2"));
      testPubsub.publish(eventName, payloadFor("org-1"));

      await expect(next).resolves.toEqual({ done: false, value: payloadFor("org-1") });
      await iterator.return?.();
    }
  );
});
