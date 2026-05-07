import { createAuthRouteTransport } from "./auth.transport";
import type { AuthRouteContext } from "./auth.type";

const authRouteTransport = createAuthRouteTransport();

export function handleAuthRoute(ctx: AuthRouteContext): Promise<boolean> {
  return authRouteTransport.dispatch(ctx);
}
