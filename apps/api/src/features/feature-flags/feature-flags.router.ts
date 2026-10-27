import type { FeatureFlagKey } from "@repo/feature-flags";

import { toFeatureFlagViews } from "./feature-flags.module";
import type { ApiContext } from "../../context";

export const featureFlagsResolvers = {
  Query: {
    featureFlags(_parent: unknown, _args: unknown, ctx: ApiContext) {
      // ctx.featureFlags already holds the Active Organization's overrides, or
      // only defaults and environment values when the session has none.
      if (!ctx.session) {
        throw new Error("authentication required");
      }

      return toFeatureFlagViews(ctx.featureFlags);
    }
  },
  Mutation: {
    async setFeatureFlagOverride(
      _parent: unknown,
      args: { key: FeatureFlagKey; enabled: boolean },
      ctx: ApiContext
    ) {
      return ctx.featureFlagOverrides.set(args.key, args.enabled);
    },
    async clearFeatureFlagOverride(
      _parent: unknown,
      args: { key: FeatureFlagKey },
      ctx: ApiContext
    ) {
      return ctx.featureFlagOverrides.clear(args.key);
    }
  }
};
