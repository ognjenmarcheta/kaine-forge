import { describe, expect, it } from "vitest";

import { validateApiEnv } from "./env.config";

const validEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/db",
  BETTER_AUTH_SECRET: "secret"
};

describe("validateApiEnv", () => {
  it("names every missing required variable in a single error", () => {
    expect(() => validateApiEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateApiEnv({})).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects empty required values", () => {
    expect(() => validateApiEnv({ ...validEnv, BETTER_AUTH_SECRET: "" })).toThrow(
      /BETTER_AUTH_SECRET/
    );
  });

  it("applies defaults and coerces numeric values", () => {
    expect(validateApiEnv(validEnv).API_PORT).toBe(4000);
    expect(validateApiEnv({ ...validEnv, API_PORT: "5001" }).API_PORT).toBe(5001);
  });

  it("rejects a non-numeric port", () => {
    expect(() => validateApiEnv({ ...validEnv, API_PORT: "not-a-port" })).toThrow(/API_PORT/);
  });

  it("passes through optional values untouched", () => {
    const env = validateApiEnv({ ...validEnv, API_HOST: "0.0.0.0", LOG_LEVEL: "debug" });
    expect(env.API_HOST).toBe("0.0.0.0");
    expect(env.LOG_LEVEL).toBe("debug");
  });
});
