import type { ApiContext } from "../../context";
import type { PageInput } from "../../context.data";

export const auditResolvers = {
  Query: {
    async auditEvents(_parent: unknown, args: PageInput, ctx: ApiContext) {
      return ctx.auditEvents.list(args);
    }
  }
};
