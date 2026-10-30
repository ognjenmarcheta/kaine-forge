import type { Logger } from "@repo/logger";
import type { IncomingMessage, ServerResponse } from "node:http";

import { BILLING_CONFIG } from "./billing.definition";
import { formatLoggableError } from "../../observability";

export interface BillingWebhookRouteContext {
  req: IncomingMessage;
  res: ServerResponse<IncomingMessage>;
  pathname: string;
}

type WebhookHandler = (
  providerName: string,
  rawBody: string,
  headers: Record<string, string | undefined>
) => Promise<number>;

class BodyTooLargeError extends Error {}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;

    if (size > maxBytes) {
      throw new BodyTooLargeError();
    }

    chunks.push(buffer);
  }

  // Signatures cover the exact bytes, so the body is never parsed before verification.
  return Buffer.concat(chunks).toString("utf8");
}

function flattenHeaders(req: IncomingMessage): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(req.headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value[0] : value
    ])
  );
}

function respond(res: ServerResponse<IncomingMessage>, status: number): void {
  res.statusCode = status;
  res.end();
}

/**
 * `POST /api/billing/webhooks/<provider>`, dispatched before the rate limiter
 * and GraphQL: providers authenticate by signature, not by session or key.
 */
export function createBillingWebhookTransport(deps: {
  handle: WebhookHandler;
  logger: Pick<Logger, "error">;
}): { dispatch: (ctx: BillingWebhookRouteContext) => Promise<boolean> } {
  return {
    async dispatch({ req, res, pathname }) {
      if (!pathname.startsWith(BILLING_CONFIG.webhookPathPrefix)) {
        return false;
      }

      if (req.method !== "POST") {
        res.setHeader("allow", "POST");
        respond(res, 405);
        return true;
      }

      const providerName = pathname.slice(BILLING_CONFIG.webhookPathPrefix.length);
      let rawBody: string;
      try {
        rawBody = await readBody(req, BILLING_CONFIG.webhookMaxBodyBytes);
      } catch (error) {
        respond(res, error instanceof BodyTooLargeError ? 413 : 400);
        return true;
      }

      try {
        respond(res, await deps.handle(providerName, rawBody, flattenHeaders(req)));
      } catch (error) {
        // 500 makes the provider retry; the event id was not recorded.
        deps.logger.error(
          { providerName, error: formatLoggableError(error) },
          "billing webhook processing failed"
        );
        respond(res, 500);
      }

      return true;
    }
  };
}
