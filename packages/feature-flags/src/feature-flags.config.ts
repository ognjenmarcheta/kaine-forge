import { FEATURE_FLAGS } from "./feature-flags.definition";
import type { FeatureFlags } from "./feature-flags.type";

export const DEFAULT_FLAGS: FeatureFlags = {
  [FEATURE_FLAGS.ORGANIZATIONS_VISIBLE]: true
};
