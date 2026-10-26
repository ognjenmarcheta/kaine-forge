import { pipe } from "graphql-yoga";
import { describe, expect, it } from "vitest";

import { filterByOrganization, pubsub } from "./pubsub";

describe("pubsub", () => {
  it("delivers only the subscribing organization's events through filterByOrganization", async () => {
    const iterator = pipe(pubsub.subscribe("todo:created"), filterByOrganization("org-1"));

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
