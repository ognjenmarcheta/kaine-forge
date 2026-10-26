import { afterEach, describe, expect, it, vi } from "vitest";

// The instance module imports @repo/db, whose client requires DATABASE_URL at
// import time (the pg Pool never connects during these tests). Stub dummy env
// before the dynamic imports so construction is exercised with explicit config.
vi.stubEnv("DATABASE_URL", "postgresql://dummy:dummy@localhost:5432/dummy");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");

const { AUTH_DEFINITIONS } = await import("./auth.definition");
const { AUTH_PASSWORD_MIN_LENGTH } = await import("./auth.form");
const { hashPassword } = await import("./auth.password");
const { auth, createAuthInstance } = await import("./auth.instance");

describe("auth.instance", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to fall back to the development secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);

    expect(() => createAuthInstance()).toThrow("BETTER_AUTH_SECRET must be set in production");

    vi.stubEnv("BETTER_AUTH_SECRET", "a-sufficiently-long-random-secret-value-here");

    expect(() => createAuthInstance()).not.toThrow();
  });

  it("enables email/password auth with our custom scrypt hooks wired in", async () => {
    const options = auth.options;

    expect(options.emailAndPassword?.enabled).toBe(true);
    expect(options.emailAndPassword?.password?.hash).toBe(hashPassword);

    // Behavioral proof: better-auth's verify hook accepts a hash produced by
    // the legacy custom implementation and rejects a wrong password.
    const stored = await hashPassword("Secret123!");
    const verify = options.emailAndPassword?.password?.verify;

    expect(verify).toBeTypeOf("function");
    await expect(verify?.({ hash: stored, password: "Secret123!" })).resolves.toBe(true);
    await expect(verify?.({ hash: stored, password: "WrongPass!" })).resolves.toBe(false);
  });

  it("registers the expo, organization, and bearer plugins", () => {
    const pluginIds = (auth.options.plugins ?? []).map((plugin) => plugin.id);

    expect(pluginIds).toContain("expo");
    expect(pluginIds).toContain("organization");
    expect(pluginIds).toContain("bearer");
  });

  it("mirrors the legacy session lifetimes and keeps rate limiting off", () => {
    expect(auth.options.session?.expiresIn).toBe(AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS);
    expect(auth.options.session?.updateAge).toBe(AUTH_DEFINITIONS.SESSION_UPDATE_AGE_SECONDS);
    expect(auth.options.rateLimit?.enabled).toBe(false);
  });

  it.each([
    { baseUrl: "https://api.example.test", secure: true, name: "__Secure-kaine.session_token" },
    { baseUrl: "http://localhost:4000", secure: false, name: "kaine.session_token" }
  ])(
    "sets HttpOnly, SameSite=Lax session cookies for $baseUrl, Secure only for https",
    async (row) => {
      vi.stubEnv("BETTER_AUTH_URL", row.baseUrl);

      const { sessionToken } = (await createAuthInstance().$context).authCookies;

      expect(sessionToken.name).toBe(row.name);
      expect(sessionToken.attributes).toMatchObject({
        httpOnly: true,
        sameSite: "lax",
        secure: row.secure
      });
    }
  );

  it("rejects a sign-up password shorter than the shared form minimum", async () => {
    const response = await auth.handler(
      new Request("http://localhost:4000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "short-password@example.test",
          name: "Short Password",
          password: "x".repeat(AUTH_PASSWORD_MIN_LENGTH - 1)
        })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });

  it("keeps uuid primary-key continuity and a recognizable cookie prefix", () => {
    expect(auth.options.advanced?.cookiePrefix).toBe("kaine");

    const generateId = auth.options.advanced?.database?.generateId;

    expect(generateId).toBeTypeOf("function");

    if (typeof generateId !== "function") {
      throw new Error("generateId must be a function");
    }

    const id = generateId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
