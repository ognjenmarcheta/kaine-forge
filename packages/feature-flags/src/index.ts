export const FEATURE_FLAGS = {
  ORGANIZATIONS_VISIBLE: "ORGANIZATIONS_VISIBLE"
} as const;

export interface FeatureFlags {
  organizationsVisible: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() !== "false";
}

export function resolveFeatureFlags(
  env: Record<string, string | undefined> = process.env
): FeatureFlags {
  const organizationsVisibleRaw = env.ORGANIZATIONS_VISIBLE ?? env.VITE_ORGANIZATIONS_VISIBLE;

  return {
    organizationsVisible: parseBoolean(organizationsVisibleRaw, true)
  };
}
