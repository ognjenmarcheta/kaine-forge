import type { SyncPullArgs, SyncPullOlderArgs, SyncPushInput } from "./sync.type";
import type { ApiContext } from "../../context";

type SyncPushArgs = { input: SyncPushInput };

export const syncResolvers = {
  Query: {
    async syncPull(_parent: unknown, args: SyncPullArgs, ctx: ApiContext) {
      return ctx.sync.pull(args);
    },
    async syncPullOlder(_parent: unknown, args: SyncPullOlderArgs, ctx: ApiContext) {
      return ctx.sync.pullOlder(args);
    }
  },
  Mutation: {
    async syncPush(_parent: unknown, args: SyncPushArgs, ctx: ApiContext) {
      return ctx.sync.push(args.input);
    }
  }
};
