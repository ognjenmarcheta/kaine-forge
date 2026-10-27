import { FEATURE_FLAG_REGISTRY } from "./feature-flags.definition";
import type { FeatureFlags } from "./feature-flags.type";
import { resolveFlags } from "./feature-flags.util";

export const DEFAULT_FLAGS: FeatureFlags = resolveFlags(FEATURE_FLAG_REGISTRY);
