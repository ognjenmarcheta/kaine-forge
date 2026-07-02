import { pool } from "@repo/db/client";

import { createHealthRouteTransport, type HealthRouteContext } from "./health.transport";

const healthRouteTransport = createHealthRouteTransport({
  checkDatabase: async () => {
    const client = await pool.connect();
    client.release();
  }
});

export function handleHealthRoute(ctx: HealthRouteContext): Promise<boolean> {
  return healthRouteTransport.dispatch(ctx);
}
