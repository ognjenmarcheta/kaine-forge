import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";

import { BlockedWebhookAddressError, findWebhookUrlRefusal } from "./webhooks.ssrf";
import { postWebhook } from "./webhooks.transport";

function answers(...addresses: string[]): () => Promise<LookupAddress[]> {
  return () =>
    Promise.resolve(
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))
    );
}

const PUBLIC = answers("93.184.215.14");

describe("findWebhookUrlRefusal", () => {
  it.each([
    ["IPv4 loopback", "https://127.0.0.1/hook"],
    ["IPv4 loopback in hex", "https://0x7f.1/hook"],
    ["IPv4 private 10/8", "https://10.1.2.3/hook"],
    ["IPv4 private 172.16/12", "https://172.20.0.5/hook"],
    ["IPv4 private 192.168/16", "https://192.168.1.10/hook"],
    ["IPv4 link-local (cloud metadata)", "https://169.254.169.254/latest"],
    ["IPv4 carrier-grade NAT", "https://100.64.0.1/hook"],
    ["IPv4 unspecified", "https://0.0.0.0/hook"],
    ["IPv6 loopback", "https://[::1]/hook"],
    ["IPv6 unspecified", "https://[::]/hook"],
    ["IPv6 unique-local", "https://[fd12:3456::1]/hook"],
    ["IPv6 link-local", "https://[fe80::1]/hook"],
    ["IPv4-mapped IPv6 loopback", "https://[::ffff:127.0.0.1]/hook"],
    ["NAT64 loopback", "https://[64:ff9b::7f00:1]/hook"]
  ])("refuses a literal %s address", async (_label, url) => {
    expect(await findWebhookUrlRefusal(url, PUBLIC)).toBe("blocked_address");
  });

  it.each([
    ["loopback", answers("127.0.0.1")],
    ["private", answers("10.0.0.7")],
    ["IPv6 unique-local", answers("fc00::5")],
    ["mixed public and private", answers("93.184.215.14", "192.168.0.2")],
    ["mixed public IPv6 and loopback", answers("2606:2800:220:1::1", "::1")]
  ])("refuses a host whose DNS answer is %s", async (_label, resolve) => {
    expect(await findWebhookUrlRefusal("https://hooks.example.com/in", resolve)).toBe(
      "blocked_address"
    );
  });

  it.each([
    ["plain http", "http://hooks.example.com/in", "https_required"],
    ["credentials in the URL", "https://user:pass@hooks.example.com/in", "invalid_url"],
    ["not a URL", "hooks.example.com", "invalid_url"]
  ])("refuses %s", async (_label, url, refusal) => {
    expect(await findWebhookUrlRefusal(url, PUBLIC)).toBe(refusal);
  });

  it("accepts an HTTPS host that resolves to public addresses only", async () => {
    expect(
      await findWebhookUrlRefusal(
        "https://hooks.example.com/in",
        answers("93.184.215.14", "2606:2800:220:1::1")
      )
    ).toBeNull();
  });
});

describe("postWebhook", () => {
  it("refuses before connecting when the delivery-time DNS answer turned private", async () => {
    await expect(
      postWebhook(
        { url: "https://hooks.example.com/in", body: "{}", headers: {}, timeoutMs: 1000 },
        answers("93.184.215.14", "127.0.0.1")
      )
    ).rejects.toBeInstanceOf(BlockedWebhookAddressError);
  });
});
