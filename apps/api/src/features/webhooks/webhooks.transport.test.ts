import type { LookupAddress } from "node:dns";
import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { describe, expect, it, vi } from "vitest";

// A local HTTPS server needs a certificate fixture, so node:https is replaced
// by a recorder that answers every request with a redirect to a loopback
// address. The guard, the pinned lookup, and the status handling are real.
const sent = vi.hoisted(() => [] as Array<{ url: URL; options: RequestOptions }>);

vi.mock("node:https", () => ({
  request: (
    url: URL,
    options: RequestOptions,
    onResponse: (response: { statusCode: number; destroy: () => void }) => void
  ) => {
    sent.push({ url, options });
    const outgoing = Object.assign(new EventEmitter(), {
      end: () => {
        setImmediate(() => onResponse({ statusCode: 302, destroy: () => undefined }));
      }
    });
    return outgoing;
  }
}));

const { postWebhook } = await import("./webhooks.transport");

const CHECKED: LookupAddress[] = [
  { address: "93.184.215.14", family: 4 },
  { address: "2606:2800:220:1::1", family: 6 }
];

function lookupOf(options: RequestOptions | undefined) {
  const lookup = options?.lookup;
  if (!lookup) throw new Error("expected a pinned lookup");
  return lookup;
}

describe("postWebhook", () => {
  it("connects only to the addresses it checked and does not follow a redirect", async () => {
    const resolve = vi.fn(() => Promise.resolve(CHECKED));

    const status = await postWebhook(
      { url: "https://hooks.example.com/in", body: "{}", headers: {}, timeoutMs: 1000 },
      resolve
    );

    expect(status).toBe(302);
    expect(sent.map(({ url }) => url.href)).toEqual(["https://hooks.example.com/in"]);

    // The socket's name lookup answers from the checked list, never from DNS again.
    const lookup = lookupOf(sent[0]?.options);
    const all = await new Promise((done) => {
      lookup("hooks.example.com", { all: true }, (_error, addresses) => done(addresses));
    });
    const one = await new Promise((done) => {
      lookup("hooks.example.com", {}, (_error, address, family) => done([address, family]));
    });
    expect(all).toEqual(CHECKED);
    expect(one).toEqual(["93.184.215.14", 4]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
