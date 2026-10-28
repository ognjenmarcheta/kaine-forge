import { createLogger } from "@repo/logger";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createBillingWebhookTransport } from "./billing.webhook.transport";

let server: Server | undefined;

type Handle = Parameters<typeof createBillingWebhookTransport>[0]["handle"];

async function serve(handle: Handle): Promise<string> {
  const transport = createBillingWebhookTransport({
    handle,
    logger: createLogger({ level: "silent", name: "billing-transport-test" })
  });
  server = createServer((req, res) => {
    const pathname = (req.url ?? "").split("?")[0] ?? "";
    void transport.dispatch({ req, res, pathname }).then((handled) => {
      if (!handled) {
        res.statusCode = 418;
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  // SAFETY: a server listening on a TCP port reports an AddressInfo, not a pipe name.
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe("billing webhook transport", () => {
  it("hands the provider name, the exact raw body, and the signature header to the handler", async () => {
    const calls: [string, string, string | undefined][] = [];
    const origin = await serve((providerName, rawBody, headers) => {
      calls.push([providerName, rawBody, headers["stripe-signature"]]);
      return Promise.resolve(200);
    });
    const body = '{ "id": "evt_1",  "spacing": "kept" }';

    const response = await fetch(`${origin}/api/billing/webhooks/stripe`, {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=abc" },
      body
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([["stripe", body, "t=1,v1=abc"]]);
  });

  it.each([
    ["GET", null, 405],
    ["POST", "x".repeat(1024 * 1024 + 1), 413]
  ])(
    "answers a %s request it cannot take with %i, before the handler",
    async (method, body, status) => {
      let called = false;
      const origin = await serve(() => {
        called = true;
        return Promise.resolve(200);
      });

      const response = await fetch(`${origin}/api/billing/webhooks/stripe`, { method, body });

      expect(response.status).toBe(status);
      expect(called).toBe(false);
    }
  );

  it("answers 500 when processing fails, so the provider retries", async () => {
    const origin = await serve(() => Promise.reject(new Error("provider unreachable")));

    const response = await fetch(`${origin}/api/billing/webhooks/stripe`, {
      method: "POST",
      body: "{}"
    });

    expect(response.status).toBe(500);
  });

  it("leaves every other path to the next route", async () => {
    const origin = await serve(() => Promise.resolve(200));

    expect((await fetch(`${origin}/graphql`, { method: "POST", body: "{}" })).status).toBe(418);
  });
});
