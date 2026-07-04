import { afterEach, describe, expect, it, vi } from "vitest";

// The instance module imports @repo/db, whose client requires DATABASE_URL at
// import time (the pg Pool never connects during these tests). Stub dummy env
// before the dynamic imports so construction is exercised with explicit config.
vi.stubEnv("DATABASE_URL", "postgresql://dummy:dummy@localhost:5432/dummy");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");

const { createAuthInstance, resolveSocialProviders } = await import("./auth.instance");

describe("resolveSocialProviders", () => {
  it("returns no providers when nothing is configured", () => {
    expect(resolveSocialProviders({})).toEqual({});
  });

  it("activates only the fully configured provider", () => {
    const providers = resolveSocialProviders({
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret"
    });

    expect(providers).toEqual({
      github: { clientId: "gh-id", clientSecret: "gh-secret" }
    });
  });

  it("activates both providers when both pairs are set", () => {
    const providers = resolveSocialProviders({
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret",
      GOOGLE_CLIENT_ID: "go-id",
      GOOGLE_CLIENT_SECRET: "go-secret"
    });

    expect(providers).toEqual({
      github: { clientId: "gh-id", clientSecret: "gh-secret" },
      google: { clientId: "go-id", clientSecret: "go-secret" }
    });
  });

  it("never half-activates a provider from a partial pair", () => {
    expect(resolveSocialProviders({ GITHUB_CLIENT_ID: "gh-id" })).toEqual({});
    expect(resolveSocialProviders({ GOOGLE_CLIENT_SECRET: "go-secret" })).toEqual({});
    expect(resolveSocialProviders({ GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "" })).toEqual(
      {}
    );
  });
});

describe("auth.instance social providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes configured providers on the instance options", () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");

    const instance = createAuthInstance();

    expect(instance.options.socialProviders).toEqual({
      github: { clientId: "gh-id", clientSecret: "gh-secret" }
    });
  });

  it("exposes no providers when the env pairs are absent", () => {
    vi.stubEnv("GITHUB_CLIENT_ID", undefined);
    vi.stubEnv("GITHUB_CLIENT_SECRET", undefined);
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", undefined);

    const instance = createAuthInstance();

    expect(instance.options.socialProviders).toEqual({});
  });
});
