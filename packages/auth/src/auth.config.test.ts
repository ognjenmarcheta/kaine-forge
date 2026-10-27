import { afterEach, describe, expect, it } from "vitest";

import {
  assertProductionAuthSecret,
  buildInvitationUrl,
  getClientAuthConfig,
  getServerAuthConfig
} from "./auth.config";

const originalEnv = {
  AUTH_REQUIRE_EMAIL_VERIFICATION: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  WEB_APP_URL: process.env.WEB_APP_URL
};

afterEach(() => {
  if (originalEnv.AUTH_REQUIRE_EMAIL_VERIFICATION === undefined) {
    delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
  } else {
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = originalEnv.AUTH_REQUIRE_EMAIL_VERIFICATION;
  }
  process.env.BETTER_AUTH_SECRET = originalEnv.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = originalEnv.BETTER_AUTH_URL;
  if (originalEnv.WEB_APP_URL === undefined) {
    delete process.env.WEB_APP_URL;
  } else {
    process.env.WEB_APP_URL = originalEnv.WEB_APP_URL;
  }
});

describe("auth.config", () => {
  it("uses defaults when env vars are missing", () => {
    delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.WEB_APP_URL;

    expect(getServerAuthConfig()).toEqual({
      baseUrl: "http://localhost:4000",
      requireEmailVerification: false,
      secret: "development-secret",
      webAppUrl: "http://localhost:3000"
    });
    expect(getClientAuthConfig()).toEqual({
      baseUrl: "http://localhost:4000"
    });
  });

  it("uses environment variables when present", () => {
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = "true";
    process.env.BETTER_AUTH_SECRET = "production-secret-value-with-enough-length";
    process.env.BETTER_AUTH_URL = "https://auth.example.com";
    process.env.WEB_APP_URL = "https://app.example.com";

    expect(getServerAuthConfig()).toEqual({
      baseUrl: "https://auth.example.com",
      requireEmailVerification: true,
      secret: "production-secret-value-with-enough-length",
      webAppUrl: "https://app.example.com"
    });
    expect(getClientAuthConfig()).toEqual({
      baseUrl: "https://auth.example.com"
    });
  });

  it("accepts strong secrets and rejects weak ones only in production", () => {
    expect(() => assertProductionAuthSecret("short", "development")).not.toThrow();

    expect(() => assertProductionAuthSecret(undefined, "production")).toThrow(
      /BETTER_AUTH_SECRET must be set/
    );
    expect(() => assertProductionAuthSecret("too-short", "production")).toThrow(/at least 32/);
    expect(() =>
      assertProductionAuthSecret("your-secret-key-change-in-production", "production")
    ).toThrow(/placeholder/);
    expect(() =>
      assertProductionAuthSecret("a-sufficiently-long-random-secret-value-here", "production")
    ).not.toThrow();
  });

  it("builds an absolute invitation URL on the web origin", () => {
    expect(buildInvitationUrl("https://app.example.com", "inv-1")).toBe(
      "https://app.example.com/invitations/inv-1"
    );
    expect(buildInvitationUrl("https://app.example.com/", "a/b")).toBe(
      "https://app.example.com/invitations/a%2Fb"
    );
  });
});
