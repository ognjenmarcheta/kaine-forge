import { pool } from "@repo/db/client";

import {
  createBoundedDatabaseCheck,
  createHealthRouteTransport,
  type HealthRouteContext
} from "./health.transport";

const healthRouteTransport = createHealthRouteTransport({
  checkDatabase: createBoundedDatabaseCheck({ connect: () => pool.connect() })
});

export function handleHealthRoute(ctx: HealthRouteContext): Promise<boolean> {
  return healthRouteTransport.dispatch(ctx);
}
