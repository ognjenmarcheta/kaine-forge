import type { FeatureFlagKey } from "./feature-flags.type";
import { isFeatureEnabled } from "./feature-flags.util";

export function useFeatureFlag(flag: FeatureFlagKey): boolean {
  return isFeatureEnabled(flag);
}
