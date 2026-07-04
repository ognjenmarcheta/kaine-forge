import type { IncomingMessage, ServerResponse } from "node:http";

import { HEALTH_ROUTES } from "./health.definition";

export interface HealthRouteContext {
  req: IncomingMessage;
  res: ServerResponse<IncomingMessage>;
}

export interface HealthRouteTransport {
  dispatch: (ctx: HealthRouteContext) => Promise<boolean>;
}

function sendJson(ctx: HealthRouteContext, status: number, body: unknown): void {
  ctx.res.statusCode = status;
  ctx.res.setHeader("content-type", "application/json");
  ctx.res.end(JSON.stringify(body));
}

const DEFAULT_READINESS_TIMEOUT_MS = 3000;

// Bounds the /ready database probe so a blackholed database yields an honest
// 503 instead of a hanging readiness check.
export function createBoundedDatabaseCheck(deps: {
  connect: () => Promise<{ release: () => void }>;
  timeoutMs?: number;
}): () => Promise<void> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;

  return async () => {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("database readiness check timed out"));
      }, timeoutMs);
    });

    const connecting = deps.connect();

    try {
      const client = await Promise.race([connecting, timeout]);
      client.release();
    } catch (error) {
      // If the timeout won the race, release the client whenever the
      // in-flight connect settles so it is not leaked from the pool.
      connecting
        .then((client) => {
          client.release();
        })
        .catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createHealthRouteTransport(deps: {
  checkDatabase: () => Promise<void>;
}): HealthRouteTransport {
  return {
    async dispatch(ctx) {
      if (ctx.req.method !== "GET") {
        return false;
      }

      const pathname = (ctx.req.url ?? "").split("?")[0];

      if (pathname === HEALTH_ROUTES.LIVENESS) {
        sendJson(ctx, 200, { status: "ok" });
        return true;
      }

      if (pathname === HEALTH_ROUTES.READINESS) {
        try {
          await deps.checkDatabase();
          sendJson(ctx, 200, { status: "ready" });
        } catch {
          sendJson(ctx, 503, { status: "unavailable" });
        }
        return true;
      }

      return false;
    }
  };
}
