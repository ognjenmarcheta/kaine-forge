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
  AUTH_REQUIRE_EMAIL_VERIFICATION: z.string().optional(),
  EMAIL_PROVIDER: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  ORGANIZATIONS_VISIBLE: z.string().optional(),
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
  S3_PRESIGNED_URL_EXPIRY: z.preprocess(blankAsUnset, z.coerce.number().int().positive().optional())
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
