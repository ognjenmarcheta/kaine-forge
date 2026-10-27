import type { FeatureFlagKey } from "@repo/feature-flags";

import { toFeatureFlagViews } from "./feature-flags.module";
import type { ApiContext } from "../../context";

export const featureFlagsResolvers = {
  Query: {
    featureFlags(_parent: unknown, _args: unknown, ctx: ApiContext) {
      // Fails without an Active Organization; ctx.featureFlags already holds its overrides.
      ctx.requireOrganizationScope();
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
