import { filter, pipe } from "graphql-yoga";
import { describe, expect, it } from "vitest";

import { pubsub } from "./pubsub";

describe("pubsub", () => {
  it("publishes and receives events", async () => {
    const iterator = pubsub.subscribe("todo:created");
    const payload = {
      id: "todo-1",
      title: "Test",
      description: null,
      completed: false,
      organizationId: "org-1",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01")
    };

    const resultPromise = iterator.next();
    pubsub.publish("todo:created", payload);

    const result = await resultPromise;
    expect(result.value).toEqual(payload);
  });

  it("filters events by organization via pipe and filter", async () => {
    const orgId = "org-1";
    const iterator = pipe(
      pubsub.subscribe("todo:created"),
      filter((payload) => payload.organizationId === orgId)
    );

    const resultPromise = iterator.next();

    pubsub.publish("todo:created", {
      id: "t2",
      title: "Other org",
      description: null,
      completed: false,
      organizationId: "org-2",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01")
    });

    const expected = {
      id: "t3",
      title: "Same org",
      description: null,
      completed: false,
      organizationId: "org-1",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01")
    };
    pubsub.publish("todo:created", expected);

    const result = await resultPromise;
    expect(result.value).toEqual(expected);
  });
});
