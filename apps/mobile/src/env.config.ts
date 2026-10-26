import { z } from "zod";

// Expo/Babel inlines only literal `process.env.EXPO_PUBLIC_*` accesses in source;
// there is no populated process.env bag on device. So the reads live here and are
// validated as a record (consumers read the validated object via getMobileEnv).
const rawEnv = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_GRAPHQL_URL: process.env.EXPO_PUBLIC_GRAPHQL_URL,
  EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS: process.env.EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS,
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
  EXPO_PUBLIC_TURNSTILE_BASE_URL: process.env.EXPO_PUBLIC_TURNSTILE_BASE_URL
};

// A present-but-blank key inlines as ""; treat it as unset so declared defaults
// apply instead of an empty value overriding them.
const blankAsUnset = (value: unknown): unknown => (value === "" ? undefined : value);

// Mobile is not same-origin, so API/GraphQL URLs must be absolute — a device
// cannot resolve a relative path.
const absoluteHttpUrl = (fallback: string) =>
  z.preprocess(
    blankAsUnset,
    z
      .string()
      .min(1)
      .refine((value) => /^https?:\/\//.test(value), "must be an absolute http(s) URL")
      .default(fallback)
  );

const mobileEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: absoluteHttpUrl("http://localhost:4000"),
  EXPO_PUBLIC_GRAPHQL_URL: absoluteHttpUrl("http://localhost:4000/graphql"),
  EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS: z.preprocess(blankAsUnset, z.string().optional()),
  // Turnstile site key; login and signup render the captcha only when it is set.
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: z.preprocess(blankAsUnset, z.string().optional()),
  // Origin the captcha WebView pretends to load from. Its hostname must be
  // allowed for the site key; defaults to EXPO_PUBLIC_API_URL.
  EXPO_PUBLIC_TURNSTILE_BASE_URL: z.preprocess(
    blankAsUnset,
    z
      .string()
      .refine((value) => /^https?:\/\//.test(value), "must be an absolute http(s) URL")
      .optional()
  )
});

export type MobileEnv = z.infer<typeof mobileEnvSchema>;

export function validateMobileEnv(env: Record<string, unknown> = rawEnv): MobileEnv {
  const result = mobileEnvSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(`invalid environment: ${details}`);
  }
  return result.data;
}

let cached: MobileEnv | undefined;

// Validated client env, memoized. Validated once at boot (see src/lib/validate-env)
// so a misconfigured EXPO_PUBLIC_* build fails fast; consumers reuse the result.
export function getMobileEnv(): MobileEnv {
  cached ??= validateMobileEnv();
  return cached;
}
