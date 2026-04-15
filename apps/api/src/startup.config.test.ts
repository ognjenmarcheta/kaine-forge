import { describe, expect, it } from "vitest";

import { resolveApiStartupConfig } from "./startup.config";

describe("startup.config", () => {
  it("skips runtime migrations outside production by default", () => {
    expect(resolveApiStartupConfig({})).toEqual({
      runMigrations: false
    });
    expect(resolveApiStartupConfig({ NODE_ENV: "development" })).toEqual({
      runMigrations: false
    });
  });

  it("runs runtime migrations in production by default", () => {
    expect(resolveApiStartupConfig({ NODE_ENV: "production" })).toEqual({
      runMigrations: true
    });
  });

  it("allows API_RUN_MIGRATIONS to override the environment default", () => {
    expect(
      resolveApiStartupConfig({
        API_RUN_MIGRATIONS: "yes",
        NODE_ENV: "development"
      })
    ).toEqual({
      runMigrations: true
    });

    expect(
      resolveApiStartupConfig({
        API_RUN_MIGRATIONS: "0",
        NODE_ENV: "production"
      })
    ).toEqual({
      runMigrations: false
    });
  });
});
