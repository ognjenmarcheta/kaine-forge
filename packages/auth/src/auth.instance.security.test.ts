import { afterEach, describe, expect, it, vi } from "vitest";

// The instance module imports @repo/db, whose client requires DATABASE_URL at
// import time (the pg Pool never connects during these tests).
vi.stubEnv("DATABASE_URL", "postgresql://dummy:dummy@localhost:5432/dummy");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");

const { AUTH_DEFINITIONS } = await import("./auth.definition");
const { auth, createAuthInstance } = await import("./auth.instance");

function pluginIds(instance: typeof auth): string[] {
  return (instance.options.plugins ?? []).map((plugin) => plugin.id);
}

describe("auth.instance security plugins (ADR 0015)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers the two-factor, email OTP, and breached-password plugins", () => {
    expect(pluginIds(auth)).toEqual(
      expect.arrayContaining(["two-factor", "email-otp", "have-i-been-pwned"])
    );
  });

  it("turns the breached-password check off only for AUTH_PASSWORD_BREACH_CHECK=false", () => {
    const breachCheckEnabled = (env: string | undefined) => {
      vi.stubEnv("AUTH_PASSWORD_BREACH_CHECK", env);
      const plugin = (createAuthInstance().options.plugins ?? []).find(
        (entry) => entry.id === "have-i-been-pwned"
      ) as { options?: { enabled?: boolean } } | undefined;

      return plugin?.options?.enabled;
    };

    expect(breachCheckEnabled(undefined)).toBe(true);
    expect(breachCheckEnabled("false")).toBe(false);
  });

  it("rejects captcha-protected requests without a Turnstile token when a secret is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    const instance = createAuthInstance();

    const responses = await Promise.all(
      ["/sign-in/email", "/email-otp/send-verification-otp"].map((path) =>
        instance.handler(
          new Request(`http://localhost:4000/api/auth${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost:4000" },
            body: JSON.stringify({
              email: "bot@example.test",
              password: "irrelevant",
              type: "sign-in"
            })
          })
        )
      )
    );

    for (const response of responses) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "MISSING_RESPONSE" });
    }
  });

  it("leaves captcha off when no Turnstile secret is set", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", undefined);

    expect(pluginIds(createAuthInstance())).not.toContain("captcha");
  });

  it("caches the session in a signed cookie for the configured window", () => {
    expect(auth.options.session?.cookieCache).toMatchObject({
      enabled: true,
      maxAge: AUTH_DEFINITIONS.SESSION_COOKIE_CACHE_MAX_AGE_SECONDS
    });
  });
});
