import { SyncNetworkError } from "@repo/sync";
import { GraphQLClient } from "graphql-request";
import { describe, expect, it } from "vitest";

import { createSyncTransport } from "./sync-transport";

function transportAnswering(answer: () => Promise<Response>) {
  return createSyncTransport(new GraphQLClient("http://api.test/graphql", { fetch: answer }));
}

describe("createSyncTransport", () => {
  it.each([
    ["no response", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a gateway error", () => Promise.resolve(new Response("Bad Gateway", { status: 502 }))]
  ])("reports %s as a server it cannot reach", async (_case, answer) => {
    await expect(transportAnswering(answer).pull(null)).rejects.toBeInstanceOf(SyncNetworkError);
  });

  it("reports a server error as a failure, not as a server it cannot reach", async () => {
    const transport = transportAnswering(() =>
      Promise.resolve(
        Response.json({ errors: [{ message: "Unexpected error." }] }, { status: 500 })
      )
    );

    const failure = await transport.pull(null).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(SyncNetworkError);
  });
});
