import { parse } from "graphql";
import { describe, expect, it } from "vitest";

import {
  measureQueryComplexity,
  measureQueryDepth,
  parseCorsOrigins,
  resolveApiRuntimeConfig
} from "./server.config";

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
      allowIntrospection: false,
      exposeErrorDetails: false,
      isProduction: true,
      maskedErrors: true,
      maxQueryComplexity: 200,
      maxQueryDepth: 4
    });
    expect(config.allowedCorsOrigins).toEqual(["https://app.example.com"]);
  });

  it("allows forcing introspection on in production via env", () => {
    const config = resolveApiRuntimeConfig({
      API_CORS_ORIGINS: "https://app.example.com",
      API_GRAPHQL_INTROSPECTION: "true",
      NODE_ENV: "production"
    });

    expect(config.allowIntrospection).toBe(true);
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
      allowIntrospection: true,
      exposeErrorDetails: true,
      isProduction: false,
      maskedErrors: false,
      maxQueryComplexity: 200,
      maxQueryDepth: 8
    });
    expect(config.allowedCorsOrigins).toBeUndefined();
  });

  it("measures nested query depth", () => {
    const depth = measureQueryDepth(parse("query { todos { id } }"));

    expect(depth).toBe(2);
  });

  it("measures query complexity as field selection count", () => {
    // todos + id + title = 3
    expect(measureQueryComplexity(parse("query { todos { id title } }"))).toBe(3);
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
