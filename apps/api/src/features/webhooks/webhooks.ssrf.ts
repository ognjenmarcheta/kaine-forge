import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/** Every address a hostname resolves to, as `dns.lookup(host, { all: true })` returns them. */
export type ResolveHost = (hostname: string) => Promise<LookupAddress[]>;

export const resolveHostWithDns: ResolveHost = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

// Loopback, private, link-local, and unique-local ranges, plus the other
// non-public ranges a request could reach inside the network: "this network",
// carrier-grade NAT, IETF protocol assignments, benchmarking, multicast, and
// reserved. BlockList checks an IPv4-mapped IPv6 address (::ffff:a.b.c.d)
// against the IPv4 rules, so a mapped private address is blocked too.
const BLOCKED_RANGES = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  BLOCKED_RANGES.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  // Unspecified, loopback, and IPv4-compatible.
  ["::", 96],
  // NAT64: the embedded IPv4 address is not checked, so all are refused.
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const) {
  BLOCKED_RANGES.addSubnet(network, prefix, "ipv6");
}

/** Whether a literal IPv4 or IPv6 address is one a webhook may never reach. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 0) {
    return true;
  }

  return BLOCKED_RANGES.check(address, family === 4 ? "ipv4" : "ipv6");
}

export class BlockedWebhookAddressError extends Error {
  constructor() {
    super("webhook address is not public");
    this.name = "BlockedWebhookAddressError";
  }
}

/**
 * Every address the hostname resolves to, after checking each one. A DNS
 * answer that mixes public and blocked addresses is refused whole, so a
 * client that picks another address cannot reach the blocked one.
 */
export async function resolvePublicAddresses(
  hostname: string,
  resolve: ResolveHost
): Promise<LookupAddress[]> {
  const literal = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  const family = isIP(literal);
  const addresses = family === 0 ? await resolve(literal) : [{ address: literal, family }];

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new BlockedWebhookAddressError();
  }

  return addresses;
}

export type WebhookUrlRefusal =
  "invalid_url" | "https_required" | "port_not_allowed" | "blocked_address" | "unresolvable_host";

/**
 * Why a Webhook Endpoint URL is refused, or null when it is an HTTPS URL on
 * port 443, without credentials, whose host resolves to public addresses only.
 * Port 443 only, so an endpoint cannot probe other services on a public host.
 */
export async function findWebhookUrlRefusal(
  value: string,
  resolve: ResolveHost
): Promise<WebhookUrlRefusal | null> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid_url";
  }

  if (url.protocol !== "https:") {
    return "https_required";
  }

  if (url.username || url.password) {
    return "invalid_url";
  }

  // The URL parser drops an explicit default port, so `:443` is accepted too.
  if (url.port !== "") {
    return "port_not_allowed";
  }

  try {
    await resolvePublicAddresses(url.hostname, resolve);
  } catch (error) {
    return error instanceof BlockedWebhookAddressError ? "blocked_address" : "unresolvable_host";
  }

  return null;
}
