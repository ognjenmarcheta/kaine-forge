import type { ServerAuth } from "@repo/auth";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface AuthRouteContext {
  req: IncomingMessage;
  res: ServerResponse<IncomingMessage>;
  auth: ServerAuth;
}
