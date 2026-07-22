import { parse } from "graphql";
import { describe, expect, it } from "vitest";

import { measureQueryDepth, parseCorsOrigins, resolveApiRuntimeConfig } from "./server.config";

describe("server.config", () => {
  it("parses comma-separated cors origins", () => {
    expect(parseCorsOrigins(" https://app.example.com,https://admin.example.com , ,")).toEqual([
      "https://app.example.com",
      "https://admin.example.com"
    ]);
  });

  it("enables maskedErrors and disables exposed details in production", () => {
    const config = resolveApiRuntimeConfig({
      API_CORS_ORIGINS: "https://app.example.com",
      API_GRAPHQL_MAX_DEPTH: "4",
      NODE_ENV: "production"
    });

    expect(config).toMatchObject({
      exposeErrorDetails: false,
      isProduction: true,
      maskedErrors: true,
      maxQueryDepth: 4
    });
    expect(config.allowedCorsOrigins).toEqual(["https://app.example.com"]);
  });

  it("fails closed when production has no API_CORS_ORIGINS", () => {
    expect(() => resolveApiRuntimeConfig({ NODE_ENV: "production" })).toThrow(
      /API_CORS_ORIGINS is required in production/
    );
    expect(() =>
      resolveApiRuntimeConfig({ NODE_ENV: "production", API_CORS_ORIGINS: "  ,  " })
    ).toThrow(/API_CORS_ORIGINS is required in production/);
  });

  it("falls back to development-safe defaults", () => {
    const config = resolveApiRuntimeConfig({});

    expect(config).toMatchObject({
      exposeErrorDetails: true,
      isProduction: false,
      maskedErrors: false,
      maxQueryDepth: 8
    });
    expect(config.allowedCorsOrigins).toBeUndefined();
  });

  it("measures nested query depth", () => {
    const depth = measureQueryDepth(parse("query { todos { id } }"));

    expect(depth).toBe(2);
  });

  it("resolves fragment spreads when measuring depth", () => {
    const depth = measureQueryDepth(
      parse(`
        query TodosDepth {
          todos {
            ...TodoFields
          }
        }

        fragment TodoFields on Todo {
          id
        }
      `)
    );

    expect(depth).toBe(2);
  });
});
