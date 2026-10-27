import type { AuditEventsPageInput } from "./audit.module";
import type { ApiContext } from "../../context";

export const auditResolvers = {
  Query: {
    async auditEvents(_parent: unknown, args: AuditEventsPageInput, ctx: ApiContext) {
      return ctx.auditEvents.list(args);
    }
  }
};
