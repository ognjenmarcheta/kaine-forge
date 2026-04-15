type RuntimeEnv = Record<string, string | undefined>;

export interface ApiStartupConfig {
  runMigrations: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  return fallback;
}

export function resolveApiStartupConfig(env: RuntimeEnv): ApiStartupConfig {
  return {
    runMigrations: parseBoolean(env.API_RUN_MIGRATIONS, env.NODE_ENV === "production")
  };
}
