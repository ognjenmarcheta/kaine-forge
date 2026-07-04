import { describe, expect, it } from "vitest";

// The instance module imports @repo/db, whose client requires DATABASE_URL at
// import time (the pg Pool never connects during these tests). Set dummy env
// before the dynamic import so construction is exercised with explicit config.
process.env.DATABASE_URL ??= "postgresql://dummy:dummy@localhost:5432/dummy";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:4000";

const { AUTH_DEFINITIONS } = await import("./auth.definition");
const { hashPassword } = await import("./auth.password");
const { auth, createAuthInstance } = await import("./auth.instance");

describe("auth.instance", () => {
  it("constructs a better-auth instance without throwing", () => {
    expect(() => createAuthInstance()).not.toThrow();
    expect(auth.handler).toBeTypeOf("function");
    expect(auth.api).toBeDefined();
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

  it("registers the organization and bearer plugins", () => {
    const pluginIds = (auth.options.plugins ?? []).map((plugin) => plugin.id);

    expect(pluginIds).toContain("organization");
    expect(pluginIds).toContain("bearer");
  });

  it("mirrors the legacy session lifetimes and keeps rate limiting off", () => {
    expect(auth.options.session?.expiresIn).toBe(AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS);
    expect(auth.options.session?.updateAge).toBe(AUTH_DEFINITIONS.SESSION_UPDATE_AGE_SECONDS);
    expect(auth.options.rateLimit?.enabled).toBe(false);
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
