import type { ServerAuth } from "@repo/auth/auth.type";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface AuthRouteContext {
  req: IncomingMessage;
  res: ServerResponse<IncomingMessage>;
  auth: ServerAuth;
}
