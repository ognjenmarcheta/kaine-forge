import type { LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import { resolveHostWithDns, resolvePublicAddresses, type ResolveHost } from "./webhooks.ssrf";

export interface WebhookRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

// Hands the socket the addresses resolvePublicAddresses already checked, so
// the connection never resolves the name again: a DNS answer that changes
// between the check and the connect (rebinding) cannot reach a blocked address.
function pinnedLookup(addresses: readonly LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const [first] = addresses;

    if (options.all) {
      callback(null, [...addresses]);
    } else if (first) {
      callback(null, first.address, first.family);
    }
  };
}

/**
 * POSTs one webhook body over HTTPS and resolves with the response status.
 * Redirects are never followed: a 3xx is the attempt's result. Rejects with
 * BlockedWebhookAddressError before connecting when the host resolves to any
 * blocked address, and with an AbortError after `timeoutMs`.
 */
export async function postWebhook(
  request: WebhookRequest,
  resolve: ResolveHost = resolveHostWithDns
): Promise<number> {
  const url = new URL(request.url);

  if (url.protocol !== "https:") {
    throw new Error("webhook url must use https");
  }

  const signal = AbortSignal.timeout(request.timeoutMs);
  const addresses = await resolvePublicAddresses(url.hostname, resolve);
  signal.throwIfAborted();

  return new Promise((resolveStatus, reject) => {
    const outgoing = httpsRequest(
      url,
      {
        method: "POST",
        headers: {
          ...request.headers,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(request.body))
        },
        lookup: pinnedLookup(addresses),
        signal
      },
      (response) => {
        // Only the status counts; the body is never read or stored.
        resolveStatus(response.statusCode ?? 0);
        response.destroy();
      }
    );

    outgoing.on("error", reject);
    outgoing.end(request.body);
  });
}
