import { z } from "zod";

const blankAsUnset = (value: unknown): unknown => (value === "" ? undefined : value);

// Both AI runtimes trim and lowercase before matching a provider
// (assistant.ai-runtime.ts normalizeProvider, todos.ai-runtime.ts getAiTodoProvider),
// so validation accepts exactly the casing they honour and rejects a typo at boot
// instead of silently falling back to openai. The preprocessor is load-bearing:
// scripts/ensure-env.mjs copies .env.example verbatim, and these ship blank.
const aiProviderSchema = z.preprocess(
  (value) => (typeof value === "string" ? blankAsUnset(value.trim().toLowerCase()) : value),
  z.enum(["deepseek", "openai"]).optional()
);

const apiEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "is required"),
  BETTER_AUTH_SECRET: z.string().min(1, "is required"),
  BETTER_AUTH_URL: z.string().optional(),
  // Web app origin for links in emails, such as the Invitation accept page.
  WEB_APP_URL: z.preprocess(blankAsUnset, z.url().optional()),
  API_HOST: z.string().optional(),
  API_PORT: z.preprocess(blankAsUnset, z.coerce.number().int().positive().default(4000)),
  API_URL: z.string().optional(),
  API_CORS_ORIGINS: z.string().optional(),
  API_GRAPHQL_MAX_DEPTH: z.preprocess(blankAsUnset, z.coerce.number().int().positive().optional()),
  API_GRAPHQL_MAX_COMPLEXITY: z.preprocess(
    blankAsUnset,
    z.coerce.number().int().positive().optional()
  ),
  API_GRAPHQL_INTROSPECTION: z.string().optional(),
  API_RUN_MIGRATIONS: z.string().optional(),
  API_RATE_LIMIT_ENABLED: z.string().optional(),
  API_RATE_LIMIT_MAX: z.preprocess(blankAsUnset, z.coerce.number().int().positive().optional()),
  API_RATE_LIMIT_WINDOW_MS: z.preprocess(
    blankAsUnset,
    z.coerce.number().int().positive().optional()
  ),
  API_TRUST_PROXY: z.string().optional(),
  // Below Docker's 10 s stop grace period, so the API exits before SIGKILL.
  API_SHUTDOWN_TIMEOUT_MS: z.preprocess(
    blankAsUnset,
    z.coerce.number().int().positive().default(8000)
  ),
  // false: this process only enqueues; a worker (dist/worker.js) runs the
  // handlers. Enum, not a loose string, so a typo cannot flip it silently.
  JOBS_RUNNER_ENABLED: z.preprocess(blankAsUnset, z.enum(["true", "false"]).default("true")),
  AUTH_REQUIRE_EMAIL_VERIFICATION: z.string().optional(),
  AUTH_PASSWORD_BREACH_CHECK: z.string().optional(),
  EMAIL_PROVIDER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_ALLOWED_HOSTNAMES: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  AI_TODO_PROVIDER: aiProviderSchema,
  AI_TODO_MODEL: z.string().optional(),
  AI_ASSISTANT_PROVIDER: aiProviderSchema,
  // Not an enum: model ids churn weekly and the provider SDK rejects an unknown
  // one at call time with a clearer message than a stale allowlist would.
  AI_ASSISTANT_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  S3_PRESIGNED_URL_EXPIRY: z.preprocess(
    blankAsUnset,
    z.coerce.number().int().positive().optional()
  ),
  S3_UPLOAD_URL_EXPIRY: z.preprocess(blankAsUnset, z.coerce.number().int().positive().optional()),
  S3_DOWNLOAD_URL_EXPIRY: z.preprocess(blankAsUnset, z.coerce.number().int().positive().optional()),
  S3_PUBLIC_BUCKET: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.preprocess(blankAsUnset, z.url().optional()),
  STORAGE_SWEEP_ENABLED: z.preprocess(blankAsUnset, z.enum(["true", "false"]).optional()),
  STORAGE_SWEEP_INTERVAL_MS: z.preprocess(
    blankAsUnset,
    z.coerce.number().int().positive().optional()
  ),
  HOUSEKEEPING_ENABLED: z.preprocess(blankAsUnset, z.enum(["true", "false"]).optional()),
  HOUSEKEEPING_INTERVAL_MS: z.preprocess(
    blankAsUnset,
    z.coerce.number().int().positive().optional()
  )
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function validateApiEnv(env: Record<string, string | undefined> = process.env): ApiEnv {
  const result = apiEnvSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(`invalid environment: ${details}`);
  }

  return result.data;
}
