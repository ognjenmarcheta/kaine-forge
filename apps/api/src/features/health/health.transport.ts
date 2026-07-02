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
