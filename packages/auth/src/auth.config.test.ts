import { afterEach, describe, expect, it } from "vitest";

import { getClientAuthConfig, getServerAuthConfig } from "./auth.config";

const originalEnv = {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL
};

afterEach(() => {
  process.env.BETTER_AUTH_SECRET = originalEnv.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = originalEnv.BETTER_AUTH_URL;
});

describe("auth.config", () => {
  it("uses defaults when env vars are missing", () => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;

    expect(getServerAuthConfig()).toEqual({
      baseUrl: "http://localhost:4000",
      secret: "development-secret"
    });
    expect(getClientAuthConfig()).toEqual({
      baseUrl: "http://localhost:4000"
    });
  });

  it("uses environment variables when present", () => {
    process.env.BETTER_AUTH_SECRET = "production-secret";
    process.env.BETTER_AUTH_URL = "https://auth.example.com";

    expect(getServerAuthConfig()).toEqual({
      baseUrl: "https://auth.example.com",
      secret: "production-secret"
    });
    expect(getClientAuthConfig()).toEqual({
      baseUrl: "https://auth.example.com"
    });
  });
});
