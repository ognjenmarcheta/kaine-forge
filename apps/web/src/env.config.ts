import { z } from "zod";

// Vite injects an empty string for a present-but-blank key; treat it as unset so
// declared defaults apply (VITE_GRAPHQL_URL="" falls back to "/graphql" instead
// of overriding the default with an empty URL).
const blankAsUnset = (value: unknown): unknown => (value === "" ? undefined : value);

const webEnvSchema = z.object({
  VITE_GRAPHQL_URL: z.preprocess(
    blankAsUnset,
    z
      .string()
      .min(1)
      .refine(
        (value) => value.startsWith("/") || /^https?:\/\//.test(value),
        'must be a root-relative path (e.g. "/graphql") or an absolute http(s) URL'
      )
      .default("/graphql")
  ),
  VITE_AUTH_SOCIAL_PROVIDERS: z.preprocess(blankAsUnset, z.string().optional())
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function validateWebEnv(env: Record<string, unknown> = import.meta.env): WebEnv {
  const result = webEnvSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(`invalid environment: ${details}`);
  }
  return result.data;
}

let cached: WebEnv | undefined;

// Validated client env, memoized. Call once at boot (main.tsx) to fail fast;
// consumers reuse the cached result.
export function getWebEnv(): WebEnv {
  cached ??= validateWebEnv();
  return cached;
}
